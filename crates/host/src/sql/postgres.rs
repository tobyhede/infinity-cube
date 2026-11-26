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
use super::{Access, LockMode, RevisionRow, SqlSpaceRepository, SqlStore};
use crate::assets::StoredAsset;
use crate::repository::RepositoryError;

/// The aggregate lock's key: InfinityCube's namespace and its singleton, the
/// TypeScript store's pair (`src/prisma/sql-store.ts`, held by
/// `is_the_key_the_typescript_store_names_in_each_mode` in
/// `tests/postgres_concurrency.rs`), so a TypeScript and a Rust host on one
/// database exclude each other.
pub const AGGREGATE_LOCK_KEY: (i32, i32) = (1_213_812_818, 1);

/// SQLSTATEs that may clear on asking again: the TypeScript allowlist
/// (`UNAVAILABLE_SQLSTATES` in `src/prisma/sql-store.ts`), exactly, held by
/// `names_the_set_the_typescript_store_names`.
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
    /// It is not a `postgres:` or `postgresql:` URL `sqlx` reads.
    #[error("DATABASE_URL is not a PostgreSQL URL: {0}")]
    Invalid(String),
    /// It names a CA file (`sslrootcert`, or `sqlx`'s `ssl-root-cert` or
    /// `ssl-ca`), which `sqlx` would add to the system's trusted roots rather
    /// than trust alone, as `pg` does (ADR 0177).
    #[error(
        "DATABASE_URL's {0} is refused: sqlx would add the CA it names to the system's trusted CAs rather than trust it alone; install the CA in the system's trust store and use sslmode=verify-full"
    )]
    RootCertificate(String),
    /// `sslmode=verify-ca` under `uselibpqcompat`, which needs the
    /// `sslrootcert` that is itself refused (ADR 0177).
    #[error(
        "DATABASE_URL's sslmode=verify-ca under uselibpqcompat=true is refused: it needs sslrootcert, which is refused; use sslmode=verify-full"
    )]
    VerifyCa,
    /// `sslnegotiation=direct`, which `sqlx` cannot do: it always asks for
    /// TLS with an `SSLRequest` first (ADR 0177).
    #[error(
        "DATABASE_URL's sslnegotiation=direct is refused: sqlx always negotiates TLS through PostgreSQL's SSLRequest and cannot start TLS directly"
    )]
    DirectNegotiation,
}

