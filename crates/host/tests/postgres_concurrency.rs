//! The PostgreSQL store beside other writers (ADR 0177): ports of the
//! TypeScript PostgreSQL repository's concurrency and schema cases, its
//! initialization races and its lock key, each on a database of its own.
//!
//! A blocker is a raw transaction on a connection of its own, and an
//! operation that has to be waiting is observed waiting in
//! `pg_stat_activity`, never assumed after a sleep. Every test but the one
//! reading the TypeScript source needs the server
//! `INFINITY_CUBE_POSTGRES_TEST_URL` names.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod postgres_support;

use std::future::Future;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use host::{
    AggregateInput, AggregateLoad, CommitResult, InitializeResult, LoadedAggregate, LoadedSpace,
    LockMode, PostgresSpaceRepository, Probe, ReplaceResult, Revision, SpaceChange, SpaceCommit,
    SpaceConflict, SpaceRepository, Step,
};
use intake::{SpaceId, SpaceSnapshot};
use postgres_support::Fresh;
use sqlx::{Connection as _, PgConnection};
use tokio::sync::Notify;
use tokio::task::JoinHandle;

type Store = Arc<PostgresSpaceRepository>;

const SPACE_ID: &str = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID: &str = "22222222-2222-4222-8222-222222222222";
const OMITTED_RESOURCE_ID: &str = "33333333-3333-4333-8333-333333333333";
const MISSING_RESOURCE_ID: &str = "66666666-6666-4666-8666-666666666666";
const OTHER_SPACE_ID: &str = "77777777-7777-4777-8777-777777777777";
const OTHER_RESOURCE_ID: &str = "88888888-8888-4888-8888-888888888888";
const CONCURRENT_SPACE_ID: &str = "99999999-9999-4999-8999-999999999999";
const CONCURRENT_RESOURCE_ID: &str = "9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a";
const UNRESOLVED_RESOURCE_ID: &str = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINK_RESOURCE_ID: &str = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OTHER_SPACE_MAP_ID: &str = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const OTHER_SPACE_GRAPH_ID: &str = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d";
const CONCURRENT_MAP_ID: &str = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const CONCURRENT_GRAPH_ID: &str = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const RACE_CHILD_SPACE_ID: &str = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const RACE_CHILD_MAP_ID: &str = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";
const RACE_CHILD_GRAPH_ID: &str = "1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c";
const RACE_LINK_RESOURCE_ID: &str = "1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d";
const FIRST_META_ID: &str = "e3700000-0000-4000-8000-000000000001";
const SECOND_META_ID: &str = "e3700000-0000-4000-8000-000000000002";

const EMPTY_ASSET_REF: &str = "/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

/// How long a wait the test expects to be observed may take to appear.
const PATIENCE: Duration = Duration::from_secs(30);

fn space(id: &str) -> SpaceId {
    SpaceId::parse(id).unwrap()
}

fn revision(value: u64) -> Revision {
    Revision::new(value).unwrap()
}

