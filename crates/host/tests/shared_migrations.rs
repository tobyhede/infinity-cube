//! The shared plain-SQL migrations (`migrations-sql/`, ADR 0155), applied by
//! sqlx's migrator, produce the schema Prisma Next produces from its own
//! migration packages (`migrations/`, `migrations-sqlite/`). That each package
//! executes its file's statements is `test/unit/shared-migrations.test.ts`.
//!
//! Both tests run Prisma Next through `pnpm`, so they need the repository's
//! `node_modules`, and the PostgreSQL one a server; they are ignored by default
//! and CI's `rust` job runs them (`--run-ignored only`). The PostgreSQL test
//! reads `INFINITY_CUBE_MIGRATIONS_DATABASE_URL`, naming a database on a server
//! where its role may create and drop databases.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;

use sqlx::migrate::Migrator;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{AssertSqlSafe, ConnectOptions, Connection, PgConnection};

/// The variable naming the PostgreSQL server the PostgreSQL test uses.
const DATABASE_URL_VARIABLE: &str = "INFINITY_CUBE_MIGRATIONS_DATABASE_URL";

/// The tables sqlx keeps its own record of applied migrations in.
const SQLX_TABLES: &[&str] = &["_sqlx_migrations"];

fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// Runs `prisma-next migrate` with `config`, the variable `config` reads
/// naming the database as `database`.
fn prisma_migrate(config: &str, variable: &str, database: &str) {
    let output = Command::new("pnpm")
        .args(["exec", "prisma-next", "migrate", "--config", config])
        .env(variable, database)
        .current_dir(repository_root())
        .output()
        .expect("pnpm, with the repository's node_modules installed, is on PATH");
    assert!(
        output.status.success(),
        "prisma-next migrate --config {config} failed\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
}

async fn shared_migrator(database: &str) -> Migrator {
    Migrator::new(repository_root().join("migrations-sql").join(database))
        .await
        .expect("the shared migrations resolve")
}

mod given_a_sqlite_file {
    use super::*;

    /// The tables Prisma Next keeps its own records in.
    const PRISMA_TABLES: &[&str] = &["_prisma_marker", "_prisma_ledger"];

    /// Every table and index in `file` as SQLite records it, the SQL it was
    /// created by included, leaving out SQLite's own entries and `bookkeeping`.
    async fn schema(file: &Path, bookkeeping: &[&str]) -> Vec<(String, String, String, String)> {
        let mut connection = SqliteConnectOptions::new()
            .filename(file)
            .connect()
            .await
            .unwrap();
        let rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT type, name, tbl_name, sql FROM sqlite_schema \
             WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type, name",
        )
        .fetch_all(&mut connection)
        .await
        .unwrap();
        connection.close().await.unwrap();
        rows.into_iter()
            .filter(|(_, _, table, _)| !bookkeeping.contains(&table.as_str()))
            .map(|(kind, name, table, sql)| (kind, name, table, sql.unwrap_or_default()))
            .collect()
    }

    #[tokio::test]
    #[ignore = "runs Prisma Next through pnpm; CI's rust job runs it"]
    async fn the_shared_migrations_produce_the_schema_prisma_produces() {
        let directory = tempfile::tempdir().unwrap();
        let prisma = directory.path().join("prisma.db");
        let shared = directory.path().join("shared.db");

        prisma_migrate(
            "prisma-next.config.sqlite.ts",
            "SQLITE_PATH",
            prisma.to_str().unwrap(),
        );
        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&shared)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        shared_migrator("sqlite").await.run(&pool).await.unwrap();
        pool.close().await;

        let expected = schema(&prisma, PRISMA_TABLES).await;
        assert!(
            expected.iter().any(|(_, name, _, _)| name == "spaces"),
            "Prisma Next migrated {}: {expected:#?}",
            prisma.display()
        );
        assert_eq!(schema(&shared, SQLX_TABLES).await, expected);
    }
}

mod given_a_postgresql_server {
    use super::*;

