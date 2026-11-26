//! Rows read across runtimes (Storage ST-125): the script
//! `conformance/sqlite-rows/script.json` run by each runtime on a migrated
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

use std::path::{Path, PathBuf};

use bytes::Bytes;
use host::{
    AggregateInput, AssetHash, AssetStored, CommitResult, InitializeResult, MemorySpaceRepository,
    SpaceChange, SpaceCommit, SpaceRepository, SqliteSpaceRepository, StoredAsset, decode_commit,
};
use intake::SpaceId;
use intake::json::{JsonValue, parse};
use sqlite_support::{Migrated, connect, execute};

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

/// What every timestamp is written as, since each run stores its own clock's.
const TIMESTAMP: &str = "'2000-01-01 00:00:00'";

fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn script() -> JsonValue {
    let text =
        std::fs::read_to_string(repository_root().join("conformance/sqlite-rows/script.json"))
            .unwrap();
    parse(&text).unwrap()
}

fn field<'a>(value: &'a JsonValue, key: &str) -> &'a JsonValue {
    value
        .as_object()
        .and_then(|object| object.get(key))
        .unwrap_or_else(|| panic!("the script has {key}"))
}

fn text<'a>(value: &'a JsonValue, key: &str) -> &'a str {
    field(value, key).as_str().unwrap()
}

fn array(value: &JsonValue) -> &[JsonValue] {
    let JsonValue::Array(items) = value else {
        panic!("the script has an array");
    };
    items
}

/// The Meta Space the script initializes.
fn meta() -> SpaceId {
    SpaceId::parse(text(field(&script(), "initialize"), "metaSpaceId")).unwrap()
}

/// Each asset the script stores, as it stores it.
fn assets() -> Vec<StoredAsset> {
    array(field(&script(), "steps"))
        .iter()
        .filter_map(|step| step.as_object().and_then(|step| step.get("asset")))
        .map(|asset| {
            let stored = StoredAsset::admit(
                Bytes::from(text(asset, "text").to_owned()),
                text(asset, "mediaType"),
            )
            .unwrap();
            assert_eq!(
                stored.hash,
                AssetHash::parse(text(asset, "hash")).unwrap(),
                "the script names the hash of its asset"
            );
            stored
        })
        .collect()
}

/// Run the script on `store`, failing unless each step lands.
async fn run_script<R: SpaceRepository>(store: &R) {
    let script = script();
    let initialize = field(&script, "initialize");
    let spaces = array(field(initialize, "spaces"))
        .iter()
        .map(|space| {
            let SpaceChange::Create { snapshot, .. } = commit_of(&format!(
                r#"{{"changes":[{{"kind":"create","spaceId":"{}","snapshot":{space}}}]}}"#,
                text(space, "id")
            ))
            .changes
            .remove(0) else {
                panic!("a create change");
            };
            snapshot
        })
        .collect();
    let initialized = store
        .initialize_aggregate(AggregateInput {
            meta_space_id: meta(),
            spaces,
        })
        .await
        .unwrap();
    assert!(
        matches!(initialized, InitializeResult::Initialized(_)),
        "the script initializes an empty store: {initialized:?}"
    );
    let mut assets = assets().into_iter();
    for (index, step) in array(field(&script, "steps")).iter().enumerate() {
        let step = step.as_object().unwrap();
        if step.get("asset").is_some() {
            let stored = store.store_asset(assets.next().unwrap()).await.unwrap();
            assert_eq!(stored, AssetStored::Stored, "step {index} stores its asset");
        } else {
            let commit = commit_of(&step.get("commit").unwrap().to_string());
            let answer = store.commit(commit).await.unwrap();
            assert!(
                matches!(answer, CommitResult::Committed { .. }),
                "step {index} commits: {answer:?}"
            );
        }
    }
}

/// A commit request as the wire carries it.
fn commit_of(json: &str) -> SpaceCommit {
    decode_commit(json.as_bytes()).unwrap()
}

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

/// The script run on the memory store: what each runtime's rows must read as.
async fn expected() -> MemorySpaceRepository {
    let memory = MemorySpaceRepository::new();
    run_script(&memory).await;
    memory
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
                "-- The rows the Rust host wrote running conformance/sqlite-rows/script.json on",
                "-- a migrated SQLite file, each timestamp written as one fixed value, written",
                "-- by crates/host/tests/sqlite_rows.rs. Regenerate them with:",
                &format!("--   {REGENERATE}"),
            ],
        )
        .await;
        let checked_in =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/rust-sqlite-rows.sql");
        if std::env::var_os("INFINITY_CUBE_WRITE_ROWS").is_some() {
            std::fs::write(&checked_in, &rows).unwrap();
        }
        assert!(
            std::fs::read_to_string(&checked_in).ok().as_deref() == Some(rows.as_str()),
            "{} is not the rows the script writes now; regenerate it with: {REGENERATE}",
            checked_in.display()
        );
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
        let memory = expected().await;
        assert_eq!(
            sqlite.load_aggregate().await,
            memory.load_aggregate().await,
            "the aggregate"
        );
        assert_eq!(
            sqlite.list_spaces().await,
            memory.list_spaces().await,
            "the Spaces listed"
        );
        for asset in assets() {
            let stored = sqlite.load_asset(&asset.hash).await.unwrap();
            assert_eq!(stored, Some(asset.clone()), "asset {}", asset.hash);
            assert_eq!(
                stored,
                memory.load_asset(&asset.hash).await.unwrap(),
                "asset {}",
                asset.hash
            );
        }
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
    }
}