/// A Space as JSON parts, so the same fixture is a snapshot for the
/// repository and rows for a raw writer.
#[derive(Clone)]
struct Fixture {
    id: &'static str,
    document: String,
    resources: Vec<(&'static str, String)>,
}

impl Fixture {
    fn snapshot(&self) -> SpaceSnapshot {
        let resources: Vec<String> = self
            .resources
            .iter()
            .map(|(id, document)| format!(r#"{{"id":"{id}","document":{document}}}"#))
            .collect();
        let json = format!(
            r#"{{"id":"{}","document":{},"resources":[{}]}}"#,
            self.id,
            self.document,
            resources.join(",")
        );
        let value = intake::json::parse(&json).unwrap();
        intake::decode_space_snapshot(&value, space(self.id)).unwrap()
    }

    fn titled(&self, title: &str) -> Self {
        let mut snapshot = self.clone();
        let mut value: serde_json::Value = serde_json::from_str(&self.document).unwrap();
        value["title"] = serde_json::Value::from(title);
        snapshot.document = value.to_string();
        snapshot
    }

    fn with(&self, id: &'static str, document: String) -> Self {
        let mut snapshot = self.clone();
        snapshot.resources.push((id, document));
        // In id order, as a stored Space reads back.
        snapshot.resources.sort_by_key(|(id, _)| *id);
        snapshot
    }

    /// The statements a raw writer inserts this Space's rows with.
    fn inserts(&self) -> String {
        let mut statements = format!(
            "INSERT INTO spaces (id, document, revision, updated_at) \
             VALUES ('{}', '{}'::jsonb, '0', now());",
            self.id, self.document
        );
        for (id, document) in &self.resources {
            statements.push_str(&format!(
                "INSERT INTO resources (id, space_id, document, updated_at) \
                 VALUES ('{id}', '{}', '{document}'::jsonb, now());",
                self.id
            ));
        }
        statements
    }

    fn at(&self, revision: Revision) -> LoadedSpace {
        LoadedSpace {
            snapshot: self.snapshot(),
            revision,
            exported_revision: None,
        }
    }
}

fn plain(title: &str) -> String {
    format!(r#"{{"version":1,"title":"{title}"}}"#)
}

fn mapped(title: &str, map: &str, graph: &str) -> String {
    format!(
        r#"{{"version":1,"title":"{title}","defaultMap":"{map}","maps":[{{"id":"{map}","title":"Map 1","kind":"positioned","positions":{{}},"graphs":[{{"id":"{graph}","title":"Graph 1","edges":[]}}],"activeGraph":"{graph}"}}]}}"#
    )
}

fn markdown(title: &str) -> String {
    format!(r#"{{"title":"{title}","kind":"markdown","content":{{"url":"{EMPTY_ASSET_REF}"}}}}"#)
}

/// A Space Resource, its content's keys in the order `jsonb` keeps them
/// (shorter first), which is the order a stored one reads back in.
fn space_link(title: &str, target: &str, map: &str, graph: &str) -> String {
    format!(
        r#"{{"title":"{title}","kind":"space","content":{{"map":"{map}","graph":"{graph}","spaceId":"{target}"}}}}"#
    )
}

/// `snapshot` in the TypeScript file.
fn repository_space() -> Fixture {
    Fixture {
        id: SPACE_ID,
        document: plain("Repository space"),
        resources: vec![
            (RESOURCE_ID, markdown("Stored resource")),
            (OMITTED_RESOURCE_ID, markdown("Resource to remove")),
        ],
    }
}

fn other_space() -> Fixture {
    Fixture {
        id: OTHER_SPACE_ID,
        document: mapped("Other space", OTHER_SPACE_MAP_ID, OTHER_SPACE_GRAPH_ID),
        resources: vec![(OTHER_RESOURCE_ID, markdown("Other resource"))],
    }
}

fn concurrent_space() -> Fixture {
    Fixture {
        id: CONCURRENT_SPACE_ID,
        document: plain("Concurrent space"),
        resources: vec![(CONCURRENT_RESOURCE_ID, markdown("Concurrent resource"))],
    }
}

/// `repository_space` with the Space Resource that makes `other_space` part
/// of the same aggregate.
fn linked_space() -> Fixture {
    repository_space().with(
        LINK_RESOURCE_ID,
        space_link(
            "Other Space",
            OTHER_SPACE_ID,
            OTHER_SPACE_MAP_ID,
            OTHER_SPACE_GRAPH_ID,
        ),
    )
}

fn proposal(id: &'static str, title: &str) -> Fixture {
    Fixture {
        id,
        document: plain(title),
        resources: vec![],
    }
}

fn input(meta: &'static str, spaces: &[Fixture]) -> AggregateInput {
    AggregateInput {
        meta_space_id: space(meta),
        spaces: spaces.iter().map(Fixture::snapshot).collect(),
    }
}

fn aggregate(meta: &str, spaces: Vec<LoadedSpace>) -> AggregateLoad {
    AggregateLoad::Loaded(LoadedAggregate {
        meta_space_id: space(meta),
        spaces,
    })
}

fn update(fixture: &Fixture, expected: Revision) -> SpaceChange {
    SpaceChange::Update {
        space_id: space(fixture.id),
        snapshot: fixture.snapshot(),
        expected_revision: expected,
    }
}

fn commit(changes: Vec<SpaceChange>) -> SpaceCommit {
    SpaceCommit { changes }
}

/// A repository over `database` holding the aggregate `spaces` rooted at
/// `meta`, put there through `initialize_aggregate`.
async fn seeded(database: &Fresh, meta: &'static str, spaces: &[Fixture]) -> Store {
    let store = Arc::new(database.open());
    let answer = store
        .initialize_aggregate(input(meta, spaces))
        .await
        .unwrap();
    assert!(
        matches!(answer, InitializeResult::Initialized(_)),
        "could not seed the aggregate: {answer:?}"
    );
    store
}

/// `operation` over `store`, running on its own.
fn spawn<R, F, Fut>(store: &Store, operation: F) -> JoinHandle<R>
where
    F: FnOnce(Store) -> Fut,
    Fut: Future<Output = R> + Send + 'static,
    R: Send + 'static,
{
    tokio::spawn(operation(Arc::clone(store)))
}

/// A transaction on a connection of its own, standing in for another host.
struct Blocker(PgConnection);

impl Blocker {
    async fn begin(database: &Fresh) -> Self {
        let mut connection = database.connect().await;
        sqlx::raw_sql("BEGIN")
            .execute(&mut connection)
            .await
            .unwrap();
        Self(connection)
    }

    async fn run(&mut self, statements: &str) {
        sqlx::raw_sql(sqlx::AssertSqlSafe(statements.to_owned()))
            .execute(&mut self.0)
            .await
            .unwrap();
    }

    async fn commit(mut self) {
        self.run("COMMIT").await;
        self.0.close().await.unwrap();
    }
}

/// Return once at least `count` sessions on `database` wait for a lock.
async fn waiting(database: &Fresh, count: i64) {
    let mut watcher = database.connect().await;
    let deadline = tokio::time::Instant::now() + PATIENCE;
    loop {
        let waiters: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM pg_stat_activity \
             WHERE datname = current_database() AND wait_event_type = 'Lock'",
        )
        .fetch_one(&mut watcher)
        .await
        .unwrap();
        if waiters >= count {
            break;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "{count} session(s) never waited for a lock; {waiters} did"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    watcher.close().await.unwrap();
}

/// A probe stopping `store`'s first operation to reach a step `at` accepts
/// until released, telling the test it got there; later steps pass.
fn pause_once(store: &Store, at: fn(&Step) -> bool) -> (Arc<Notify>, Arc<Notify>) {
    let reached = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let paused = Arc::new(AtomicBool::new(false));
    let (signal, wait) = (Arc::clone(&reached), Arc::clone(&release));
    let probe: Probe = Arc::new(move |step| {
        let (signal, wait, paused) = (Arc::clone(&signal), Arc::clone(&wait), Arc::clone(&paused));
        Box::pin(async move {
            if at(&step) && !paused.swap(true, Ordering::SeqCst) {
                signal.notify_one();
                wait.notified().await;
            }
        })
    });
    store.set_probe(Some(probe));
    (reached, release)
}

async fn joined<R>(handle: JoinHandle<R>) -> R {
    handle.await.unwrap()
}

/// `task` once it has reached the probe `reached` signals, failing with its
/// result if it finishes first, or if it gets there in no less than
/// [`PATIENCE`].
async fn rendezvous<R: std::fmt::Debug>(
    reached: &Notify,
    mut task: JoinHandle<R>,
) -> JoinHandle<R> {
    tokio::select! {
        () = reached.notified() => task,
        finished = &mut task => {
            panic!("the task finished before it reached its probe: {finished:?}")
        }
        () = tokio::time::sleep(PATIENCE) => {
            task.abort();
            panic!("the task did not reach its probe within {PATIENCE:?}")
        }
    }
}

/// A raw statement's failure, as `(SQLSTATE, message)`.
async fn refused(database: &Fresh, statement: &str) -> (String, String) {
    let mut connection = database.connect().await;
    let error = sqlx::raw_sql(sqlx::AssertSqlSafe(statement.to_owned()))
        .execute(&mut connection)
        .await
        .expect_err("the statement is refused");
    let database_error = error.as_database_error().expect("a database error");
    (
        database_error.code().unwrap_or_default().into_owned(),
        database_error.message().to_owned(),
    )
}

mod given_its_schema {
    use super::*;

    // Case: refuses a write of text that is not JSON into spaces.document
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_a_write_of_text_that_is_not_json_into_spaces_document() {
        let database = Fresh::new().await;
        database
            .execute(&proposal(OTHER_SPACE_ID, "Corruptible").inserts())
            .await;
        let (code, _) = refused(
            &database,
            &format!("UPDATE spaces SET document = 'not json' WHERE id = '{OTHER_SPACE_ID}'"),
        )
        .await;
        assert_eq!(code, "22P02");
        assert_eq!(
            database
                .scalar(&format!(
                    "SELECT document->>'title' FROM spaces WHERE id = '{OTHER_SPACE_ID}'"
                ))
                .await
                .as_deref(),
            Some("Corruptible")
        );
    }

    // Case: prevents direct deletion of the Meta Space while repository state names it
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn prevents_direct_deletion_of_the_meta_space_while_repository_state_names_it() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let (code, message) = refused(
            &database,
            &format!("DELETE FROM spaces WHERE id = '{SPACE_ID}'"),
        )
        .await;
        assert_eq!(code, "23503");
        assert!(
            message.contains("repository_state_meta_space_id_fkey"),
            "{message}"
        );
        assert_eq!(
            store.load_space(space(SPACE_ID)).await.unwrap(),
            Some(repository_space().at(Revision::FIRST))
        );
        store.close().await;
    }
}

mod given_the_lock_key {
    use super::*;

    /// Each `pg_advisory_xact_lock` in `source`, as its mode and key.
    fn advisory_locks(source: &str) -> Vec<(&'static str, String)> {
        const CALL: &str = "pg_advisory_xact_lock";
        let mut locks = Vec::new();
        let mut rest = source;
        while let Some(at) = rest.find(CALL) {
            rest = &rest[at + CALL.len()..];
            let (mode, arguments) = match rest.strip_prefix("_shared(") {
                Some(arguments) => ("shared", arguments),
                None => match rest.strip_prefix('(') {
                    Some(arguments) => ("exclusive", arguments),
                    None => continue,
                },
            };
            let Some(end) = arguments.find(')') else {
                continue;
            };
            let key: Vec<&str> = arguments[..end].split(',').map(str::trim).collect();
            if key.len() == 2 && key.iter().all(|part| part.parse::<i32>().is_ok()) {
                locks.push((mode, key.join(",")));
            }
        }
        locks
    }

    // The TypeScript store names its key as a literal in each mode's
    // statement; Rust takes the same one, or the two runtimes' modes would
    // not exclude each other.
    #[test]
    fn is_the_key_the_typescript_store_names_in_each_mode() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/prisma/sql-store.ts");
        let source = std::fs::read_to_string(&path).unwrap();
        let locks = advisory_locks(&source);
        let mut modes: Vec<&str> = locks.iter().map(|(mode, _)| *mode).collect();
        modes.sort_unstable();
        assert_eq!(modes, ["exclusive", "shared"], "{locks:?}");
        let (first, second) = host::AGGREGATE_LOCK_KEY;
        for (mode, key) in &locks {
            assert_eq!(key, &format!("{first},{second}"), "the {mode} lock");
        }
    }

    /// The advisory lock `store`'s next operation holds when it reaches
    /// `Step::Locked`, as `pg_locks` shows it.
    async fn held_by(
        database: &Fresh,
        store: &Store,
        operation: impl FnOnce(Store) -> JoinHandle<()>,
    ) -> String {
        let (reached, release) = pause_once(store, |step| matches!(step, Step::Locked(_)));
        let running = operation(Arc::clone(store));
        let running = rendezvous(&reached, running).await;
        let held = database
            .scalar(
                "SELECT string_agg(concat_ws(' ', classid, objid, objsubid, mode), '; ') \
                 FROM pg_locks WHERE locktype = 'advisory' AND granted \
                 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
            )
            .await
            .unwrap_or_default();
        release.notify_one();
        joined(running).await;
        held
    }

    // Case: is the same key in the exclusive and the shared mode
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn is_the_same_key_in_the_exclusive_and_the_shared_mode() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let exclusive = held_by(&database, &store, |store| {
            tokio::spawn(async move {
                store.load_aggregate().await.unwrap();
            })
        })
        .await;
        let shared = held_by(&database, &store, |store| {
            tokio::spawn(async move {
                let answer = store
                    .commit(commit(vec![update(
                        &repository_space().titled("Renamed"),
                        Revision::FIRST,
                    )]))
                    .await
                    .unwrap();
                assert!(matches!(answer, CommitResult::Committed { .. }));
            })
        })
        .await;
        // Two int4 keys: classid and objid, with objsubid 2.
        assert_eq!(exclusive, "1213812818 1 2 ExclusiveLock");
        assert_eq!(shared, "1213812818 1 2 ShareLock");
        store.close().await;
    }
}

mod given_another_host_holding_the_aggregate_lock {
    use super::*;

    async fn holding(database: &Fresh, mode: &str) -> Blocker {
        let mut blocker = Blocker::begin(database).await;
        blocker
            .run(&format!(
                "SELECT pg_advisory_xact_lock{mode}(1213812818, 1)"
            ))
            .await;
        blocker
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn waits_with_an_aggregate_commit_while_it_is_held_exclusively() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[linked_space(), other_space()]).await;
        let blocker = holding(&database, "").await;
        let committing = spawn(&store, |store| async move {
            store
                .commit(commit(vec![
                    update(&linked_space().titled("Coordinated meta"), Revision::FIRST),
                    update(&other_space().titled("Coordinated other"), Revision::FIRST),
                ]))
                .await
        });
        waiting(&database, 1).await;
        assert!(!committing.is_finished());
        blocker.commit().await;
        assert!(matches!(
            joined(committing).await.unwrap(),
            CommitResult::Committed { .. }
        ));
        store.close().await;
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn waits_with_a_single_space_edit_while_it_is_held_exclusively() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let blocker = holding(&database, "").await;
        let committing = spawn(&store, |store| async move {
            store
                .commit(commit(vec![update(
                    &repository_space().titled("After the lock"),
                    Revision::FIRST,
                )]))
                .await
        });
        waiting(&database, 1).await;
        assert!(!committing.is_finished());
        blocker.commit().await;
        assert!(matches!(
            joined(committing).await.unwrap(),
            CommitResult::Committed { .. }
        ));
        store.close().await;
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn commits_a_single_space_edit_while_it_is_held_shared() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let blocker = holding(&database, "_shared").await;
        let answer = tokio::time::timeout(
            PATIENCE,
            store.commit(commit(vec![update(
                &repository_space().titled("Beside the lock"),
                Revision::FIRST,
            )])),
        )
        .await
        .expect("the edit does not wait for a shared holder")
        .unwrap();
        assert!(matches!(answer, CommitResult::Committed { .. }));
        blocker.commit().await;
        store.close().await;
    }
}

mod given_a_writer_outside_the_lock {
    use super::*;

