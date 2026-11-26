//! PostgreSQL's store of statements (`src/prisma/sql-store.ts`), over the
//! schema `migrations-sql/postgres/` produces (Storage ST-125), as ADR 0177
//! decides it: the TypeScript aggregate lock's key and modes, `READ
//! COMMITTED` for every locking transaction and `REPEATABLE READ READ ONLY`
//! for every unlocked read, no lock or statement timeout, a pool of ten with
//! a two-second acquire timeout, failures classified by the TypeScript
//! SQLSTATE allowlist, and `sslmode` read with the meaning ADR 0177 gives it.
//! Nothing here migrates.

use std::str::FromStr as _;
use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgConnection, PgPoolOptions, PgSslMode};
use sqlx::{Pool, Postgres, Row, Transaction};

use super::codec::{ResourceRow, SpaceRow};
use super::database_url::DatabaseUrl;
use super::{Access, LockMode, SqlSpaceRepository, SqlStore};
use crate::assets::StoredAsset;
use crate::repository::RepositoryError;

/// The aggregate lock's key: InfinityCube's namespace and its singleton, the
/// TypeScript store's pair (`src/prisma/sql-store.ts`), so a TypeScript and a
/// Rust host on one database exclude each other.
pub const AGGREGATE_LOCK_KEY: (i32, i32) = (1_213_812_818, 1);

/// SQLSTATEs that may clear on asking again: the TypeScript allowlist
/// (`src/prisma/sql-store.ts`), exactly.
const UNREACHABLE_STATES: [&str; 12] = [
    "08000", "08001", "08003", "08004", "08006", "40001", "40P01", "53300", "55P03", "57P01",
    "57P02", "57P03",
];

/// A table the statements need is missing: the database is not migrated.
const UNDEFINED_TABLE: &str = "42P01";

/// PostgreSQL's statements: the store the SQL repository runs over for a
/// PostgreSQL database. Built only by [`PostgresSpaceRepository::open`].
#[derive(Debug)]
pub struct PostgresStore {
    pool: Pool<Postgres>,
}

/// The one SQL repository over a PostgreSQL database.
pub type PostgresSpaceRepository = SqlSpaceRepository<PostgresStore>;

/// How the repository's pool is sized (ADR 0177).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PoolSettings {
    /// The most connections open at once.
    pub max_connections: u32,
    /// How long an operation waits for a connection before it is Unreachable.
    pub acquire_timeout: Duration,
}

impl Default for PoolSettings {
    fn default() -> Self {
        Self {
            max_connections: 10,
            acquire_timeout: Duration::from_secs(2),
        }
    }
}

/// Why a database URL cannot be connected to.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PostgresUrlError {
    /// It is not a URL `sqlx` reads.
    #[error("DATABASE_URL is not a PostgreSQL URL: {0}")]
    Invalid(String),
    /// `sslmode=verify-ca` under `uselibpqcompat` names no root certificate,
    /// which ADR 0177 refuses.
    #[error("DATABASE_URL's sslmode=verify-ca needs sslrootcert to name a CA certificate")]
    VerifyCaWithoutRoot,
}

impl SqlSpaceRepository<PostgresStore> {
    /// The repository over the database `url` names, with the default pool.
    /// Nothing is connected until the first operation.
    ///
    /// # Errors
    ///
    /// [`PostgresUrlError`] when `url` cannot be connected to as written.
    pub fn open(url: &DatabaseUrl) -> Result<Self, PostgresUrlError> {
        Self::open_with(url, PoolSettings::default())
    }

    /// [`open`](Self::open), with the pool `settings` describes.
    ///
    /// # Errors
    ///
    /// [`PostgresUrlError`] when `url` cannot be connected to as written.
    pub fn open_with(url: &DatabaseUrl, settings: PoolSettings) -> Result<Self, PostgresUrlError> {
        let options = connect_options(url.as_str())?;
        let pool = PgPoolOptions::new()
            .max_connections(settings.max_connections)
            .min_connections(0)
            .acquire_timeout(settings.acquire_timeout)
            .connect_lazy_with(options);
        Ok(Self::over(PostgresStore { pool }))
    }

    /// Close every connection once every operation under way has finished.
    pub async fn close(&self) {
        self.close_store().await;
    }
}

