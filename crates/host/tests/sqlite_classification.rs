//! What the SQLite store names each broken stored state and each failure, by
//! the glossary's terms (Storage ST-7, ST-126): an **invariant failure**
//! (`BrokenStoredState`, 500 `internal-error`), **unreachable**
//! (`Unavailable`, 503 `persistence-unavailable`) or an **unclassified
//! failure** (`Unclassified`, 500 `internal-error`), each read from the
//! repository and from the HTTP application over it; and the cases of
//! `test/integration/sqlite-space-repository.test.ts` outside the contract
//! (rust-sqlite-test-coverage 05).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(
    unused_macros,
    unused_imports,
    reason = "this binary uses the table's support, not its cases"
)]
mod repository_contract;
#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use bytes::Bytes;
use host::{
    AggregateInput, AggregateLoad, Application, Clock, InitializeResult, ReplaceResult,
    RepositoryError, Shell, SpaceRepository, SqlitePath, SqliteSpaceRepository, keep_establishing,
};
use http::Request;
use http_conformance::Counted;
use repository_contract::{
    OTHER_RESOURCE_ID, OTHER_SPACE_ID, RESOURCE_ID, SPACE_ID, commit, id, retitled, seed, space,
    stored, update,
};
use sqlite_support::{Migrated, execute, hold_exclusive_lock};

/// What a failure is named, by the glossary's term.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Named {
    Invariant,
    Unreachable,
    Unclassified,
}

fn named<T: std::fmt::Debug>(answer: &Result<T, RepositoryError>) -> Named {
    match answer {
        Err(RepositoryError::BrokenStoredState(_)) => Named::Invariant,
        Err(RepositoryError::Unavailable(_)) => Named::Unreachable,
        Err(RepositoryError::Unclassified(_)) => Named::Unclassified,
        Err(other) => panic!("a failure no term names: {other:?}"),
        Ok(value) => panic!("a failure, not {value:?}"),
    }
}

/// The status and problem code the HTTP application answers a failure
/// named `named` with.
fn wire(named: Named) -> (u16, &'static str) {
    match named {
        Named::Invariant | Named::Unclassified => (500, "internal-error"),
        Named::Unreachable => (503, "persistence-unavailable"),
    }
}

/// The status and problem code `GET <path>` answers over `store`.
async fn served(store: &Arc<SqliteSpaceRepository>, path: &str) -> (u16, String) {
    let application: Application<SqliteSpaceRepository, Counted, BTreeMap<String, Bytes>> =
        Application::new(
            Arc::clone(store),
            Counted::default(),
            Shell::new("", BTreeMap::new()),
        );
    let request = Request::get(path)
        .body(http_body_util::Full::new(Bytes::new()))
        .unwrap();
    let response = application.handle(request).await;
    let status = response.status().as_u16();
    let body: serde_json::Value = serde_json::from_slice(response.body()).unwrap_or_default();
    let code = body["type"]
        .as_str()
        .and_then(|kind| kind.strip_prefix("urn:infinity-cube:problem:"))
        .unwrap_or_default()
        .to_owned();
    (status, code)
}

/// Assert `answer` is named `expected`, and that `GET <path>` over `store`
/// answers what the wire answers that name with.
async fn assert_named<T: std::fmt::Debug>(
    what: &str,
    answer: &Result<T, RepositoryError>,
    expected: Named,
    store: &Arc<SqliteSpaceRepository>,
    path: &str,
) {
    assert_eq!(named(answer), expected, "{what}: {answer:?}");
    let (status, code) = wire(expected);
    assert_eq!(
        served(store, path).await,
        (status, code.to_owned()),
        "{what}, served at {path}"
    );
}

fn open(path: &SqlitePath) -> Arc<SqliteSpaceRepository> {
    Arc::new(SqliteSpaceRepository::open(path))
}

/// A migrated file holding one Space, `SPACE_ID`, with one Resource.
async fn seeded() -> Migrated {
    let file = Migrated::new().await;
    let store = open(&file.path());
    seed(store.as_ref(), &[&space(SPACE_ID, "One", &[RESOURCE_ID])]).await;
    store.close().await;
    file
}

fn space_path() -> String {
    format!("/api/spaces/{SPACE_ID}")
}

/// One test per broken stored state ST-7 names, each an invariant failure
/// on every read that decodes it.
mod given_each_broken_stored_state {
    use super::*;

    async fn assert_broken(statement: &str, what: &str) {
        let file = seeded().await;
        execute(&file.file, statement).await;
        let store = open(&file.path());
        let aggregate = store.load_aggregate().await;
        assert_named(what, &aggregate, Named::Invariant, &store, &space_path()).await;
        store.close().await;
    }