    // Case: classifies initialization when a concurrent winner takes a shared Resource identity
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn classifies_initialization_when_a_concurrent_winner_takes_a_shared_resource_identity() {
        let database = Fresh::new().await;
        let store: Store = Arc::new(database.open());
        let winner = Fixture {
            id: SPACE_ID,
            document: plain("Winner"),
            resources: vec![(RESOURCE_ID, markdown("Shared"))],
        };
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "{} INSERT INTO repository_state (singleton_id, meta_space_id) \
                 VALUES (1, '{SPACE_ID}');",
                winner.inserts()
            ))
            .await;
        let loser = Fixture {
            id: CONCURRENT_SPACE_ID,
            document: plain("Loser"),
            resources: vec![(RESOURCE_ID, markdown("Shared"))],
        };
        let initializing = spawn(&store, |store| async move {
            store
                .initialize_aggregate(input(CONCURRENT_SPACE_ID, &[loser]))
                .await
        });
        waiting(&database, 1).await;
        blocker.commit().await;
        let answer = joined(initializing).await.unwrap();
        assert_eq!(
            answer,
            InitializeResult::AlreadyInitialized(LoadedAggregate {
                meta_space_id: space(SPACE_ID),
                spaces: vec![winner.at(Revision::FIRST)],
            })
        );
        store.close().await;
    }

