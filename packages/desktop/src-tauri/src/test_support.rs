//! What the shell's tests share: a fresh copy of the tracked fixture, and
//! from `crates/http-conformance` the fixture's ids, the HTTP conformance
//! suite's stand-in build and a commit that renames a Space.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::{Path, PathBuf};

use tempfile::TempDir;

pub use http_conformance::support::rename_text;
pub use http_conformance::{META, META_ADDRESS};

/// The Meta Space's API address.
#[must_use]
pub fn meta_api() -> String {
    format!("/api/spaces/{META}")
}

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            let _bytes = std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// A fresh copy of `packages/app/fixture` in a directory of its own.
pub fn fixture_copy() -> (TempDir, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("space");
    copy_tree(&http_conformance::fixture(), &directory);
    (temporary, directory)
}

/// The suite's stand-in build, with a file beside it that is not in it.
pub fn stand_in_build(temporary: &TempDir) -> PathBuf {
    http_conformance::write_stand_in_build(temporary.path())
}

fn migrations(kind: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../migrations-sql")
        .join(kind)
}

/// A SQLite file at `file`, created and migrated from `migrations-sql/sqlite/`
/// by `sqlx`'s migrator, as `pnpm db:migrate:sqlite` would leave it. Test
/// setup only: the shell migrates nothing.
pub async fn migrated_sqlite_file(file: &Path) {
    use sqlx::ConnectOptions as _;
    let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(file)
        .create_if_missing(true)
        .connect()
        .await
        .unwrap();
    sqlx::migrate::Migrator::new(migrations("sqlite"))
        .await
        .unwrap()
        .run(&mut connection)
        .await
        .unwrap();
    sqlx::Connection::close(connection).await.unwrap();
}

/// The variable naming the PostgreSQL server the ignored tests run against,
/// as `crates/host/tests/postgres_support` names it.
pub const POSTGRES_SERVER: &str = "INFINITY_CUBE_POSTGRES_TEST_URL";

/// The server's URL, or a panic naming the variable, so a test run with
/// `--run-ignored only` and no server fails rather than testing nothing.
#[must_use]
pub fn postgres_server() -> url::Url {
    let value = std::env::var(POSTGRES_SERVER).unwrap_or_default();
    let trimmed = value.trim();
    assert!(
        !trimmed.is_empty(),
        "{POSTGRES_SERVER} must name a PostgreSQL server whose role may create databases"
    );
    url::Url::parse(trimmed).unwrap()
}

/// `server` naming `database`, with any `dbname` parameter dropped.
fn naming(server: &url::Url, database: &str) -> url::Url {
    let mut url = server.clone();
    let pairs: Vec<(String, String)> = server
        .query_pairs()
        .filter(|(name, _)| name != "dbname")
        .map(|(name, value)| (name.into_owned(), value.into_owned()))
        .collect();
    if pairs.is_empty() {
        url.set_query(None);
    } else {
        let _pairs = url.query_pairs_mut().clear().extend_pairs(pairs);
    }
    url.set_path(&format!("/{database}"));
    url
}

/// A PostgreSQL database of a test's own on [`postgres_server`], dropped by
/// [`FreshPostgres::drop_database`].
pub struct FreshPostgres {
    name: String,
    /// Its URL.
    pub url: url::Url,
}

impl FreshPostgres {
    /// A new database, migrated from `migrations-sql/postgres/` when
    /// `migrated`, holding no table otherwise.
    pub async fn new(migrated: bool) -> Self {
        use sqlx::Connection as _;
        let server = postgres_server();
        let name = format!("cube_desktop_{}", uuid::Uuid::new_v4().simple());
        let mut admin = sqlx::PgConnection::connect(server.as_str()).await.unwrap();
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!("CREATE DATABASE {name}")))
            .execute(&mut admin)
            .await
            .unwrap();
        admin.close().await.unwrap();
        let url = naming(&server, &name);
        if migrated {
            let mut connection = sqlx::PgConnection::connect(url.as_str()).await.unwrap();
            sqlx::migrate::Migrator::new(migrations("postgres"))
                .await
                .unwrap()
                .run(&mut connection)
                .await
                .unwrap();
            connection.close().await.unwrap();
        }
        Self { name, url }
    }

    /// Drop the database, and every connection still open to it.
    pub async fn drop_database(self) {
        use sqlx::Connection as _;
        let mut admin = sqlx::PgConnection::connect(postgres_server().as_str())
            .await
            .unwrap();
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS {} WITH (FORCE)",
            self.name
        )))
        .execute(&mut admin)
        .await
        .unwrap();
        admin.close().await.unwrap();
    }
}