    #[tokio::test]
    async fn names_a_meta_id_that_is_not_a_uuid_an_invariant_failure() {
        assert_broken(
            "PRAGMA foreign_keys = OFF; UPDATE repository_state SET meta_space_id = 'not-a-uuid';",
            "a Meta id that is not a UUID",
        )
        .await;
    }

    #[tokio::test]
    async fn names_a_meta_id_naming_no_space_an_invariant_failure() {
        assert_broken(
            &format!(
                "PRAGMA foreign_keys = OFF; UPDATE repository_state SET meta_space_id = '{OTHER_SPACE_ID}';"
            ),
            "a Meta id naming no stored Space",
        )
        .await;
    }

    #[tokio::test]
    async fn names_an_exported_revision_that_is_not_canonical_an_invariant_failure() {
        assert_broken(
            "UPDATE spaces SET exported_revision = '01';",
            "an exported revision that is not canonical",
        )
        .await;
    }

    #[tokio::test]
    async fn names_a_document_failing_intake_an_invariant_failure_on_load_space() {
        let file = seeded().await;
        execute(
            &file.file,
            r#"UPDATE spaces SET document = '{"version":1}';"#,
        )
        .await;
        let store = open(&file.path());
        let loaded = store.load_space(id(SPACE_ID)).await;
        assert_named(
            "a document with no title, loaded alone",
            &loaded,
            Named::Invariant,
            &store,
            &space_path(),
        )
        .await;
        store.close().await;
    }

    #[tokio::test]
    async fn names_a_document_that_is_not_json_an_invariant_failure() {
        assert_broken(
            "UPDATE spaces SET document = 'not json';",
            "a document that is not JSON",
        )
        .await;
    }

    #[tokio::test]
    async fn names_a_document_holding_a_lone_surrogate_an_invariant_failure() {
        assert_broken(
            r#"UPDATE spaces SET document = '{"version":1,"title":"\ud800"}';"#,
            "a document escaping a lone UTF-16 surrogate",
        )
        .await;
        assert_broken(
            r#"UPDATE resources SET document = '{"title":"\udc00","kind":"markdown","content":{"url":"/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"}}';"#,
            "a Resource document escaping a lone UTF-16 surrogate",
        )
        .await;
    }

    #[tokio::test]
    async fn names_a_missing_table_an_invariant_failure() {
        assert_broken(
            "PRAGMA foreign_keys = OFF; DROP TABLE resources;",
            "a missing table",
        )
        .await;
    }

    #[tokio::test]
    async fn names_a_document_stored_as_a_blob_an_invariant_failure() {
        assert_broken(
            "UPDATE spaces SET document = CAST(document AS BLOB);",
            "a document stored as a BLOB",
        )
        .await;
    }
}

/// One test per failure the store meets, named by what a caller does about it.
mod given_each_failure {
    use super::*;

    #[tokio::test]
    async fn names_a_lock_held_past_the_busy_timeout_unreachable() {
        let file = seeded().await;
        let held = hold_exclusive_lock(&file.file).await;
        let store = Arc::new(SqliteSpaceRepository::open_with_busy_timeout(
            &file.path(),
            Duration::from_millis(50),
        ));
        let aggregate = store.load_aggregate().await;
        assert_named(
            "a lock another process holds",
            &aggregate,
            Named::Unreachable,
            &store,
            &space_path(),
        )
        .await;
        drop(held);
        store.close().await;
    }

    // Case: names every operation on a closed database unavailable
    #[tokio::test]
    async fn names_every_operation_on_a_closed_store_unreachable() {
        let file = seeded().await;
        let store = open(&file.path());
        let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
        let input = AggregateInput {
            meta_space_id: id(SPACE_ID),
            spaces: vec![first.clone()],
        };
        store.close().await;
        let answers = [
            ("load_aggregate", store.load_aggregate().await.map(drop)),
            (
                "commit",
                store
                    .commit(commit(vec![update(&retitled(&first, "Never stored"), 0)]))
                    .await
                    .map(drop),
            ),
            (
                "initialize_aggregate",
                store.initialize_aggregate(input.clone()).await.map(drop),
            ),
            (
                "replace_aggregate",
                store
                    .replace_aggregate(input, Some(id(SPACE_ID)))
                    .await
                    .map(drop),
            ),
            ("list_spaces", store.list_spaces().await.map(drop)),
            ("load_space", store.load_space(id(SPACE_ID)).await.map(drop)),
            (
                "load_meta_space_id",
                store.load_meta_space_id().await.map(drop),
            ),
            (
                "mark_exported",
                store
                    .mark_exported(id(SPACE_ID), repository_contract::revision(1))
                    .await,
            ),
        ];
        for (operation, answer) in answers {
            assert_eq!(
                named(&answer),
                Named::Unreachable,
                "{operation}: {answer:?}"
            );
        }
        assert_eq!(
            served(&store, &space_path()).await,
            (503, "persistence-unavailable".to_owned())
        );
    }