    // The same race on the `spaces` primary key.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn classifies_initialization_when_a_concurrent_winner_takes_its_space_identity() {
        let database = Fresh::new().await;
        let store: Store = Arc::new(database.open());
        let winner = proposal(FIRST_META_ID, "Raw winner");
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "{} INSERT INTO repository_state (singleton_id, meta_space_id) \
                 VALUES (1, '{FIRST_META_ID}');",
                winner.inserts()
            ))
            .await;
        let initializing = spawn(&store, |store| async move {
            store
                .initialize_aggregate(input(
                    FIRST_META_ID,
                    &[proposal(FIRST_META_ID, "First proposal")],
                ))
                .await
        });
        waiting(&database, 1).await;
        blocker.commit().await;
        assert_eq!(
            joined(initializing).await.unwrap(),
            InitializeResult::AlreadyInitialized(LoadedAggregate {
                meta_space_id: space(FIRST_META_ID),
                spaces: vec![winner.at(Revision::FIRST)],
            })
        );
        store.close().await;
    }

    // The same race on the `repository_state` primary key.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn classifies_initialization_when_a_concurrent_winner_takes_the_meta_identity() {
        let database = Fresh::new().await;
        let store: Store = Arc::new(database.open());
        let winner = proposal(SECOND_META_ID, "Raw winner");
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "{} INSERT INTO repository_state (singleton_id, meta_space_id) \
                 VALUES (1, '{SECOND_META_ID}');",
                winner.inserts()
            ))
            .await;
        let initializing = spawn(&store, |store| async move {
            store
                .initialize_aggregate(input(
                    FIRST_META_ID,
                    &[proposal(FIRST_META_ID, "First proposal")],
                ))
                .await
        });
        waiting(&database, 1).await;
        blocker.commit().await;
        assert_eq!(
            joined(initializing).await.unwrap(),
            InitializeResult::AlreadyInitialized(LoadedAggregate {
                meta_space_id: space(SECOND_META_ID),
                spaces: vec![winner.at(Revision::FIRST)],
            })
        );
        assert_eq!(
            store.load_space(space(FIRST_META_ID)).await.unwrap(),
            None,
            "the losing proposal's Space rolled back"
        );
        store.close().await;
    }

    // Case: commits a topology-preserving edit without waiting for the repository singleton lock
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn commits_a_topology_preserving_edit_without_waiting_for_the_repository_singleton_lock()
    {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE repository_state SET meta_space_id = '{SPACE_ID}' WHERE singleton_id = 1"
            ))
            .await;
        let answer = tokio::time::timeout(
            PATIENCE,
            store.commit(commit(vec![update(
                &repository_space().titled("Changed without aggregate lock"),
                Revision::FIRST,
            )])),
        )
        .await
        .expect("the edit does not wait for the singleton row")
        .unwrap();
        assert_eq!(
            answer,
            CommitResult::Committed {
                revisions: vec![(space(SPACE_ID), revision(1))],
                deleted_space_ids: vec![],
            }
        );
        blocker.commit().await;
        store.close().await;
    }

    // Case: refuses an unlocked single-Space write whose row moved after it read the revision
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_an_unlocked_single_space_write_whose_row_moved_after_it_read_the_revision() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE spaces SET document = '{}'::jsonb, revision = '1' WHERE id = '{SPACE_ID}'",
                plain("Moved by the other writer")
            ))
            .await;
        let committing = spawn(&store, |store| async move {
            store
                .commit(commit(vec![update(
                    &repository_space().titled("Written against the stale read"),
                    Revision::FIRST,
                )]))
                .await
        });
        waiting(&database, 1).await;
        assert!(!committing.is_finished());
        blocker.commit().await;
        let moved = repository_space().titled("Moved by the other writer");
        assert_eq!(
            joined(committing).await.unwrap(),
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: space(SPACE_ID),
                current: Some(moved.at(revision(1))),
            }])
        );
        assert_eq!(
            store.load_space(space(SPACE_ID)).await.unwrap(),
            Some(moved.at(revision(1))),
            "the writer that committed is the one still standing"
        );
        store.close().await;
    }

    // ST-17: a conflict carries the current Space from one stored state. The
    // writer moves the Space row before the edit starts, uncommitted, and
    // holds the Resource table, so the edit can read the Space row only
    // before the writer commits and its Resource rows only after.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn conflicts_a_stale_single_space_edit_with_the_space_and_resources_of_one_stored_state()
    {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "LOCK TABLE resources IN ACCESS EXCLUSIVE MODE; \
                 UPDATE spaces SET document = '{}'::jsonb, revision = '1' WHERE id = '{SPACE_ID}'; \
                 UPDATE resources SET document = '{}'::jsonb WHERE id = '{RESOURCE_ID}';",
                plain("Moved by the other writer"),
                markdown("Changed by the other writer")
            ))
            .await;
        let committing = spawn(&store, |store| async move {
            store
                .commit(commit(vec![update(
                    &repository_space().titled("Written against a revision never stored"),
                    revision(7),
                )]))
                .await
        });
        waiting(&database, 1).await;
        assert!(!committing.is_finished(), "the edit waits for the writer");
        blocker.commit().await;
        let moved = Fixture {
            id: SPACE_ID,
            document: plain("Moved by the other writer"),
            resources: vec![
                (RESOURCE_ID, markdown("Changed by the other writer")),
                (OMITTED_RESOURCE_ID, markdown("Resource to remove")),
            ],
        };
        assert_eq!(
            joined(committing).await.unwrap(),
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: space(SPACE_ID),
                current: Some(moved.at(revision(1))),
            }]),
            "the conflict carries the Space row and the Resource rows the writer committed"
        );
        store.close().await;
    }

    // Case: refuses a multi-Space write whose row moved after the conflict check read it
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_a_multi_space_write_whose_row_moved_after_the_conflict_check_read_it() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[linked_space(), other_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE spaces SET document = '{}'::jsonb, revision = '1' \
                 WHERE id = '{OTHER_SPACE_ID}'",
                plain("Moved by the unlocked writer")
            ))
            .await;
        let committing = spawn(&store, |store| async move {
            store
                .commit(commit(vec![
                    update(&linked_space().titled("Coordinated meta"), Revision::FIRST),
                    update(&other_space().titled("Coordinated other"), Revision::FIRST),
                ]))
                .await
        });
        waiting(&database, 1).await;
        assert!(!committing.is_finished());
        blocker.commit().await;
        let moved = Fixture {
            document: plain("Moved by the unlocked writer"),
            ..other_space()
        };
        assert_eq!(
            joined(committing).await.unwrap(),
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: space(OTHER_SPACE_ID),
                current: Some(moved.at(revision(1))),
            }])
        );
        assert_eq!(
            store.load_space(space(SPACE_ID)).await.unwrap(),
            Some(linked_space().at(Revision::FIRST)),
            "the whole commit rolled back"
        );
        store.close().await;
    }
}

