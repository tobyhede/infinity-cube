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

use std::path::PathBuf;
use std::time::Duration;

use intake::json::JsonValue;
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteConnection, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::{Pool, Row, Sqlite, Transaction};

use super::codec::{ResourceRow, SpaceRow};
use super::path::SqlitePath;
use super::{Access, LockMode, SqlSpaceRepository, SqlStore};
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
    path: PathBuf,
    // The file the path named when the repository first found it there,
    // which every operation after must find there still (ST-126).
    opened: std::sync::Mutex<Option<FileIdentity>>,
}

/// Which file a path names: its device and inode on Unix. Elsewhere every
/// file has the same identity, so only a deleted file is noticed: Windows
/// refuses to replace or delete a file SQLite holds open, and the standard
/// library's file index there is not yet stable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileIdentity {
    device: u64,
    inode: u64,
}

impl FileIdentity {
    #[cfg(unix)]
    fn of(metadata: &std::fs::Metadata) -> Self {
        use std::os::unix::fs::MetadataExt as _;
        Self {
            device: metadata.dev(),
            inode: metadata.ino(),
        }
    }

    #[cfg(not(unix))]
    fn of(_metadata: &std::fs::Metadata) -> Self {
        Self {
            device: 0,
            inode: 0,
        }
    }
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

impl SqliteStore {
    /// The statements over the file `path` names, opened lazily.
    pub(crate) fn at(path: &SqlitePath, busy_timeout: Duration) -> Self {
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
        Self {
            pool,
            path: path.as_path().to_path_buf(),
            opened: std::sync::Mutex::new(None),
        }
    }
}

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
    /// seconds on a lock another process holds. A second repository over the
    /// same file, in this process or another, is such a holder: the
    /// serialization ST-127 asks of one process is each repository's own. Nothing is opened until the
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
        Self::over(SqliteStore::at(path, busy_timeout))
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
        self.alone(async {
            if let Some(reason) = self.store().file_replaced() {
                return Err(RepositoryError::Unavailable(reason));
            }
            read.await.map_err(|error| self.store().classify(&error))
        })
        .await
    }

    /// Close the file once every operation under way has finished.
    pub async fn close(&self) {
        self.close_store().await;
    }
}

/// SQLite's primary result codes a failure is read by.
const SQLITE_BUSY: i64 = 5;
const SQLITE_LOCKED: i64 = 6;
const SQLITE_CANTOPEN: i64 = 14;

/// A row's document stored as something other than text, a BLOB among them,
/// which the TypeScript host also fails to read: broken stored state.
#[derive(Debug, thiserror::Error)]
#[error("stored {table} row {id} holds a document that is not text")]
struct NotText {
    table: &'static str,
    id: String,
}

/// A row's document, failing as [`NotText`] unless SQLite stores it as text.
fn document(row: &sqlx::sqlite::SqliteRow, table: &'static str) -> Result<String, sqlx::Error> {
    let stored_as: String = row.try_get("document_type")?;
    if stored_as != "text" {
        return Err(sqlx::Error::Decode(Box::new(NotText {
            table,
            id: row.try_get("id")?,
        })));
    }
    row.try_get("document")
}

fn space_row(row: &sqlx::sqlite::SqliteRow) -> Result<SpaceRow, sqlx::Error> {
    Ok(SpaceRow {
        id: row.try_get("id")?,
        document: document(row, "spaces")?,
        revision: row.try_get("revision")?,
        exported_revision: row.try_get("exported_revision")?,
    })
}

fn resource_row(row: &sqlx::sqlite::SqliteRow) -> Result<ResourceRow, sqlx::Error> {
    Ok(ResourceRow {
        id: row.try_get("id")?,
        space_id: row.try_get("space_id")?,
        document: document(row, "resources")?,
    })
}

/// When a row is written, as `temporal.updatedAt()` writes it.
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

impl SqlStore for SqliteStore {
    type Database = Sqlite;

    // SQLite has one writer, so the process runs one operation at a time
    // (ST-127).
    const SERIAL: bool = true;