/// The parameters `sqlx` reads as a CA file: `pg`'s, and `sqlx`'s own two
/// aliases, which `pg` ignores.
const ROOT_CERTIFICATE_PARAMETERS: [&str; 3] = ["sslrootcert", "ssl-root-cert", "ssl-ca"];

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

    /// [`open`](Self::open), with the pool `settings` describes. `PGSSLMODE`
    /// is read here, once, for a URL that names no TLS setting.
    ///
    /// # Errors
    ///
    /// [`PostgresUrlError`] when `url` cannot be connected to as written.
    pub fn open_with(url: &DatabaseUrl, settings: PoolSettings) -> Result<Self, PostgresUrlError> {
        let pgsslmode = std::env::var("PGSSLMODE").ok();
        let options = connect_options(url.as_str(), pgsslmode.as_deref())?;
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
/// 0177 gives each value, as `pg` 8.22 reads it:
///
/// - no `sslmode`, `sslcert`, `sslkey` or `ssl` parameter: what `pgsslmode`,
///   the value of `PGSSLMODE`, asks for: no TLS when it is absent, `disable`
///   or a value `pg` does not know; TLS, the certificate not checked, for
///   `no-verify`; and TLS, the certificate and the host checked, for
///   `prefer`, `require`, `verify-ca` and `verify-full`;
/// - no `sslmode`: TLS, the certificate and the host checked, for a
///   certificate parameter; otherwise, by `ssl`: no TLS for `0` or an empty
///   value, TLS with the certificate not checked for `no-verify`, and TLS
///   with the certificate and the host checked for any other value;
/// - `sslmode=disable`: no TLS;
/// - `sslmode=no-verify`, without `uselibpqcompat=true`: TLS, the
///   certificate not checked;
/// - under `uselibpqcompat=true`, libpq's meanings, except that `prefer`
///   never falls back to plaintext: `prefer` and `require` encrypt without
///   checking, `verify-ca` is refused, and `verify-full` checks the host
///   too; `no-verify`, which libpq does not have, checks as `verify-full`
///   does;
/// - any other `sslmode`: TLS, the certificate and the host checked.
///
/// A CA file is never trusted alone, so a non-empty `sslrootcert`,
/// `ssl-root-cert` or `ssl-ca` is refused, an empty one is read as absent,
/// as `pg` reads it, and `PGSSLROOTCERT`, which `pg` ignores, is ignored:
/// a certificate is checked against the system's trusted CAs only.
/// `sslnegotiation=direct` is refused; any other `sslnegotiation` is left
/// out, PostgreSQL's own negotiation being the only one `sqlx` does.
///
/// Where the URL is silent, the other connection settings come from `PG*`
/// variables and the password file, as `sqlx` reads them.
///
/// # Errors
///
/// [`PostgresUrlError`] when `url` is not a `postgres:` or `postgresql:` URL
/// `sqlx` reads, names a CA file, asks for `sslnegotiation=direct`, or asks
/// for `verify-ca` under `uselibpqcompat`.
pub fn connect_options(
    url: &str,
    pgsslmode: Option<&str>,
) -> Result<PgConnectOptions, PostgresUrlError> {
    let invalid = |reason: String| PostgresUrlError::Invalid(reason);
    let mut parsed = url::Url::parse(url).map_err(|error| invalid(error.to_string()))?;
    if !matches!(parsed.scheme(), "postgres" | "postgresql") {
        return Err(invalid(format!(
            "its scheme is {}, not postgres or postgresql",
            parsed.scheme()
        )));
    }
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
    // Every value, not only the last, since `sqlx` applies each in turn.
    if let Some((key, _)) = pairs.iter().find(|(key, value)| {
        ROOT_CERTIFICATE_PARAMETERS.contains(&key.as_str()) && !value.is_empty()
    }) {
        return Err(PostgresUrlError::RootCertificate(key.clone()));
    }
    if value("sslnegotiation") == Some("direct") {
        return Err(PostgresUrlError::DirectNegotiation);
    }
    let libpq = value("uselibpqcompat") == Some("true");
    let certificate = value("sslcert").is_some() || value("sslkey").is_some();
    let mode = match (value("sslmode"), libpq) {
        (None, _) if certificate => PgSslMode::VerifyFull,
        (None, _) => match value("ssl") {
            None => environment_mode(pgsslmode),
            Some("0" | "") => PgSslMode::Disable,
            Some("no-verify") => PgSslMode::Require,
            Some(_) => PgSslMode::VerifyFull,
        },
        (Some("disable"), _) => PgSslMode::Disable,
        (Some("no-verify"), false) => PgSslMode::Require,
        (Some("prefer"), true) => PgSslMode::Require,
        (Some("require"), true) => PgSslMode::Require,
        (Some("verify-ca"), true) => return Err(PostgresUrlError::VerifyCa),
        _ => PgSslMode::VerifyFull,
    };
    let kept: Vec<(String, String)> = pairs
        .iter()
        .filter(|(key, _)| {
            !matches!(
                key.as_str(),
                "sslmode" | "uselibpqcompat" | "ssl" | "sslnegotiation"
            ) && !ROOT_CERTIFICATE_PARAMETERS.contains(&key.as_str())
        })
        .cloned()
        .collect();
    if kept.is_empty() {
        parsed.set_query(None);
    } else {
        parsed.query_pairs_mut().clear().extend_pairs(kept);
    }
    let options =
        PgConnectOptions::from_str(parsed.as_str()).map_err(|error| invalid(error.to_string()))?;
    // `sqlx` takes `PGSSLROOTCERT` as a CA file and has no way to unset
    // one, so an empty PEM, which adds no CA, replaces it.
    Ok(options.ssl_mode(mode).ssl_root_cert_from_pem(Vec::new()))
}

/// What `PGSSLMODE` asks for when the URL names no TLS setting, as `pg`
/// 8.22's `readSSLConfigFromEnvironment` reads it, whether or not the URL
/// names `uselibpqcompat`.
fn environment_mode(pgsslmode: Option<&str>) -> PgSslMode {
    match pgsslmode {
        Some("prefer" | "require" | "verify-ca" | "verify-full") => PgSslMode::VerifyFull,
        Some("no-verify") => PgSslMode::Require,
        _ => PgSslMode::Disable,
    }
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
        id: &[u8],
    ) -> Result<Option<Vec<u8>>, sqlx::Error> {
        // Under READ COMMITTED, a row lock that waited answers the row as the
        // holder left it: the revision it carried when the lock was granted.
        sqlx::query_scalar(
            "SELECT convert_to(revision, 'UTF8') FROM spaces \
             WHERE id = convert_from($1, 'UTF8')::uuid FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(connection)
        .await
    }

    async fn hold_space(&self, connection: &mut PgConnection, id: &str) -> Result<(), sqlx::Error> {
        // `FOR UPDATE`, not `FOR SHARE`: the write that may follow locks the
        // row for update, and two holders of a share lock each waiting to
        // upgrade it would deadlock.
        sqlx::query("SELECT 1 FROM spaces WHERE id = $1::uuid FOR UPDATE")
            .bind(id)
            .execute(connection)
            .await
            .map(drop)
    }

    async fn space_revisions(
        connection: &mut PgConnection,
    ) -> Result<Vec<RevisionRow>, sqlx::Error> {
        sqlx::query_as(
            "SELECT convert_to(id::text, 'UTF8'), convert_to(revision, 'UTF8') \
             FROM spaces ORDER BY id",
        )
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
        // Each name resolved as the statements resolve it, through the
        // role's `search_path` and whatever the role may do with the table,
        // so a role granted nothing meets the server's own refusal.
        sqlx::query_scalar(
            "SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NOT NULL",
        )
        .bind(super::TABLES.as_slice())
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
