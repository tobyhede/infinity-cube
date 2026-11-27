//! Rows read across runtimes on PostgreSQL (Storage ST-125): the script
//! `conformance/rows/script.json` run by each runtime on a migrated
//! database, its rows written as SQL and checked in, and each runtime
//! reading the other's. This file writes and checks the Rust rows
//! (`fixtures/rust-postgres-rows.sql`), which
//! `test/integration/postgres-rows-across-runtimes.test.ts` replays, and
//! replays the TypeScript rows (`fixtures/typescript-postgres-rows.sql`,
//! written by `scripts/postgres-rows-fixture.ts`). Every test needs the
//! server `INFINITY_CUBE_POSTGRES_TEST_URL` names, so each is ignored by
//! default.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod postgres_support;

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod rows_support;

use host::{CommitResult, SpaceChange, SpaceCommit, SpaceRepository};
use postgres_support::Fresh;
use rows_support::{assert_reads_as_the_script, hold_current, meta, run_script};
use sqlx::Connection as _;

/// The command that rewrites the Rust rows, named by the check that fails
/// when they are not current.
const REGENERATE: &str = "INFINITY_CUBE_WRITE_ROWS=1 INFINITY_CUBE_POSTGRES_TEST_URL=<server> \
                          cargo nextest run -p host --test postgres_rows --run-ignored only";

/// Each table, in an order its foreign keys accept, and the key it is listed
/// by: as `test/support/postgres-rows.ts` lists them.
const TABLES: [(&str, &str); 4] = [
    ("spaces", "id"),
    ("resources", "id"),
    ("repository_state", "singleton_id"),
    ("assets", "hash"),
];

/// What every timestamp is written as, since each run stores its own clock's.
const TIMESTAMP: &str = "'2000-01-01 00:00:00+00'";

/// The expression that writes `column`, of `data_type`, as the SQL literal
/// that reads it back: as `test/support/postgres-rows.ts` writes it. A
/// `jsonb` document is written as the server's own text for it, keys in the
/// order `jsonb` keeps them.
fn literal(column: &str, data_type: &str) -> String {
    match (column, data_type) {
        ("created_at" | "updated_at", _) => format!("quote_literal({TIMESTAMP})"),
        (_, "bytea") => {
            format!("'decode(' || quote_literal(encode(\"{column}\", 'hex')) || ', ''hex'')'")
        }
        _ => format!("quote_nullable(\"{column}\"::text)"),
    }
}

/// The rows of `database` as SQL that inserts them, each timestamp written
/// as [`TIMESTAMP`]: as `test/support/postgres-rows.ts` writes them.
async fn dump(database: &Fresh, header: &[&str]) -> String {
    let mut connection = database.connect().await;
    let mut lines: Vec<String> = header.iter().map(|line| (*line).to_owned()).collect();
    for (table, key) in TABLES {
        let columns: Vec<(String, String)> = sqlx::query_as(
            "SELECT column_name::text, data_type::text FROM information_schema.columns \
             WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        )
        .bind(table)
        .fetch_all(&mut connection)
        .await
        .unwrap();
        let names = columns
            .iter()
            .map(|(column, _)| format!("\"{column}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let values = columns
            .iter()
            .map(|(column, data_type)| literal(column, data_type))
            .collect::<Vec<_>>()
            .join(" || ', ' || ");
        let rows: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT {values} FROM public.\"{table}\" ORDER BY \"{key}\"::text COLLATE \"C\""
        )))
        .fetch_all(&mut connection)
        .await
        .unwrap();
        lines.extend(
            rows.into_iter()
                .map(|row| format!("INSERT INTO public.\"{table}\" ({names}) VALUES ({row});")),
        );
    }
    connection.close().await.unwrap();
    lines.push(String::new());
    lines.join("\n")
}

/// Rows this host writes running the script, checked in for the TypeScript
/// host to read.
mod given_the_script {
    use super::*;