mod given_overlapping_replacements {
    use super::*;

    fn replacement() -> Fixture {
        proposal(SPACE_ID, "Replacement")
    }

    // Case: settles two overlapping truncations of Spaces stored without Meta as results
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn settles_two_overlapping_truncations_of_spaces_stored_without_meta_as_results() {
        let database = Fresh::new().await;
        database
            .execute(&proposal(CONCURRENT_SPACE_ID, "Orphan").inserts())
            .await;
        let store: Store = Arc::new(database.open());
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE spaces SET document = '{}'::jsonb WHERE id = '{CONCURRENT_SPACE_ID}'",
                plain("Orphan")
            ))
            .await;
        let first = spawn(&store, |store| async move {
            store
                .replace_aggregate(input(SPACE_ID, &[replacement()]), None)
                .await
        });
        waiting(&database, 1).await;
        let second = spawn(&store, |store| async move {
            store
                .replace_aggregate(input(OTHER_SPACE_ID, &[other_space()]), None)
                .await
        });
        waiting(&database, 2).await;
        blocker.commit().await;
        let results = [joined(first).await.unwrap(), joined(second).await.unwrap()];
        // The first holds the exclusive lock while it waits on the blocked
        // row, so it installs first and the second finds its Meta.
        assert!(
            matches!(results[0], ReplaceResult::Replaced(_)),
            "the first replacement wins: {results:?}"
        );
        assert_eq!(
            results[1],
            ReplaceResult::Conflict {
                current_meta_space_id: Some(space(SPACE_ID))
            },
            "the second names the winner's Meta Space"
        );
        assert_eq!(
            store.load_aggregate().await.unwrap(),
            aggregate(SPACE_ID, vec![replacement().at(Revision::FIRST)]),
            "the winner's Aggregate is stored"
        );
        store.close().await;
    }

    // Case: conflicts when an authored commit wins after replacement reads its baseline
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn conflicts_when_an_authored_commit_wins_after_replacement_reads_its_baseline() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE spaces SET document = '{}'::jsonb, revision = '1' WHERE id = '{SPACE_ID}'",
                plain("Authored winner")
            ))
            .await;
        let replacing = spawn(&store, |store| async move {
            store
                .replace_aggregate(
                    input(
                        SPACE_ID,
                        &[repository_space().titled("Administrative replacement")],
                    ),
                    Some(space(SPACE_ID)),
                )
                .await
        });
        waiting(&database, 1).await;
        assert!(!replacing.is_finished());
        blocker.commit().await;
        assert_eq!(
            joined(replacing).await.unwrap(),
            ReplaceResult::Conflict {
                current_meta_space_id: Some(space(SPACE_ID)),
            }
        );
        assert_eq!(
            store.load_space(space(SPACE_ID)).await.unwrap(),
            Some(repository_space().titled("Authored winner").at(revision(1)))
        );
        store.close().await;
    }

    // Case: conflicts the loser when two replacements overlap on the Meta row lock
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn conflicts_the_loser_when_two_replacements_overlap_on_the_meta_row_lock() {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE repository_state SET meta_space_id = '{SPACE_ID}' WHERE singleton_id = 1"
            ))
            .await;
        let queued_first = spawn(&store, |store| async move {
            store
                .replace_aggregate(
                    input(OTHER_SPACE_ID, &[other_space()]),
                    Some(space(SPACE_ID)),
                )
                .await
        });
        waiting(&database, 1).await;
        let queued_second = spawn(&store, |store| async move {
            store
                .replace_aggregate(
                    input(CONCURRENT_SPACE_ID, &[concurrent_space()]),
                    Some(space(SPACE_ID)),
                )
                .await
        });
        waiting(&database, 2).await;
        blocker.commit().await;
        let results = [
            joined(queued_first).await.unwrap(),
            joined(queued_second).await.unwrap(),
        ];
        let first_won = matches!(results[0], ReplaceResult::Replaced(_));
        let (winner, loser) = if first_won {
            (other_space(), &results[1])
        } else {
            (concurrent_space(), &results[0])
        };
        assert!(
            results
                .iter()
                .filter(|result| matches!(result, ReplaceResult::Replaced(_)))
                .count()
                == 1,
            "{results:?}"
        );
        assert_eq!(
            loser,
            &ReplaceResult::Conflict {
                current_meta_space_id: Some(space(winner.id)),
            }
        );
        assert_eq!(
            store.load_aggregate().await.unwrap(),
            aggregate(winner.id, vec![winner.at(Revision::FIRST)])
        );
        store.close().await;
    }

    /// The statements retiring `SPACE_ID`'s aggregate and establishing one
    /// rooted at `meta` holding `spaces` in its place.
    fn retiring(meta: &str, spaces: &[Fixture]) -> String {
        let mut statements = format!(
            "DELETE FROM repository_state; \
             DELETE FROM resources WHERE space_id = '{SPACE_ID}'; \
             DELETE FROM spaces WHERE id = '{SPACE_ID}';"
        );
        for fixture in spaces {
            statements.push_str(&fixture.inserts());
        }
        statements.push_str(&format!(
            "INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, '{meta}');"
        ));
        statements
    }

    async fn holding_the_meta_row(database: &Fresh) -> Blocker {
        let mut blocker = Blocker::begin(database).await;
        blocker
            .run(&format!(
                "UPDATE repository_state SET meta_space_id = '{SPACE_ID}' WHERE singleton_id = 1"
            ))
            .await;
        blocker
    }

    // Case: conflicts a replacement authorized against an identity a concurrent replacement retired
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn conflicts_a_replacement_authorized_against_an_identity_a_concurrent_replacement_retired()
     {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = holding_the_meta_row(&database).await;
        let racing = spawn(&store, |store| async move {
            store
                .replace_aggregate(
                    input(SPACE_ID, &[repository_space().titled("Must not land")]),
                    Some(space(SPACE_ID)),
                )
                .await
        });
        waiting(&database, 1).await;
        blocker
            .run(&retiring(OTHER_SPACE_ID, &[other_space()]))
            .await;
        blocker.commit().await;
        assert_eq!(
            joined(racing).await.unwrap(),
            ReplaceResult::Conflict {
                current_meta_space_id: Some(space(OTHER_SPACE_ID)),
            }
        );
        assert_eq!(
            store.load_aggregate().await.unwrap(),
            aggregate(OTHER_SPACE_ID, vec![other_space().at(Revision::FIRST)])
        );
        store.close().await;
    }

    // Case: judges a complete-aggregate commit against an identity a concurrent replacement retired
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn judges_a_complete_aggregate_commit_against_an_identity_a_concurrent_replacement_retired()
     {
        let database = Fresh::new().await;
        let linked_other = other_space().with(
            RACE_LINK_RESOURCE_ID,
            space_link(
                "To the race child",
                RACE_CHILD_SPACE_ID,
                RACE_CHILD_MAP_ID,
                RACE_CHILD_GRAPH_ID,
            ),
        );
        let race_child = Fixture {
            id: RACE_CHILD_SPACE_ID,
            document: mapped("Race child", RACE_CHILD_MAP_ID, RACE_CHILD_GRAPH_ID),
            resources: vec![],
        };
        let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
        let mut blocker = holding_the_meta_row(&database).await;
        let racing = {
            let (linked_other, race_child) = (linked_other.clone(), race_child.clone());
            spawn(&store, |store| async move {
                store
                    .commit(commit(vec![
                        update(&linked_other.titled("Retitled after race"), Revision::FIRST),
                        update(&race_child.titled("Retitled child"), Revision::FIRST),
                    ]))
                    .await
            })
        };
        waiting(&database, 1).await;
        blocker
            .run(&retiring(
                OTHER_SPACE_ID,
                &[linked_other.clone(), race_child.clone()],
            ))
            .await;
        blocker.commit().await;
        assert!(
            matches!(
                joined(racing).await.unwrap(),
                CommitResult::Committed { .. }
            ),
            "judged against the identity the replacement established"
        );
        assert_eq!(
            store.load_space(space(OTHER_SPACE_ID)).await.unwrap(),
            Some(linked_other.titled("Retitled after race").at(revision(1)))
        );
        store.close().await;
    }

    // Case: rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn rolls_back_an_earlier_rows_relock_when_a_later_row_in_the_same_replacement_conflicts()
    {
        let database = Fresh::new().await;
        let store = seeded(&database, SPACE_ID, &[linked_space(), other_space()]).await;
        let mut blocker = Blocker::begin(&database).await;
        blocker
            .run(&format!(
                "UPDATE spaces SET revision = '0' WHERE id = '{OTHER_SPACE_ID}'"
            ))
            .await;
        let racing = spawn(&store, |store| async move {
            store
                .replace_aggregate(
                    input(SPACE_ID, &[repository_space()]),
                    Some(space(SPACE_ID)),
                )
                .await
        });
        // `SPACE_ID` sorts first, so its row is locked before the
        // replacement waits on `OTHER_SPACE_ID`'s.
        waiting(&database, 1).await;
        blocker
            .run(&format!(
                "UPDATE spaces SET revision = '1' WHERE id = '{OTHER_SPACE_ID}'"
            ))
            .await;
        blocker.commit().await;
        assert_eq!(
            joined(racing).await.unwrap(),
            ReplaceResult::Conflict {
                current_meta_space_id: Some(space(SPACE_ID)),
            }
        );
        assert_eq!(
            store.load_space(space(SPACE_ID)).await.unwrap(),
            Some(linked_space().at(Revision::FIRST)),
            "nothing the replacement wrote survives"
        );
        store.close().await;
    }
}

