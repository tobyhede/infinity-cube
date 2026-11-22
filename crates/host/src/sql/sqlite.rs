//! SQLite's store of statements (`src/sqlite/sql-store.ts`), over the schema
//! `migrations-sql/sqlite/` and Prisma Next's `migrations-sqlite/` both
//! produce (Storage ST-125). It reads the rows the TypeScript host writes
//! (`tests/sqlite.rs` › `given_rows_the_typescript_host_wrote`) and writes
//! rows of the same shape (`given_rows_the_typescript_host_reads`).
//!
//! The file is opened as ST-128 says: the rollback journal in `delete` mode
//! and `synchronous=FULL`, set on every connection rather than left to the
//! driver. Nothing here migrates, and nothing creates a file that does not
//! exist: one that is missing answers as a store that is not answering, where
//! the TypeScript host's driver creates an empty file and then fails on its
//! missing tables.

use std::time::Duration;

use intake::json::JsonValue;
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteConnection, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::{Pool, Row, Sqlite, Transaction};

use super::codec::{ResourceRow, SpaceRow};
use super::path::SqlitePath;
use super::{SqlSpaceRepository, SqlStore};
use crate::assets::StoredAsset;
use crate::json_text::compact;
use crate::repository::RepositoryError;

/// How long an operation waits on a lock another process holds on the file
/// before it fails as unavailable (ST-127).
const DEFAULT_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

/// SQLite's statements: the store the SQL repository runs over for a SQLite
/// file. Built only by [`SqliteSpaceRepository::open`].
#[derive(Debug)]
pub struct SqliteStore {
    pool: Pool<Sqlite>,
}

/// The one SQL repository over a SQLite file.
///
/// # Examples
///
/// ```
/// use host::{AggregateLoad, SpaceRepository, SqlitePath, SqliteSpaceRepository};
///
/// # tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
/// let directory = std::env::temp_dir();
/// let path = SqlitePath::from_variable(directory.join("no-such-cube.db").to_str()).unwrap();
/// let store = SqliteSpaceRepository::open(&path);
/// // A file that does not exist is not created, and answers as unavailable.
/// assert!(store.load_aggregate().await.is_err());
/// store.close().await;
/// # });
/// ```
pub type SqliteSpaceRepository = SqlSpaceRepository<SqliteStore>;

/// The settings a repository's connection to its file has.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct ConnectionSettings {
    /// `PRAGMA journal_mode`, as SQLite names it: `delete`.
    pub journal_mode: String,
    /// `PRAGMA synchronous`, as SQLite numbers it: 2 is `FULL`.
    pub synchronous: i64,
}

impl SqlSpaceRepository<SqliteStore> {
    /// The repository over the file `path` names, waiting at most five
    /// seconds on a lock another process holds. Nothing is opened until the
    /// first operation, and every operation opens the file again if it
    /// failed to before (`tests/sqlite.rs` ›
    /// `opens_the_file_once_it_exists_after_failing_to`).
    #[must_use]
    pub fn open(path: &SqlitePath) -> Self {
        Self::open_with_busy_timeout(path, DEFAULT_BUSY_TIMEOUT)
    }

    /// [`open`](Self::open), waiting at most `busy_timeout` on a lock another
    /// process holds before an operation fails as unavailable.
    #[must_use]
    pub fn open_with_busy_timeout(path: &SqlitePath, busy_timeout: Duration) -> Self {
        let options = SqliteConnectOptions::new()
            .filename(path.as_path())
            .create_if_missing(false)
            .journal_mode(SqliteJournalMode::Delete)
            .synchronous(SqliteSynchronous::Full)
            .foreign_keys(true)
            .busy_timeout(busy_timeout);
        // One connection, kept: the repository runs one operation at a time,
        // and no maintenance task outlives a closed pool.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .min_connections(0)
            .idle_timeout(None)
            .max_lifetime(None)
            .connect_lazy_with(options);
        Self::over(SqliteStore { pool })
    }