    #[tokio::test]
    async fn names_a_file_that_does_not_exist_unreachable() {
        let directory = tempfile::tempdir().unwrap();
        let path = SqlitePath::from_variable(directory.path().join("cube.db").to_str()).unwrap();
        let store = open(&path);
        let aggregate = store.load_aggregate().await;
        assert_named(
            "a file that does not exist",
            &aggregate,
            Named::Unreachable,
            &store,
            &space_path(),
        )
        .await;
    }

    // Case: leaves a statement failure that is a defect unclassified
    /// A constraint a write breaks is a defect, not an outage: here a trigger
    /// standing in for one the repository does not know of.
    #[tokio::test]
    async fn names_a_constraint_a_write_breaks_an_unclassified_failure() {
        let file = seeded().await;
        execute(
            &file.file,
            "CREATE TRIGGER refuse_every_update BEFORE UPDATE ON spaces \
             BEGIN SELECT RAISE(ABORT, 'refused by a constraint'); END;",
        )
        .await;
        let store = open(&file.path());
        let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
        let committed = store
            .commit(commit(vec![update(&retitled(&first, "Refused"), 0)]))
            .await;
        assert_eq!(named(&committed), Named::Unclassified, "{committed:?}");
        assert_eq!(
            store.load_space(id(SPACE_ID)).await,
            Ok(Some(stored(&first, 0, None))),
            "nothing is written"
        );
        store.close().await;
    }

    #[tokio::test]
    async fn names_a_directory_at_the_path_an_unclassified_failure() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("cube.db");
        std::fs::create_dir(&folder).unwrap();
        let store = open(&SqlitePath::from_variable(folder.to_str()).unwrap());
        let aggregate = store.load_aggregate().await;
        assert_named(
            "a directory where the file should be",
            &aggregate,
            Named::Unclassified,
            &store,
            &space_path(),
        )
        .await;
    }
}

/// The cases of `test/integration/sqlite-space-repository.test.ts` that are
/// not the contract's and not contention's.
mod given_one_file {
    use super::*;

    // Case: serves two overlapping aggregate reads through one client without waiting on each other
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn serves_two_overlapping_aggregate_reads() {
        let file = seeded().await;
        let store = open(&file.path());
        let (first, second) = tokio::join!(store.load_aggregate(), store.load_aggregate());
        assert!(matches!(first, Ok(AggregateLoad::Loaded(_))), "{first:?}");
        assert_eq!(first, second, "both read the same aggregate");
        store.close().await;
    }

    // Case: settles two overlapping first initializations through one client as initialized and existing
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn settles_two_overlapping_first_initializations() {
        let file = Migrated::new().await;
        let store = open(&file.path());
        let input = AggregateInput {
            meta_space_id: id(SPACE_ID),
            spaces: vec![space(SPACE_ID, "One", &[RESOURCE_ID])],
        };
        let (first, second) = tokio::join!(
            store.initialize_aggregate(input.clone()),
            store.initialize_aggregate(input)
        );
        let mut kinds = [first, second].map(|answer| match answer {
            Ok(InitializeResult::Initialized(_)) => "initialized",
            Ok(InitializeResult::Existing(_)) => "existing",
            other => panic!("initialized or existing, not {other:?}"),
        });
        kinds.sort_unstable();
        assert_eq!(kinds, ["existing", "initialized"]);
        store.close().await;
    }