mod given_concurrent_commits {
    use super::*;

    // Case: serializes concurrent topology commits so the loser observes the complete winner
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serializes_concurrent_topology_commits_so_the_loser_observes_the_complete_winner() {
        let database = Fresh::new().await;
        seeded(&database, SPACE_ID, &[repository_space()])
            .await
            .close()
            .await;
        let first: Store = Arc::new(database.open());
        let second: Store = Arc::new(database.open());
        let first_target = Fixture {
            id: OTHER_SPACE_ID,
            document: mapped("First target", OTHER_SPACE_MAP_ID, OTHER_SPACE_GRAPH_ID),
            resources: vec![],
        };
        let second_target = Fixture {
            id: CONCURRENT_SPACE_ID,
            document: mapped("Second target", CONCURRENT_MAP_ID, CONCURRENT_GRAPH_ID),
            resources: vec![],
        };
        let first_linked = repository_space().with(
            MISSING_RESOURCE_ID,
            space_link(
                "First link",
                OTHER_SPACE_ID,
                OTHER_SPACE_MAP_ID,
                OTHER_SPACE_GRAPH_ID,
            ),
        );
        let second_linked = repository_space().with(
            UNRESOLVED_RESOURCE_ID,
            space_link(
                "Second link",
                CONCURRENT_SPACE_ID,
                CONCURRENT_MAP_ID,
                CONCURRENT_GRAPH_ID,
            ),
        );
        let proposing = |linked: &Fixture, target: &Fixture| {
            commit(vec![
                update(linked, Revision::FIRST),
                SpaceChange::Create {
                    space_id: space(target.id),
                    snapshot: target.snapshot(),
                },
            ])
        };
        let (first_commit, second_commit) = (
            proposing(&first_linked, &first_target),
            proposing(&second_linked, &second_target),
        );
        // The first holds the exclusive lock until the second is seen
        // waiting for it, so the two overlap rather than run in turn.
        let (reached, release) = pause_once(&first, |step| {
            matches!(step, Step::Locked(LockMode::Exclusive))
        });
        let first_result = rendezvous(
            &reached,
            spawn(
                &first,
                |store| async move { store.commit(first_commit).await },
            ),
        )
        .await;
        let second_result = spawn(
            &second,
            |store| async move { store.commit(second_commit).await },
        );
        waiting(&database, 1).await;
        release.notify_one();
        let results = [
            joined(first_result).await.unwrap(),
            joined(second_result).await.unwrap(),
        ];
        let first_won = matches!(results[0], CommitResult::Committed { .. });
        let (meta, target, losing_target, loser) = if first_won {
            (first_linked, first_target, CONCURRENT_SPACE_ID, &results[1])
        } else {
            (second_linked, second_target, OTHER_SPACE_ID, &results[0])
        };
        assert_eq!(
            results
                .iter()
                .filter(|result| matches!(result, CommitResult::Committed { .. }))
                .count(),
            1,
            "{results:?}"
        );
        assert_eq!(
            loser,
            &CommitResult::Conflict(vec![SpaceConflict {
                space_id: space(SPACE_ID),
                current: Some(meta.at(revision(1))),
            }])
        );
        assert_eq!(
            first.load_aggregate().await.unwrap(),
            aggregate(
                SPACE_ID,
                vec![meta.at(revision(1)), target.at(Revision::FIRST)]
            )
        );
        assert_eq!(first.load_space(space(losing_target)).await.unwrap(), None);
        first.close().await;
        second.close().await;
    }
}