    /// The settings the repository's own connection has, read through it.
    ///
    /// # Errors
    ///
    /// [`RepositoryError`]: the file could not be opened or read.
    pub async fn connection_settings(&self) -> Result<ConnectionSettings, RepositoryError> {
        let read = async {
            let mut connection = self.store().pool.acquire().await?;
            let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
                .fetch_one(&mut *connection)
                .await?;
            let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
                .fetch_one(&mut *connection)
                .await?;
            Ok::<_, sqlx::Error>(ConnectionSettings {
                journal_mode,
                synchronous,
            })
        };
        let _alone = self.serial.lock().await;
        read.await.map_err(|error| SqliteStore::classify(&error))
    }

    /// Close the file once every operation under way has finished.
    pub async fn close(&self) {
        let _alone = self.serial.lock().await;
        self.store().pool.close().await;
    }
}

/// SQLite's primary result codes a failure is read by.
const SQLITE_BUSY: i64 = 5;
const SQLITE_LOCKED: i64 = 6;
const SQLITE_CANTOPEN: i64 = 14;

fn space_row(row: &sqlx::sqlite::SqliteRow) -> Result<SpaceRow, sqlx::Error> {
    Ok(SpaceRow {
        id: row.try_get("id")?,
        document: row.try_get("document")?,
        revision: row.try_get("revision")?,
        exported_revision: row.try_get("exported_revision")?,
    })
}

fn resource_row(row: &sqlx::sqlite::SqliteRow) -> Result<ResourceRow, sqlx::Error> {
    Ok(ResourceRow {
        id: row.try_get("id")?,
        space_id: row.try_get("space_id")?,
        document: row.try_get("document")?,
    })
}

/// When a row is written, as `temporal.updatedAt()` writes it.
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

impl SqlStore for SqliteStore {
    type Database = Sqlite;