    /// Every relation, column, constraint and index in the `public` schema, one
    /// line each, leaving out those of the tables `bookkeeping` names. Prisma
    /// Next keeps its own records in a schema of its own.
    const SCHEMA: &str = "
        SELECT line FROM (
            SELECT c.relname AS owner, format('relation %s %s', c.relname, c.relkind) AS line
            FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid = c.oid
            WHERE c.relnamespace = 'public'::regnamespace AND i.indexrelid IS NULL
          UNION ALL
            SELECT table_name, format('column %s.%s #%s %s %s nullable=%s default=%s',
              table_name, column_name, ordinal_position, data_type, udt_name, is_nullable,
              coalesce(column_default, '-'))
            FROM information_schema.columns WHERE table_schema = 'public'
          UNION ALL
            SELECT conrelid::regclass::text, format('constraint %s.%s %s',
              conrelid::regclass, conname, pg_get_constraintdef(oid))
            FROM pg_constraint WHERE connamespace = 'public'::regnamespace
          UNION ALL
            SELECT tablename, format('index %s', indexdef)
            FROM pg_indexes WHERE schemaname = 'public'
        ) AS schema
        WHERE owner <> ALL($1)
        ORDER BY line";

    async fn schema(options: &PgConnectOptions, bookkeeping: &[&str]) -> Vec<String> {
        let mut connection = PgConnection::connect_with(options).await.unwrap();
        let lines = sqlx::query_scalar(SCHEMA)
            .bind(bookkeeping)
            .fetch_all(&mut connection)
            .await
            .unwrap();
        connection.close().await.unwrap();
        lines
    }

    #[tokio::test]
    #[ignore = "needs a PostgreSQL server; CI's rust job runs it"]
    async fn the_shared_migrations_produce_the_schema_prisma_produces() {
        let url = std::env::var(DATABASE_URL_VARIABLE)
            .unwrap_or_else(|_| panic!("{DATABASE_URL_VARIABLE} names a PostgreSQL database"));
        let server = PgConnectOptions::from_str(&url).unwrap();
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let prisma = format!("migrations_prisma_{suffix}");
        let shared = format!("migrations_shared_{suffix}");

        // On its own task, so that a failure, in creating the databases too,
        // still drops both.
        let mut prisma_url = url::Url::parse(&url).unwrap();
        prisma_url.set_path(&prisma);
        let admin_options = server.clone();
        let databases = [prisma.clone(), shared.clone()];
        let prisma_options = server.clone().database(&prisma);
        let shared_options = server.clone().database(&shared);
        let schemas = tokio::spawn(async move {
            let mut admin = PgConnection::connect_with(&admin_options).await.unwrap();
            for database in &databases {
                sqlx::raw_sql(AssertSqlSafe(format!("CREATE DATABASE \"{database}\"")))
                    .execute(&mut admin)
                    .await
                    .unwrap();
            }
            admin.close().await.unwrap();
            prisma_migrate("prisma-next.config.ts", "DATABASE_URL", prisma_url.as_str());
            let pool = PgPoolOptions::new()
                .connect_with(shared_options.clone())
                .await
                .unwrap();
            // Closed before a failure is raised, so no connection is left to
            // stop the databases being dropped.
            let migrated = shared_migrator("postgres").await.run(&pool).await;
            pool.close().await;
            migrated.unwrap();
            (
                schema(&prisma_options, &[]).await,
                schema(&shared_options, SQLX_TABLES).await,
            )
        })
        .await;

        // `FORCE` ends any connection a panic dropped without closing, and a
        // failed drop is reported only after the task's own failure.
        let mut admin = PgConnection::connect_with(&server).await.unwrap();
        let mut failed_drops = Vec::new();
        for database in [&prisma, &shared] {
            if let Err(error) = sqlx::raw_sql(AssertSqlSafe(format!(
                "DROP DATABASE IF EXISTS \"{database}\" WITH (FORCE)"
            )))
            .execute(&mut admin)
            .await
            {
                failed_drops.push(format!("{database}: {error}"));
            }
        }
        let closed = admin.close().await;

        let (expected, actual) =
            schemas.unwrap_or_else(|failure| std::panic::resume_unwind(failure.into_panic()));
        assert!(failed_drops.is_empty(), "dropping {failed_drops:?}");
        closed.unwrap();
        assert!(
            expected.iter().any(|line| line == "relation spaces r"),
            "Prisma Next migrated {prisma}: {expected:#?}"
        );
        assert_eq!(actual, expected);
    }
}
