//! Rows read across runtimes (Storage ST-125): the script
//! `conformance/rows/script.json` run by each runtime on a migrated
//! SQLite file, its rows written as SQL and checked in, and each runtime
//! reading the other's. This file writes and checks the Rust rows
//! (`fixtures/rust-sqlite-rows.sql`), which
//! `test/integration/sqlite-rows-across-runtimes.test.ts` replays, and replays
//! the TypeScript rows (`fixtures/typescript-sqlite-rows.sql`, written by
//! `scripts/sqlite-rows-fixture.ts`).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod rows_support;

use std::path::Path;

use host::{CommitResult, SpaceChange, SpaceCommit, SpaceRepository, SqliteSpaceRepository};
use rows_support::{assert_reads_as_the_script, expected, hold_current, meta, run_script};
use sqlite_support::{Migrated, connect, execute};

/// What every timestamp is written as, since each run stores its own clock's.
const TIMESTAMP: &str = "'2000-01-01 00:00:00'";

/// The command that rewrites the Rust rows, named by the check that fails
/// when they are not current.
const REGENERATE: &str = "INFINITY_CUBE_WRITE_ROWS=1 cargo nextest run -p host --test sqlite_rows";

/// Each table, in an order its foreign keys accept, and the key it is listed
/// by: as `scripts/sqlite-rows-fixture.ts` lists them.
const TABLES: [(&str, &str); 4] = [
    ("spaces", "id"),
    ("resources", "id"),
    ("repository_state", "singleton_id"),
    ("assets", "hash"),
];

/// The rows of `file` as SQL that inserts them, each timestamp written as
/// [`TIMESTAMP`]: as `scripts/sqlite-rows-fixture.ts` writes them.
async fn dump(file: &Path, header: &[&str]) -> String {
    let mut connection = connect(file).await;
    let mut lines: Vec<String> = header.iter().map(|line| (*line).to_owned()).collect();
    for (table, key) in TABLES {
        let columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info(?) ORDER BY cid")
                .bind(table)
                .fetch_all(&mut connection)
                .await
                .unwrap();
        let names = columns
            .iter()
            .map(|column| format!("\"{column}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let values = columns
            .iter()
            .map(|column| match column.as_str() {
                "created_at" | "updated_at" => format!("quote({TIMESTAMP})"),
                _ => format!("quote(\"{column}\")"),
            })
            .collect::<Vec<_>>()
            .join(" || ', ' || ");
        let rows: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT {values} FROM \"{table}\" ORDER BY \"{key}\""
        )))
        .fetch_all(&mut connection)
        .await
        .unwrap();
        lines.extend(
            rows.into_iter()
                .map(|row| format!("INSERT INTO \"{table}\" ({names}) VALUES ({row});")),
        );
    }
    sqlx::Connection::close(connection).await.unwrap();
    lines.push(String::new());
    lines.join("\n")
}

/// Rows this host writes running the script, checked in for the TypeScript
/// host to read.
mod given_the_script {
    use super::*;

    #[tokio::test]
    async fn writes_the_rows_checked_in() {
        let file = Migrated::new().await;
        let store = SqliteSpaceRepository::open(&file.path());
        run_script(&store).await;
        store.close().await;
        let rows = dump(
            &file.file,
            &[
                "-- The rows the Rust host wrote running conformance/rows/script.json on",
                "-- a migrated SQLite file, each timestamp written as one fixed value, written",
                "-- by crates/host/tests/sqlite_rows.rs. Regenerate them with:",
                &format!("--   {REGENERATE}"),
            ],
        )
        .await;
        hold_current("rust-sqlite-rows.sql", &rows, REGENERATE);
    }

    #[tokio::test]
    async fn reads_back_what_the_memory_store_holds() {
        let file = Migrated::new().await;
        let store = SqliteSpaceRepository::open(&file.path());
        run_script(&store).await;
        store.close().await;
        let sqlite = SqliteSpaceRepository::open(&file.path());
        let memory = expected().await;
        assert_eq!(
            sqlite.load_aggregate().await,
            memory.load_aggregate().await,
            "the aggregate"
        );
        sqlite.close().await;
    }
}

/// Rows the TypeScript host wrote running the script, replayed over a freshly
/// migrated file.
mod given_rows_the_typescript_host_wrote {
    use super::*;

    async fn replayed() -> (SqliteSpaceRepository, Migrated) {
        let file = Migrated::new().await;
        execute(
            &file.file,
            include_str!("fixtures/typescript-sqlite-rows.sql"),
        )
        .await;
        (SqliteSpaceRepository::open(&file.path()), file)
    }

    #[tokio::test]
    async fn reads_the_aggregate_and_its_assets_as_this_host_runs_the_script() {
        let (sqlite, _file) = replayed().await;
        assert_reads_as_the_script(&sqlite, false).await;
        sqlite.close().await;
    }

    #[tokio::test]
    async fn commits_an_edit_over_them() {
        let (sqlite, _file) = replayed().await;
        let loaded = sqlite.load_space(meta()).await.unwrap().unwrap();
        let mut snapshot = loaded.snapshot.clone();
        "Renamed".clone_into(&mut snapshot.document.title);
        assert_eq!(
            sqlite
                .commit(SpaceCommit {
                    changes: vec![SpaceChange::Update {
                        space_id: meta(),
                        snapshot,
                        expected_revision: loaded.revision,
                    }],
                })
                .await,
            Ok(CommitResult::Committed {
                revisions: vec![(meta(), loaded.revision.next())],
                deleted_space_ids: vec![],
            }),
            "the Edit lands"
        );
        sqlite.close().await;
    }
}