/// Ports of `postgres-aggregate-initialization.test.ts`: an operation
/// stopped at a step under the exclusive aggregate lock, and another
/// runtime's initialization or commit observed waiting for it.
mod given_an_operation_before_initialization {
    use super::*;

    struct Overlap {
        database: Fresh,
        first: Store,
        second: Store,
        reached: Arc<Notify>,
        release: Arc<Notify>,
    }

    /// A migrated, empty database and two runtimes over it, the first of
    /// which stops at the first step `at` accepts.
    async fn overlap(at: fn(&Step) -> bool) -> Overlap {
        let database = Fresh::new().await;
        let first: Store = Arc::new(database.open());
        let second: Store = Arc::new(database.open());
        let (reached, release) = pause_once(&first, at);
        Overlap {
            database,
            first,
            second,
            reached,
            release,
        }
    }

    impl Overlap {
        /// Release the first runtime once the second waits for it.
        async fn release_once_waiting(&self) {
            waiting(&self.database, 1).await;
            self.release.notify_one();
        }

        async fn close(self) {
            self.first.close().await;
            self.second.close().await;
        }
    }

    fn meta_read(step: &Step) -> bool {
        matches!(step, Step::MetaRead)
    }

    fn spaces_read(step: &Step) -> bool {
        matches!(step, Step::FoundEmpty)
    }

    fn meta_delete(step: &Step) -> bool {
        matches!(step, Step::Cleared)
    }

    fn first_meta() -> Fixture {
        proposal(FIRST_META_ID, "First proposal")
    }

    fn second_meta() -> Fixture {
        proposal(SECOND_META_ID, "Second proposal")
    }

    fn initializing(store: &Store, meta: Fixture) -> JoinHandle<InitializeResult> {
        spawn(store, |store| async move {
            store
                .initialize_aggregate(input(meta.id, &[meta]))
                .await
                .unwrap()
        })
    }