/// The options `url` connects with, its `sslmode` read with the meaning ADR
/// 0177 gives each value:
///
/// - no `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `ssl=true` or `ssl=1`:
///   no TLS;
/// - `disable`: no TLS;
/// - `no-verify`: TLS, the certificate not checked;
/// - under `uselibpqcompat=true`, libpq's meanings, except that `prefer`
///   never falls back to plaintext: `prefer` and `require` encrypt without
///   checking, `require` with `sslrootcert` checks the CA, `verify-ca` checks
///   the CA and needs `sslrootcert`, and `verify-full` checks the host too;
/// - any other value, or TLS asked for by a certificate parameter, `ssl=true`
///   or `ssl=1`: TLS, the certificate and the host checked.
///
/// # Errors
///
/// [`PostgresUrlError`] when `url` is not one `sqlx` reads, or asks for
/// `verify-ca` under `uselibpqcompat` with no root certificate.
pub fn connect_options(url: &str) -> Result<PgConnectOptions, PostgresUrlError> {
    let invalid = |reason: String| PostgresUrlError::Invalid(reason);
    let mut parsed = url::Url::parse(url).map_err(|error| invalid(error.to_string()))?;
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    let value = |name: &str| {
        pairs
            .iter()
            .rev()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    };
    let libpq = value("uselibpqcompat") == Some("true");
    let root = value("sslrootcert").is_some();
    let asks_tls = root
        || value("sslcert").is_some()
        || value("sslkey").is_some()
        || matches!(value("ssl"), Some("true" | "1"));
    let mode = match (value("sslmode"), libpq) {
        (None, _) if !asks_tls => PgSslMode::Disable,
        (Some("disable"), _) => PgSslMode::Disable,
        (Some("no-verify"), false) => PgSslMode::Require,
        (Some("prefer"), true) => PgSslMode::Require,
        (Some("require"), true) if root => PgSslMode::VerifyCa,
        (Some("require"), true) => PgSslMode::Require,
        (Some("verify-ca"), true) if root => PgSslMode::VerifyCa,
        (Some("verify-ca"), true) => return Err(PostgresUrlError::VerifyCaWithoutRoot),
        _ => PgSslMode::VerifyFull,
    };
    let kept: Vec<(String, String)> = pairs
        .iter()
        .filter(|(key, _)| !matches!(key.as_str(), "sslmode" | "uselibpqcompat" | "ssl"))
        .cloned()
        .collect();
    if kept.is_empty() {
        parsed.set_query(None);
    } else {
        parsed.query_pairs_mut().clear().extend_pairs(kept);
    }
    let options =
        PgConnectOptions::from_str(parsed.as_str()).map_err(|error| invalid(error.to_string()))?;
    Ok(options.ssl_mode(mode))
}

/// What a PostgreSQL failure means to a caller (ADR 0177): Unreachable for
/// the TypeScript SQLSTATE allowlist, a socket failure and a pool that timed
/// out or closed; an Invariant failure for a missing table; Unclassified for
/// everything else.
#[must_use]
pub fn classify(error: &sqlx::Error) -> RepositoryError {
    let code = error
        .as_database_error()
        .and_then(|database| database.code().map(|code| code.into_owned()));
    if code.as_deref() == Some(UNDEFINED_TABLE) {
        return RepositoryError::BrokenStoredState(error.to_string());
    }
    let unreachable = match error {
        sqlx::Error::Database(_) => code
            .as_deref()
            .is_some_and(|code| UNREACHABLE_STATES.contains(&code)),
        sqlx::Error::Io(io) => matches!(
            io.kind(),
            std::io::ErrorKind::ConnectionRefused
                | std::io::ErrorKind::ConnectionReset
                | std::io::ErrorKind::ConnectionAborted
                | std::io::ErrorKind::NotConnected
                | std::io::ErrorKind::BrokenPipe
                | std::io::ErrorKind::UnexpectedEof
                | std::io::ErrorKind::TimedOut
                | std::io::ErrorKind::HostUnreachable
                | std::io::ErrorKind::NetworkUnreachable
        ),
        sqlx::Error::PoolTimedOut | sqlx::Error::PoolClosed => true,
        _ => false,
    };
    // The SQLSTATE goes with the words, which `sqlx` leaves out.
    let described = match &code {
        Some(code) => format!("{error} (SQLSTATE {code})"),
        None => error.to_string(),
    };
    if unreachable {
        RepositoryError::Unavailable(described)
    } else {
        RepositoryError::Unclassified(described)
    }
}

fn space_row(row: &sqlx::postgres::PgRow) -> Result<SpaceRow, sqlx::Error> {
    Ok(SpaceRow {
        id: row.try_get("id")?,
        document: row.try_get("document")?,
        revision: row.try_get("revision")?,
        exported_revision: row.try_get("exported_revision")?,
    })
}