    // Case: serialises overlapping operations across two repositories over one file handle
    /// Two repositories over one file, each with its own connection, as two
    /// hosts would hold it: each one's operation overlapping the other's
    /// lands, inside the busy timeout.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn serialises_overlapping_operations_across_two_repositories_over_one_file() {
        let file = seeded().await;
        let writer = open(&file.path());
        let reader = open(&file.path());
        let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
        let changed = retitled(&first, "Changed");
        let (committed, listed) = tokio::join!(
            writer.commit(commit(vec![update(&changed, 0)])),
            reader.list_spaces()
        );
        assert_eq!(
            committed,
            Ok(repository_contract::committed(&[(SPACE_ID, 1)], &[]))
        );
        assert!(listed.is_ok(), "{listed:?}");
        assert_eq!(
            reader.load_space(id(SPACE_ID)).await,
            Ok(Some(stored(&changed, 1, None))),
            "the other repository reads what the first wrote"
        );
        writer.close().await;
        reader.close().await;
    }

    /// A broken row the destructive door replaces: read and initialization
    /// refuse it as an invariant failure, and replacement truncates it.
    async fn truncates(statements: &str) {
        let file = Migrated::new().await;
        execute(&file.file, statements).await;
        let store = open(&file.path());
        let replacement = space(SPACE_ID, "Replacement", &[RESOURCE_ID]);
        let input = AggregateInput {
            meta_space_id: id(SPACE_ID),
            spaces: vec![replacement.clone()],
        };
        let loaded = store.load_aggregate().await;
        assert_eq!(named(&loaded), Named::Invariant, "{loaded:?}");
        let initialized = store.initialize_aggregate(input.clone()).await;
        assert_eq!(named(&initialized), Named::Invariant, "{initialized:?}");
        let replaced = store
            .replace_aggregate(input, Some(id(OTHER_SPACE_ID)))
            .await;
        assert!(
            matches!(replaced, Ok(ReplaceResult::Replaced(_))),
            "{replaced:?}"
        );
        store.close().await;
        let store = open(&file.path());
        assert_eq!(
            store.load_aggregate().await,
            Ok(AggregateLoad::Loaded(host::LoadedAggregate {
                meta_space_id: id(SPACE_ID),
                spaces: vec![stored(&replacement, 0, None)],
            }))
        );
        store.close().await;
    }

    // Case: truncates a stored Space whose document is not JSON
    #[tokio::test]
    async fn truncates_a_stored_space_whose_document_is_not_json() {
        truncates(&format!(
            "INSERT INTO spaces (id, document, updated_at) VALUES ('{OTHER_SPACE_ID}', 'not json', datetime('now'));
             INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, '{OTHER_SPACE_ID}');"
        ))
        .await;
    }

    // Case: truncates a stored Space whose Resource document is not JSON
    #[tokio::test]
    async fn truncates_a_stored_space_whose_resource_document_is_not_json() {
        truncates(&format!(
            r#"INSERT INTO spaces (id, document, revision, updated_at) VALUES ('{OTHER_SPACE_ID}', '{{"version":1,"title":"Orphan"}}', '0', datetime('now'));
               INSERT INTO resources (id, space_id, document, updated_at) VALUES ('{OTHER_RESOURCE_ID}', '{OTHER_SPACE_ID}', 'not json either', datetime('now'));
               INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, '{OTHER_SPACE_ID}');"#
        ))
        .await;
    }

    // Case: refuses a Meta identity naming a Space the file does not store
    #[tokio::test]
    async fn refuses_a_meta_identity_naming_a_space_the_file_does_not_store() {
        let file = Migrated::new().await;
        let mut connection = sqlite_support::connect(&file.file).await;
        let naming_none = sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, '{}')",
            repository_contract::MISSING_SPACE_ID
        )))
        .execute(&mut connection)
        .await;
        assert!(
            naming_none.is_err(),
            "the file refuses a Meta id naming no Space"
        );
        let store = open(&file.path());
        seed(store.as_ref(), &[&space(SPACE_ID, "Meta", &[])]).await;
        let deleting_meta = sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "DELETE FROM spaces WHERE id = '{SPACE_ID}'"
        )))
        .execute(&mut connection)
        .await;
        assert!(
            deleting_meta.is_err(),
            "the file refuses deleting the Meta Space"
        );
        sqlx::Connection::close(connection).await.unwrap();
        let loaded = store.load_aggregate().await;
        assert!(
            matches!(&loaded, Ok(AggregateLoad::Loaded(aggregate)) if aggregate.meta_space_id == id(SPACE_ID)),
            "{loaded:?}"
        );
        store.close().await;
    }

    /// A clock whose first wait lets go of the lock another process held.
    struct ReleasingClock(Mutex<Option<sqlx::SqliteConnection>>);

    impl Clock for ReleasingClock {
        fn sleep(&self, _duration: Duration) -> impl Future<Output = ()> + Send {
            drop(self.0.lock().unwrap().take());
            std::future::ready(())
        }
    }

    // Case: keeps start-up trying through contention
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn keeps_start_up_trying_through_contention() {
        let file = Migrated::new().await;
        let held = hold_exclusive_lock(&file.file).await;
        let store =
            SqliteSpaceRepository::open_with_busy_timeout(&file.path(), Duration::from_millis(50));
        let mut reported = Vec::new();
        let established = keep_establishing(
            &store,
            &Counted::default(),
            &ReleasingClock(Mutex::new(Some(held))),
            |failure| reported.push(failure.to_string()),
        )
        .await;
        assert!(established.is_ok(), "{established:?}");
        assert_eq!(reported.len(), 1, "one attempt met the lock: {reported:?}");
        assert!(
            matches!(store.load_aggregate().await, Ok(AggregateLoad::Loaded(_))),
            "the Meta Space is established"
        );
        store.close().await;
    }
}