    #[tokio::test]
    #[ignore = "needs the PostgreSQL server INFINITY_CUBE_POSTGRES_TEST_URL names"]
    async fn writes_the_rows_checked_in() {
        let database = Fresh::new().await;
        let store = database.open();
        run_script(&store).await;
        store.close().await;
        let rows = dump(
            &database,
            &[
                "-- The rows the Rust host wrote running conformance/rows/script.json on a",
                "-- migrated PostgreSQL database, each timestamp written as one fixed value,",
                "-- written by crates/host/tests/postgres_rows.rs. Regenerate them with:",
                &format!("--   {REGENERATE}"),
            ],
        )
        .await;
        hold_current("rust-postgres-rows.sql", &rows, REGENERATE);
    }

    #[tokio::test]
    #[ignore = "needs the PostgreSQL server INFINITY_CUBE_POSTGRES_TEST_URL names"]
    async fn reads_back_what_the_memory_store_holds() {
        let database = Fresh::new().await;
        let store = database.open();
        run_script(&store).await;
        store.close().await;
        let postgres = database.open();
        assert_reads_as_the_script(&postgres, true).await;
        postgres.close().await;
    }
}

/// Rows the TypeScript host wrote running the script, replayed over a freshly
/// migrated database.
mod given_rows_the_typescript_host_wrote {
    use super::*;

    async fn replayed() -> Fresh {
        let database = Fresh::new().await;
        database
            .execute(include_str!("fixtures/typescript-postgres-rows.sql"))
            .await;
        database
    }

    #[tokio::test]
    #[ignore = "needs the PostgreSQL server INFINITY_CUBE_POSTGRES_TEST_URL names"]
    async fn reads_the_aggregate_and_its_assets_as_this_host_runs_the_script() {
        let database = replayed().await;
        let postgres = database.open();
        assert_reads_as_the_script(&postgres, true).await;
        postgres.close().await;
    }

    #[tokio::test]
    #[ignore = "needs the PostgreSQL server INFINITY_CUBE_POSTGRES_TEST_URL names"]
    async fn commits_an_edit_over_them() {
        let database = replayed().await;
        let postgres = database.open();
        let loaded = postgres.load_space(meta()).await.unwrap().unwrap();
        let mut snapshot = loaded.snapshot.clone();
        "Renamed".clone_into(&mut snapshot.document.title);
        assert_eq!(
            postgres
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
        postgres.close().await;
    }

    /// A revision past what a double holds exactly (2⁵³ + 1), as the
    /// TypeScript host stores one: canonical decimal text, which this host
    /// reads and writes back as decimal text, one more. Only the stored value
    /// is checked: `revision` is a `text` column, so its type says nothing
    /// about what this host binds, and an `int8` bound to it is stored as the
    /// same text, so binding the revision as an integer is not told apart
    /// here.
    #[tokio::test]
    #[ignore = "needs the PostgreSQL server INFINITY_CUBE_POSTGRES_TEST_URL names"]
    async fn writes_the_next_revision_as_the_decimal_text_typescript_reads() {
        let database = replayed().await;
        database
            .execute(&format!(
                "UPDATE spaces SET revision = '9007199254740993' WHERE id = '{}'",
                meta()
            ))
            .await;
        let postgres = database.open();
        let loaded = postgres.load_space(meta()).await.unwrap().unwrap();
        assert_eq!(
            loaded.revision.to_string(),
            "9007199254740993",
            "the stored revision"
        );
        let mut snapshot = loaded.snapshot.clone();
        "Renamed".clone_into(&mut snapshot.document.title);
        let committed = postgres
            .commit(SpaceCommit {
                changes: vec![SpaceChange::Update {
                    space_id: meta(),
                    snapshot,
                    expected_revision: loaded.revision,
                }],
            })
            .await;
        assert!(
            matches!(committed, Ok(CommitResult::Committed { .. })),
            "the Edit lands: {committed:?}"
        );
        assert_eq!(
            database
                .scalar(&format!(
                    "SELECT revision FROM spaces WHERE id = '{}'",
                    meta()
                ))
                .await
                .as_deref(),
            Some("9007199254740994"),
            "the next revision, stored as decimal text"
        );
        postgres.close().await;
    }
}
