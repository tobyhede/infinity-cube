//! What the SQLite tests share: a fresh file migrated from
//! `migrations-sql/sqlite/` by `sqlx`'s migrator, as `pnpm db:migrate:sqlite`
//! would leave it, and a connection to it outside any repository. Migrating
//! is test setup only: the repository never migrates.

use std::path::{Path, PathBuf};

use host::SqlitePath;
use sqlx::ConnectOptions;

/// A migrated file in a temporary directory of its own, removed with it.
pub struct Migrated {
    _directory: tempfile::TempDir,
    pub file: PathBuf,
}

impl Migrated {
    pub async fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("cube.db");
        migrate(&file).await;
        Self {
            _directory: directory,
            file,
        }
    }

    /// The file, as `SQLITE_PATH` would name it.
    pub fn path(&self) -> SqlitePath {
        SqlitePath::from_variable(self.file.to_str()).unwrap()
    }
}

/// Create `file` and migrate it, as `pnpm db:migrate:sqlite` would.
pub async fn migrate(file: &Path) {
    let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(file)
        .create_if_missing(true)
        .connect()
        .await
        .unwrap();
    let migrations = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations-sql/sqlite");
    sqlx::migrate::Migrator::new(migrations)
        .await
        .unwrap()
        .run(&mut connection)
        .await
        .unwrap();
    sqlx::Connection::close(connection).await.unwrap();
}

/// A connection of its own to `file`, outside any repository.
pub async fn connect(file: &Path) -> sqlx::SqliteConnection {
    sqlx::sqlite::SqliteConnectOptions::new()
        .filename(file)
        .connect()
        .await
        .unwrap()
}

/// Run `statement` on `file` through a connection of its own, answering the
/// first column of the first row it answers, if any.
pub async fn on_file(file: &Path, statement: &str) -> Option<String> {
    let mut connection = connect(file).await;
    let value: Option<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(statement.to_owned()))
        .fetch_optional(&mut connection)
        .await
        .unwrap();
    sqlx::Connection::close(connection).await.unwrap();
    value
}

/// Execute `statements` on `file` through a connection of its own.
pub async fn execute(file: &Path, statements: &str) {
    let mut connection = connect(file).await;
    sqlx::raw_sql(sqlx::AssertSqlSafe(statements.to_owned()))
        .execute(&mut connection)
        .await
        .unwrap();
    sqlx::Connection::close(connection).await.unwrap();
}

/// A connection holding `file`'s exclusive lock, as a second process on the
/// live file would, until it is dropped or rolled back.
pub async fn hold_exclusive_lock(file: &Path) -> sqlx::SqliteConnection {
    let mut connection = connect(file).await;
    sqlx::raw_sql("BEGIN EXCLUSIVE")
        .execute(&mut connection)
        .await
        .unwrap();
    connection
}