    /// Whether a session on `database` other than the asking one holds a
    /// granted `mode` lock on `table`.
    async fn held_elsewhere(database: &Fresh, table: &str, mode: &str) -> bool {
        let mut watcher = database.connect().await;
        let held: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM pg_locks AS held \
             JOIN pg_class AS class ON class.oid = held.relation \
             WHERE held.database = (SELECT oid FROM pg_database WHERE datname = current_database()) \
             AND class.relname = $1 AND held.mode = $2 AND held.granted \
             AND held.pid <> pg_backend_pid())",
        )
        .bind(table)
        .bind(mode)
        .fetch_one(&mut watcher)
        .await
        .unwrap();
        watcher.close().await.unwrap();
        held
    }

    /// Stop an initialization at the first step `at` accepts, answer whether
    /// it holds a `mode` lock on `table` there, then let it finish.
    async fn held_at(at: fn(&Step) -> bool, table: &str, mode: &str) -> bool {
        let overlap = overlap(at).await;
        let first = initializing(&overlap.first, first_meta());
        let first = rendezvous(&overlap.reached, first).await;
        let held = held_elsewhere(&overlap.database, table, mode).await;
        overlap.release.notify_one();
        assert!(
            matches!(joined(first).await, InitializeResult::Initialized(_)),
            "the stopped initialization finishes once released"
        );
        overlap.close().await;
        held
    }

    // `meta-read` in the TypeScript file pauses once the Meta identity has
    // been read.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn stops_at_the_meta_read_having_read_the_meta_identity() {
        assert!(
            held_at(meta_read, "repository_state", "AccessShareLock").await,
            "at meta_read the Meta identity has been read"
        );
    }

    // `spaces-read` in the TypeScript file pauses once an initializer has
    // read the stored Spaces, before it writes any.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn stops_at_the_spaces_read_before_writing_anything() {
        assert!(
            !held_at(spaces_read, "spaces", "RowExclusiveLock").await,
            "at spaces_read the initializer has written nothing"
        );
    }

    // `meta-delete` in the TypeScript file pauses once the Meta identity row
    // has been deleted, its transaction still open.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn stops_at_the_meta_delete_having_deleted_the_meta_identity() {
        assert!(
            held_at(meta_delete, "repository_state", "RowExclusiveLock").await,
            "at meta_delete the Meta identity row has been deleted"
        );
    }

    // Case: preserves the successful proposal when another initializer already read an empty aggregate
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn preserves_the_successful_proposal_when_another_initializer_already_read_an_empty_aggregate()
     {
        let overlap = overlap(spaces_read).await;
        let first = initializing(&overlap.first, first_meta());
        let first = rendezvous(&overlap.reached, first).await;
        let second = initializing(&overlap.second, second_meta());
        overlap.release_once_waiting().await;
        let (first, second) = (joined(first).await, joined(second).await);
        assert!(
            matches!(first, InitializeResult::Initialized(_)),
            "{first:?}"
        );
        assert!(
            matches!(second, InitializeResult::AlreadyInitialized(_)),
            "{second:?}"
        );
        assert_eq!(
            overlap.second.load_aggregate().await.unwrap(),
            aggregate(FIRST_META_ID, vec![first_meta().at(Revision::FIRST)])
        );
        overlap.close().await;
    }

    // Case: does not replace a concurrent first aggregate using an absent expected Meta identity
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn does_not_replace_a_concurrent_first_aggregate_using_an_absent_expected_meta_identity()
    {
        let overlap = overlap(meta_read).await;
        let replacing = spawn(&overlap.first, |store| async move {
            store
                .replace_aggregate(input(FIRST_META_ID, &[first_meta()]), None)
                .await
                .unwrap()
        });
        let replacing = rendezvous(&overlap.reached, replacing).await;
        let second = initializing(&overlap.second, second_meta());
        overlap.release_once_waiting().await;
        assert_eq!(joined(replacing).await, ReplaceResult::Uninitialized);
        assert!(matches!(
            joined(second).await,
            InitializeResult::Initialized(_)
        ));
        assert_eq!(
            overlap.second.load_aggregate().await.unwrap(),
            aggregate(SECOND_META_ID, vec![second_meta().at(Revision::FIRST)])
        );
        overlap.close().await;
    }

    // Case: reads a consistent uninitialized aggregate while another runtime initializes it
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn reads_a_consistent_uninitialized_aggregate_while_another_runtime_initializes_it() {
        let overlap = overlap(meta_read).await;
        let loading = spawn(&overlap.first, |store| async move {
            store.load_aggregate().await.unwrap()
        });
        let loading = rendezvous(&overlap.reached, loading).await;
        let second = initializing(&overlap.second, second_meta());
        overlap.release_once_waiting().await;
        assert_eq!(joined(loading).await, AggregateLoad::Uninitialized);
        assert!(matches!(
            joined(second).await,
            InitializeResult::Initialized(_)
        ));
        assert_eq!(
            overlap.second.load_aggregate().await.unwrap(),
            aggregate(SECOND_META_ID, vec![second_meta().at(Revision::FIRST)])
        );
        overlap.close().await;
    }

    // Case: judges a complete-aggregate commit against the aggregate a concurrent initializer establishes
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn judges_a_complete_aggregate_commit_against_the_aggregate_a_concurrent_initializer_establishes()
     {
        let overlap = overlap(spaces_read).await;
        let first = initializing(&overlap.first, second_meta());
        let first = rendezvous(&overlap.reached, first).await;
        let committing = spawn(&overlap.second, |store| async move {
            store
                .commit(commit(vec![SpaceChange::Create {
                    space_id: space(FIRST_META_ID),
                    snapshot: first_meta().snapshot(),
                }]))
                .await
                .unwrap()
        });
        overlap.release_once_waiting().await;
        assert!(matches!(
            joined(first).await,
            InitializeResult::Initialized(_)
        ));
        let refused = joined(committing).await;
        let CommitResult::AggregateRefused(refusal) = &refused else {
            panic!("expected the commit refused, got {refused:?}");
        };
        assert_eq!(
            refusal.refusals,
            [intake::Refusal::OrdinarySpaceUnreferenced {
                space: space(FIRST_META_ID)
            }],
            "the commit is refused for the Space it creates, which nothing references"
        );
        assert_eq!(
            overlap.second.load_aggregate().await.unwrap(),
            aggregate(SECOND_META_ID, vec![second_meta().at(Revision::FIRST)])
        );
        overlap.close().await;
    }

    async fn initializes_without_losing_integrity(
        at: fn(&Step) -> bool,
        competing: Fixture,
        expected: fn(&InitializeResult) -> bool,
    ) {
        let overlap = overlap(at).await;
        let first = initializing(&overlap.first, first_meta());
        let first = rendezvous(&overlap.reached, first).await;
        let second = initializing(&overlap.second, competing);
        overlap.release_once_waiting().await;
        let (first, second) = (joined(first).await, joined(second).await);
        assert!(
            matches!(first, InitializeResult::Initialized(_)),
            "{first:?}"
        );
        assert!(expected(&second), "{second:?}");
        assert_eq!(
            overlap.second.load_aggregate().await.unwrap(),
            aggregate(FIRST_META_ID, vec![first_meta().at(Revision::FIRST)])
        );
        overlap.close().await;
    }

    // Case: initializes without losing integrity after $boundary with $expected competing proposal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn initializes_without_losing_integrity_after_meta_read_with_already_initialized_competing_proposal()
     {
        initializes_without_losing_integrity(meta_read, second_meta(), |result| {
            matches!(result, InitializeResult::AlreadyInitialized(_))
        })
        .await;
    }

    // Case: initializes without losing integrity after $boundary with $expected competing proposal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn initializes_without_losing_integrity_after_meta_read_with_existing_competing_proposal()
    {
        initializes_without_losing_integrity(meta_read, first_meta(), |result| {
            matches!(result, InitializeResult::Existing(_))
        })
        .await;
    }

    // Case: initializes without losing integrity after $boundary with $expected competing proposal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn initializes_without_losing_integrity_after_meta_delete_with_already_initialized_competing_proposal()
     {
        initializes_without_losing_integrity(meta_delete, second_meta(), |result| {
            matches!(result, InitializeResult::AlreadyInitialized(_))
        })
        .await;
    }
}
