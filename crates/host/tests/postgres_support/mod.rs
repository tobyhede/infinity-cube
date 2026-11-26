//! What the PostgreSQL tests share: a database of their own per test, cloned
//! from one template that `sqlx`'s migrator migrated from
//! `migrations-sql/postgres/`, and dropped when the test ends.
//!
//! The server is the one `INFINITY_CUBE_POSTGRES_TEST_URL` names, whose role
//! may create databases. Every PostgreSQL test is `#[ignore]`d, so a plain
//! `cargo nextest run` skips them; CI runs them with `--run-ignored only`.
//! A test run that way with the variable unset **panics** rather than
//! returning early, so it fails instead of passing having tested nothing.
//! Migrating is test setup only: the repository never migrates.

pub mod stand_in;

use std::path::Path;
use std::sync::OnceLock;

use host::{DatabaseUrl, PoolSettings, PostgresSpaceRepository};
use sqlx::{Connection as _, PgConnection};

/// The variable naming the test server.
pub const SERVER: &str = "INFINITY_CUBE_POSTGRES_TEST_URL";

/// The server's URL, or a panic naming the variable.
#[must_use]
pub fn server() -> url::Url {
    let Ok(value) = std::env::var(SERVER) else {
        panic!("{SERVER} must name a PostgreSQL server whose role may create databases");
    };
    let trimmed = value.trim();
    assert!(
        !trimmed.is_empty(),
        "{SERVER} must name a PostgreSQL server whose role may create databases"
    );
    url::Url::parse(trimmed).unwrap()
}

/// `server` with its database replaced by `database`.
#[must_use]
pub fn naming(server: &url::Url, database: &str) -> url::Url {
    let mut url = server.clone();
    url.set_path(&format!("/{database}"));
    url
}

/// A connection to the server's own database, for creating and dropping.
async fn administer() -> PgConnection {
    PgConnection::connect(server().as_str()).await.unwrap()
}

/// The template's name: one per set of migrations, so a changed migration
/// gets a fresh template.
fn template_name() -> &'static str {
    static NAME: OnceLock<String> = OnceLock::new();
    NAME.get_or_init(|| {
        use sha2::Digest as _;
        let mut hash = sha2::Sha256::new();
        let mut files: Vec<_> = std::fs::read_dir(migrations())
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        files.sort();
        for file in files {
            hash.update(file.file_name().unwrap().as_encoded_bytes());
            hash.update(std::fs::read(&file).unwrap());
        }
        let digest = hash.finalize();
        let hex: String = digest[..6]
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        format!("cube_template_{hex}")
    })
}

fn migrations() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations-sql/postgres")
}

/// Migrate `url`'s database with `sqlx`'s migrator.
pub async fn migrate(url: &url::Url) {
    let mut connection = PgConnection::connect(url.as_str()).await.unwrap();
    sqlx::migrate::Migrator::new(migrations())
        .await
        .unwrap()
        .run(&mut connection)
        .await
        .unwrap();
    connection.close().await.unwrap();
}

/// Make sure the migrated template exists, creating it under an advisory
/// lock so test processes running at once create it once.
async fn ensure_template() {
    let mut admin = administer().await;
    sqlx::query("SELECT pg_advisory_lock(727272)")
        .execute(&mut admin)
        .await
        .unwrap();
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)")
            .bind(template_name())
            .fetch_one(&mut admin)
            .await
            .unwrap();
    if !exists {
        let building = format!("{}_building", template_name());
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS {building} WITH (FORCE)"
        )))
        .execute(&mut admin)
        .await
        .unwrap();
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!("CREATE DATABASE {building}")))
            .execute(&mut admin)
            .await
            .unwrap();
        migrate(&naming(&server(), &building)).await;
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "ALTER DATABASE {building} RENAME TO {}",
            template_name()
        )))
        .execute(&mut admin)
        .await
        .unwrap();
    }
    sqlx::query("SELECT pg_advisory_unlock(727272)")
        .execute(&mut admin)
        .await
        .unwrap();
    admin.close().await.unwrap();
}

/// A migrated database of its own, dropped when this is.
pub struct Fresh {
    pub name: String,
    pub url: url::Url,
}

impl Fresh {
    /// A new database cloned from the migrated template.
    pub async fn new() -> Self {
        Self::cloning(true).await
    }

    /// A new database holding no table at all: not migrated.
    pub async fn unmigrated() -> Self {
        Self::cloning(false).await
    }

    async fn cloning(migrated: bool) -> Self {
        if migrated {
            ensure_template().await;
        }
        let name = format!("cube_test_{}", uuid::Uuid::new_v4().simple());
        let statement = if migrated {
            format!("CREATE DATABASE {name} TEMPLATE {}", template_name())
        } else {
            format!("CREATE DATABASE {name}")
        };
        let mut admin = administer().await;
        // Two clones of one template at the same moment can meet as "being
        // accessed by other users" (55006); asking again succeeds.
        let mut attempts = 0;
        loop {
            match sqlx::raw_sql(sqlx::AssertSqlSafe(statement.clone()))
                .execute(&mut admin)
                .await
            {
                Ok(_) => break,
                Err(error) if attempts < 20 => {
                    attempts += 1;
                    let _ = error;
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                }
                Err(error) => panic!("could not create {name}: {error}"),
            }
        }
        admin.close().await.unwrap();
        let url = naming(&server(), &name);
        Self { name, url }
    }

    /// The database's URL, as `DATABASE_URL` would name it.
    #[must_use]
    pub fn database_url(&self) -> DatabaseUrl {
        DatabaseUrl::parse(Some(self.url.as_str())).unwrap()
    }

    /// The repository over this database, with the default pool.
    #[must_use]
    pub fn open(&self) -> PostgresSpaceRepository {
        PostgresSpaceRepository::open(&self.database_url()).unwrap()
    }

    /// The repository over this database, with the pool `settings` describes.
    #[must_use]
    pub fn open_with(&self, settings: PoolSettings) -> PostgresSpaceRepository {
        PostgresSpaceRepository::open_with(&self.database_url(), settings).unwrap()
    }

    /// A connection of its own to this database, outside any repository.
    pub async fn connect(&self) -> PgConnection {
        PgConnection::connect(self.url.as_str()).await.unwrap()
    }

    /// Execute `statements` through a connection of its own.
    pub async fn execute(&self, statements: &str) {
        let mut connection = self.connect().await;
        sqlx::raw_sql(sqlx::AssertSqlSafe(statements.to_owned()))
            .execute(&mut connection)
            .await
            .unwrap();
        connection.close().await.unwrap();
    }

    /// The first column of the first row `statement` answers, as text.
    pub async fn scalar(&self, statement: &str) -> Option<String> {
        let mut connection = self.connect().await;
        let value: Option<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(statement.to_owned()))
            .fetch_optional(&mut connection)
            .await
            .unwrap();
        connection.close().await.unwrap();
        value
    }
}

impl Drop for Fresh {
    fn drop(&mut self) {
        let name = self.name.clone();
        // Dropped on a thread of its own, since a test's runtime may be
        // ending; a database left behind by a failed drop is harmless.
        let _ = std::thread::spawn(move || {
            let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            else {
                return;
            };
            runtime.block_on(async move {
                if let Ok(mut admin) = PgConnection::connect(server().as_str()).await {
                    let _ = sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                        "DROP DATABASE IF EXISTS {name} WITH (FORCE)"
                    )))
                    .execute(&mut admin)
                    .await;
                    let _ = admin.close().await;
                }
            });
        })
        .join();
    }
}