    async fn begin(&self, access: Access) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
        match access {
            Access::Read | Access::Locked { writes: false } => self.pool.begin().await,
            // IMMEDIATE takes the write lock at once, so a file another
            // process holds fails here, before anything is read or written.
            Access::Write | Access::Locked { writes: true } => {
                self.pool.begin_with("BEGIN IMMEDIATE").await
            }
        }
    }

    async fn lock_aggregate(
        &self,
        _connection: &mut SqliteConnection,
        _mode: LockMode,
    ) -> Result<(), sqlx::Error> {
        // A writing transaction already holds the file's write lock from its
        // `BEGIN IMMEDIATE`, and a reading one its snapshot, behind the
        // process's one-at-a-time gate: nothing else to take.
        Ok(())
    }

    async fn relock_meta(
        &self,
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM repository_state \
             WHERE singleton_id = 1 AND meta_space_id = $1)",
        )
        .bind(id)
        .fetch_one(connection)
        .await
    }

    async fn lock_space(
        &self,
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        // The transaction's write lock already covers every row.
        sqlx::query_scalar("SELECT revision FROM spaces WHERE id = $1")
            .bind(id)
            .fetch_optional(connection)
            .await
    }

    async fn space_revisions(
        connection: &mut SqliteConnection,
    ) -> Result<Vec<(String, String)>, sqlx::Error> {
        sqlx::query_as("SELECT id, revision FROM spaces ORDER BY id")
            .fetch_all(connection)
            .await
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
            "SELECT id, document, typeof(document) AS document_type, revision, exported_revision \
             FROM spaces ORDER BY id",
        )
        .fetch_all(connection)
        .await?
        .iter()
        .map(space_row)
        .collect()
    }

    async fn holds_spaces(connection: &mut SqliteConnection) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM spaces)")
            .fetch_one(connection)
            .await
    }

    async fn space(
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<Option<SpaceRow>, sqlx::Error> {
        sqlx::query(
            "SELECT id, document, typeof(document) AS document_type, revision, exported_revision \
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
            "SELECT id, space_id, document, typeof(document) AS document_type FROM resources ORDER BY id",
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
            "SELECT id, space_id, document, typeof(document) AS document_type FROM resources \
             WHERE space_id = $1 ORDER BY id",
        )
        .bind(space_id)
        .fetch_all(connection)
        .await?
        .iter()
        .map(resource_row)
        .collect()
    }

    async fn insert_space(
        connection: &mut SqliteConnection,
        row: &SpaceRow,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO spaces (id, document, revision, exported_revision, updated_at) \
             VALUES ($1, $2, $3, $4, {NOW})"
        )))
        .bind(&row.id)
        .bind(&row.document)
        .bind(&row.revision)
        .bind(&row.exported_revision)
        .execute(connection)
        .await
        .map(drop)
    }

    async fn update_space(
        connection: &mut SqliteConnection,
        row: &SpaceRow,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE spaces SET document = $2, revision = $3, updated_at = {NOW} WHERE id = $1"
        )))
        .bind(&row.id)
        .bind(&row.document)
        .bind(&row.revision)
        .execute(connection)
        .await?;
        Ok(updated.rows_affected() > 0)
    }

    async fn delete_space(
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query("DELETE FROM resources WHERE space_id = $1")
            .bind(id)
            .execute(&mut *connection)
            .await?;
        let removed = sqlx::query("DELETE FROM spaces WHERE id = $1")
            .bind(id)
            .execute(connection)
            .await?;
        Ok(removed.rows_affected() > 0)
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
    ) -> Result<String, sqlx::Error> {
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "INSERT INTO resources (id, space_id, document, updated_at) VALUES ($1, $2, $3, {NOW}) \
             ON CONFLICT (id) DO UPDATE SET document = excluded.document, \
             updated_at = excluded.updated_at RETURNING space_id"
        )))
        .bind(&row.id)
        .bind(&row.space_id)
        .bind(&row.document)
        .fetch_one(connection)
        .await
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

    async fn tables(connection: &mut SqliteConnection) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT name FROM sqlite_schema WHERE type = 'table'")
            .fetch_all(connection)
            .await
    }

    fn file_replaced(&self) -> Option<String> {
        let found = match std::fs::metadata(&self.path) {
            Ok(metadata) => Some(FileIdentity::of(&metadata)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            // Asked again of SQLite, which answers why it cannot open it.
            Err(_) => return None,
        };
        let mut opened = self
            .opened
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match (*opened, found) {
            (None, found) => {
                *opened = found;
                None
            }
            (Some(_), None) => Some(format!(
                "the SQLite file {} was deleted after it was opened",
                self.path.display()
            )),
            (Some(before), Some(now)) if before != now => Some(format!(
                "the SQLite file {} was replaced after it was opened",
                self.path.display()
            )),
            (Some(_), Some(_)) => None,
        }
    }

    fn classify(&self, error: &sqlx::Error) -> RepositoryError {
        if let sqlx::Error::Decode(cause) = error
            && let Some(not_text) = cause.downcast_ref::<NotText>()
        {
            return RepositoryError::BrokenStoredState(not_text.to_string());
        }
        let unavailable = match error {
            sqlx::Error::Database(database) => database
                .code()
                .and_then(|code| code.parse::<i64>().ok())
                .is_some_and(|code| match code & 0xff {
                    SQLITE_BUSY | SQLITE_LOCKED => true,
                    // A file that does not exist is not answering yet; one
                    // that exists and still cannot be opened, a directory or
                    // a file this process may not read, is a defect.
                    SQLITE_CANTOPEN => !matches!(self.path.try_exists(), Ok(true)),
                    _ => false,
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

    async fn close(&self) {
        self.pool.close().await;
    }
}