fn resource_row(row: &sqlx::postgres::PgRow) -> Result<ResourceRow, sqlx::Error> {
    Ok(ResourceRow {
        id: row.try_get("id")?,
        space_id: row.try_get("space_id")?,
        document: row.try_get("document")?,
    })
}

const SPACE_COLUMNS: &str =
    "id::text AS id, document::text AS document, revision, exported_revision";
const RESOURCE_COLUMNS: &str =
    "id::text AS id, space_id::text AS space_id, document::text AS document";

impl SqlStore for PostgresStore {
    type Database = Postgres;

    // The advisory lock and row locks order operations across processes, so
    // none is serialised in this one.
    const SERIAL: bool = false;

    async fn begin(&self, access: Access) -> Result<Transaction<'static, Postgres>, sqlx::Error> {
        // The isolation level is set, never inherited from the server's
        // default, and must be the transaction's first statement.
        let statement = match access {
            Access::Read => "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
            Access::Write | Access::Locked { .. } => "BEGIN ISOLATION LEVEL READ COMMITTED",
        };
        self.pool.begin_with(statement).await
    }

    async fn lock_aggregate(
        &self,
        connection: &mut PgConnection,
        mode: LockMode,
    ) -> Result<(), sqlx::Error> {
        let statement = match mode {
            LockMode::Exclusive => "SELECT pg_advisory_xact_lock($1, $2)::text",
            LockMode::Shared => "SELECT pg_advisory_xact_lock_shared($1, $2)::text",
        };
        sqlx::query(statement)
            .bind(AGGREGATE_LOCK_KEY.0)
            .bind(AGGREGATE_LOCK_KEY.1)
            .execute(connection)
            .await
            .map(drop)
    }

    async fn relock_meta(
        &self,
        connection: &mut PgConnection,
        id: &str,
    ) -> Result<bool, sqlx::Error> {
        let locked = sqlx::query(
            "SELECT 1 FROM repository_state \
             WHERE singleton_id = 1 AND meta_space_id = $1::uuid FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(connection)
        .await?;
        Ok(locked.is_some())
    }

    async fn lock_space(
        &self,
        connection: &mut PgConnection,
        id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        // Under READ COMMITTED, a row lock that waited answers the row as the
        // holder left it: the revision it carried when the lock was granted.
        sqlx::query_scalar("SELECT revision FROM spaces WHERE id = $1::uuid FOR UPDATE")
            .bind(id)
            .fetch_optional(connection)
            .await
    }

    async fn space_revisions(
        connection: &mut PgConnection,
    ) -> Result<Vec<(String, String)>, sqlx::Error> {
        sqlx::query_as("SELECT id::text, revision FROM spaces ORDER BY id")
            .fetch_all(connection)
            .await
    }

    async fn meta_space_id(connection: &mut PgConnection) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT meta_space_id::text FROM repository_state WHERE singleton_id = 1",
        )
        .fetch_optional(connection)
        .await
    }

    async fn spaces(connection: &mut PgConnection) -> Result<Vec<SpaceRow>, sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT {SPACE_COLUMNS} FROM spaces ORDER BY id"
        )))
        .fetch_all(connection)
        .await?
        .iter()
        .map(space_row)
        .collect()
    }

    async fn holds_spaces(connection: &mut PgConnection) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM spaces)")
            .fetch_one(connection)
            .await
    }

    async fn space(
        connection: &mut PgConnection,
        id: &str,
    ) -> Result<Option<SpaceRow>, sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT {SPACE_COLUMNS} FROM spaces WHERE id = $1::uuid"
        )))
        .bind(id)
        .fetch_optional(connection)
        .await?
        .as_ref()
        .map(space_row)
        .transpose()
    }

    async fn resources(connection: &mut PgConnection) -> Result<Vec<ResourceRow>, sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT {RESOURCE_COLUMNS} FROM resources ORDER BY id"
        )))
        .fetch_all(connection)
        .await?
        .iter()
        .map(resource_row)
        .collect()
    }

    async fn resources_of(
        connection: &mut PgConnection,
        space_id: &str,
    ) -> Result<Vec<ResourceRow>, sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT {RESOURCE_COLUMNS} FROM resources WHERE space_id = $1::uuid ORDER BY id"
        )))
        .bind(space_id)
        .fetch_all(connection)
        .await?
        .iter()
        .map(resource_row)
        .collect()
    }

    async fn insert_space(
        connection: &mut PgConnection,
        row: &SpaceRow,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO spaces (id, document, revision, exported_revision, updated_at) \
             VALUES ($1::uuid, $2::jsonb, $3, $4, now())",
        )
        .bind(&row.id)
        .bind(&row.document)
        .bind(&row.revision)
        .bind(&row.exported_revision)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn update_space(
        connection: &mut PgConnection,
        row: &SpaceRow,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query(
            "UPDATE spaces SET document = $2::jsonb, revision = $3, updated_at = now() \
             WHERE id = $1::uuid",
        )
        .bind(&row.id)
        .bind(&row.document)
        .bind(&row.revision)
        .execute(connection)
        .await?;
        Ok(updated.rows_affected() > 0)
    }

    async fn delete_space(connection: &mut PgConnection, id: &str) -> Result<bool, sqlx::Error> {
        sqlx::query("DELETE FROM resources WHERE space_id = $1::uuid")
            .bind(id)
            .execute(&mut *connection)
            .await?;
        let removed = sqlx::query("DELETE FROM spaces WHERE id = $1::uuid")
            .bind(id)
            .execute(connection)
            .await?;
        Ok(removed.rows_affected() > 0)
    }

    async fn delete_resources_except(
        connection: &mut PgConnection,
        space_id: &str,
        keep: &[&str],
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM resources WHERE space_id = $1::uuid AND NOT (id::text = ANY($2))")
            .bind(space_id)
            .bind(keep)
            .execute(connection)
            .await
            .map(drop)
    }

    async fn insert_resource(
        connection: &mut PgConnection,
        row: &ResourceRow,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO resources (id, space_id, document, updated_at) \
             VALUES ($1::uuid, $2::uuid, $3::jsonb, now())",
        )
        .bind(&row.id)
        .bind(&row.space_id)
        .bind(&row.document)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn upsert_resource(
        connection: &mut PgConnection,
        row: &ResourceRow,
    ) -> Result<String, sqlx::Error> {
        sqlx::query_scalar(
            "INSERT INTO resources (id, space_id, document, updated_at) \
             VALUES ($1::uuid, $2::uuid, $3::jsonb, now()) \
             ON CONFLICT (id) DO UPDATE SET document = excluded.document, \
             updated_at = excluded.updated_at RETURNING space_id::text",
        )
        .bind(&row.id)
        .bind(&row.space_id)
        .bind(&row.document)
        .fetch_one(connection)
        .await
    }

    async fn clear(connection: &mut PgConnection) -> Result<(), sqlx::Error> {
        // The Meta identity restricts deleting its Space, so it goes first.
        for statement in [
            "DELETE FROM repository_state",
            "DELETE FROM resources",
            "DELETE FROM spaces",
        ] {
            sqlx::query(statement).execute(&mut *connection).await?;
        }
        Ok(())
    }

    async fn insert_meta_space_id(
        connection: &mut PgConnection,
        id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, $1::uuid)",
        )
        .bind(id)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn set_exported_revision(
        connection: &mut PgConnection,
        id: &str,
        revision: &str,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query(
            "UPDATE spaces SET exported_revision = $2, updated_at = now() WHERE id = $1::uuid",
        )
        .bind(id)
        .bind(revision)
        .execute(connection)
        .await
        .map(|done| done.rows_affected() > 0)
    }

    async fn insert_asset(
        connection: &mut PgConnection,
        asset: &StoredAsset,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query(
            "INSERT INTO assets (hash, media_type, bytes) VALUES ($1, $2, $3) \
             ON CONFLICT (hash) DO NOTHING",
        )
        .bind(asset.hash.as_str())
        .bind(&asset.media_type)
        .bind(asset.bytes.as_ref())
        .execute(connection)
        .await
        .map(|done| done.rows_affected() > 0)
    }

    async fn asset(
        connection: &mut PgConnection,
        hash: &str,
    ) -> Result<Option<(String, Vec<u8>)>, sqlx::Error> {
        sqlx::query_as("SELECT media_type, bytes FROM assets WHERE hash = $1")
            .bind(hash)
            .fetch_optional(connection)
            .await
    }

    async fn tables(connection: &mut PgConnection) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT table_name::text FROM information_schema.tables \
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        )
        .fetch_all(connection)
        .await
    }

    fn file_replaced(&self) -> Option<String> {
        None
    }

    fn classify(&self, error: &sqlx::Error) -> RepositoryError {
        classify(error)
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}

#[cfg(test)]
mod tests;