    async fn begin_read(&self) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
        self.pool.begin().await
    }

    async fn begin_write(&self) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
        // IMMEDIATE takes the write lock at once, so a file another process
        // holds fails here, before anything is read or written.
        self.pool.begin_with("BEGIN IMMEDIATE").await
    }

    async fn meta_space_id(
        connection: &mut SqliteConnection,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT meta_space_id FROM repository_state WHERE singleton_id = 1")
            .fetch_optional(connection)
            .await
    }

    async fn spaces(connection: &mut SqliteConnection) -> Result<Vec<SpaceRow>, sqlx::Error> {
        sqlx::query(
            "SELECT id, CAST(document AS TEXT) AS document, revision, exported_revision \
             FROM spaces ORDER BY id",
        )
        .fetch_all(connection)
        .await?
        .iter()
        .map(space_row)
        .collect()
    }

    async fn space(
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<Option<SpaceRow>, sqlx::Error> {
        sqlx::query(
            "SELECT id, CAST(document AS TEXT) AS document, revision, exported_revision \
             FROM spaces WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(connection)
        .await?
        .as_ref()
        .map(space_row)
        .transpose()
    }

    async fn resources(connection: &mut SqliteConnection) -> Result<Vec<ResourceRow>, sqlx::Error> {
        sqlx::query(
            "SELECT id, space_id, CAST(document AS TEXT) AS document FROM resources ORDER BY id",
        )
        .fetch_all(connection)
        .await?
        .iter()
        .map(resource_row)
        .collect()
    }

    async fn resources_of(
        connection: &mut SqliteConnection,
        space_id: &str,
    ) -> Result<Vec<ResourceRow>, sqlx::Error> {
        sqlx::query(
            "SELECT id, space_id, CAST(document AS TEXT) AS document FROM resources \
             WHERE space_id = $1 ORDER BY id",
        )
        .bind(space_id)
        .fetch_all(connection)
        .await?
        .iter()
        .map(resource_row)
        .collect()
    }

    async fn write_space(
        connection: &mut SqliteConnection,
        row: &SpaceRow,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO spaces (id, document, revision, exported_revision, updated_at) \
             VALUES ($1, $2, $3, $4, {NOW}) \
             ON CONFLICT (id) DO UPDATE SET document = excluded.document, \
             revision = excluded.revision, exported_revision = excluded.exported_revision, \
             updated_at = excluded.updated_at"
        )))
        .bind(&row.id)
        .bind(&row.document)
        .bind(&row.revision)
        .bind(&row.exported_revision)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn delete_space(connection: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
        for statement in [
            "DELETE FROM resources WHERE space_id = $1",
            "DELETE FROM spaces WHERE id = $1",
        ] {
            sqlx::query(statement)
                .bind(id)
                .execute(&mut *connection)
                .await?;
        }
        Ok(())
    }

    async fn delete_resources_except(
        connection: &mut SqliteConnection,
        space_id: &str,
        keep: &[&str],
    ) -> Result<(), sqlx::Error> {
        // The ids to keep go as one JSON array, so the statement is the same
        // however many there are.
        let keep = JsonValue::Array(
            keep.iter()
                .map(|id| JsonValue::String((*id).to_owned()))
                .collect(),
        );
        sqlx::query(
            "DELETE FROM resources WHERE space_id = $1 \
             AND id NOT IN (SELECT value FROM json_each($2))",
        )
        .bind(space_id)
        .bind(compact(&keep))
        .execute(connection)
        .await
        .map(drop)
    }

    async fn insert_resource(
        connection: &mut SqliteConnection,
        row: &ResourceRow,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO resources (id, space_id, document, updated_at) VALUES ($1, $2, $3, {NOW})"
        )))
        .bind(&row.id)
        .bind(&row.space_id)
        .bind(&row.document)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn upsert_resource(
        connection: &mut SqliteConnection,
        row: &ResourceRow,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO resources (id, space_id, document, updated_at) VALUES ($1, $2, $3, {NOW}) \
             ON CONFLICT (id) DO UPDATE SET document = excluded.document, \
             updated_at = excluded.updated_at"
        )))
        .bind(&row.id)
        .bind(&row.space_id)
        .bind(&row.document)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn clear(connection: &mut SqliteConnection) -> Result<(), sqlx::Error> {
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
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, $1)")
            .bind(id)
            .execute(connection)
            .await
            .map(drop)
    }

    async fn set_exported_revision(
        connection: &mut SqliteConnection,
        id: &str,
        revision: &str,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE spaces SET exported_revision = $2, updated_at = {NOW} WHERE id = $1"
        )))
        .bind(id)
        .bind(revision)
        .execute(connection)
        .await
        .map(|done| done.rows_affected() > 0)
    }

    async fn insert_asset(
        connection: &mut SqliteConnection,
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
        connection: &mut SqliteConnection,
        hash: &str,
    ) -> Result<Option<(String, Vec<u8>)>, sqlx::Error> {
        sqlx::query_as("SELECT media_type, bytes FROM assets WHERE hash = $1")
            .bind(hash)
            .fetch_optional(connection)
            .await
    }

    fn classify(error: &sqlx::Error) -> RepositoryError {
        let unavailable = match error {
            sqlx::Error::Database(database) => database
                .code()
                .and_then(|code| code.parse::<i64>().ok())
                .is_some_and(|code| {
                    matches!(code & 0xff, SQLITE_BUSY | SQLITE_LOCKED | SQLITE_CANTOPEN)
                }),
            sqlx::Error::Io(_)
            | sqlx::Error::PoolTimedOut
            | sqlx::Error::PoolClosed
            | sqlx::Error::WorkerCrashed => true,
            _ => false,
        };
        if unavailable {
            RepositoryError::Unavailable(error.to_string())
        } else {
            RepositoryError::Unclassified(error.to_string())
        }
    }
}
