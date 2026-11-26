//! Races between operations on the PostgreSQL store (ADR 0177): ports of
//! `test/support/fast-path-races.ts`, which TypeScript runs on PostgreSQL with
//! `runsCommitsConcurrently: true` (`test/integration/fast-path-races.test.ts`),
//! and operations started together, each ending in a state one sequential
//! order produces.
//!
//! A race pauses the first operation at a step through the repository's probe
//! (`Step`), where `instrumentStore` holds the TypeScript store, sees the
//! second waiting for a lock in `pg_stat_activity`, then releases the first.
//! Both run on one repository, as TypeScript's two repositories share one
//! pool. Every test needs the server `INFINITY_CUBE_POSTGRES_TEST_URL` names.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod postgres_support;

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use host::{
    AggregateInput, AggregateLoad, CommitResult, InitializeResult, LoadedAggregate, LoadedSpace,
    LockMode, MemorySpaceRepository, PostgresSpaceRepository, Probe, ReplaceResult, Revision,
    SpaceChange, SpaceCommit, SpaceConflict, SpaceRepository, Step,
};
use intake::{SpaceId, SpaceSnapshot};
use postgres_support::{Fresh, rendezvous, waiting};
use tokio::sync::{Barrier, Notify};
use tokio::task::JoinHandle;

type Store = Arc<PostgresSpaceRepository>;

const EMPTY_ASSET_REF: &str = "/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

/// How long a wait the test expects to be observed may take to appear, and
/// how long a commit that must not wait may take to answer.
const PATIENCE: Duration = Duration::from_secs(30);

/// `fast-path-races.ts`'s `idAt`.
fn id_at(offset: u64) -> String {
    format!("21e00000-0000-4000-8000-{offset:012x}")
}

fn space(id: &str) -> SpaceId {
    SpaceId::parse(id).unwrap()
}

fn revision(value: u64) -> Revision {
    Revision::new(value).unwrap()
}

struct Ids {
    meta: String,
    a: String,
    b: String,
    c: String,
    meta_map: String,
    meta_graph: String,
    a_map: String,
    a_graph: String,
    a_second_graph: String,
    replaced_a_map: String,
    replaced_a_graph: String,
    b_map: String,
    b_graph: String,
    c_map: String,
    c_graph: String,
    link_to_a: String,
    link_to_b: String,
    link_to_c: String,
    a_first: String,
    a_second: String,
    b_first: String,
    shared_resource: String,
}

fn ids() -> Ids {
    Ids {
        meta: id_at(1),
        a: id_at(2),
        b: id_at(3),
        c: id_at(4),
        meta_map: id_at(10),
        meta_graph: id_at(11),
        a_map: id_at(20),
        a_graph: id_at(21),
        a_second_graph: id_at(22),
        replaced_a_map: id_at(23),
        replaced_a_graph: id_at(24),
        b_map: id_at(30),
        b_graph: id_at(31),
        c_map: id_at(32),
        c_graph: id_at(33),
        link_to_a: id_at(40),
        link_to_b: id_at(41),
        link_to_c: id_at(42),
        a_first: id_at(50),
        a_second: id_at(51),
        b_first: id_at(60),
        shared_resource: id_at(70),
    }
}

/// A snapshot from its JSON text, which writes each object's keys in the
/// order `jsonb` holds them (shorter first), so it equals the snapshot read
/// back.
fn snapshot(id: &str, document: &str, resources: &[String]) -> SpaceSnapshot {
    let json = format!(
        r#"{{"id":"{id}","document":{document},"resources":[{}]}}"#,
        resources.join(",")
    );
    intake::decode_space_snapshot(&intake::json::parse(&json).unwrap(), space(id)).unwrap()
}

fn markdown(id: &str, title: &str) -> String {
    format!(
        r#"{{"id":"{id}","document":{{"title":"{title}","kind":"markdown","content":{{"url":"{EMPTY_ASSET_REF}"}}}}}}"#
    )
}

fn link(id: &str, space_id: &str, map: &str, graph: &str) -> String {
    format!(
        r#"{{"id":"{id}","document":{{"title":"Link","kind":"space","content":{{"map":"{map}","graph":"{graph}","spaceId":"{space_id}"}}}}}}"#
    )
}

fn meta(ids: &Ids, links: &[String]) -> SpaceSnapshot {
    let document = format!(
        r#"{{"version":1,"title":"Meta","defaultMap":"{map}","maps":[{{"id":"{map}","title":"Map","kind":"positioned","positions":{{}},"graphs":[{{"id":"{graph}","title":"Graph","edges":[]}}]}}]}}"#,
        map = ids.meta_map,
        graph = ids.meta_graph,
    );
    snapshot(&ids.meta, &document, links)
}

/// Space A, whose first Graph Meta's Space Resource selects; with `selected`
/// false, A without that Graph, its other Graph active. It holds `extra`
/// Resources besides its two.
fn space_a(
    ids: &Ids,
    second_x: u32,
    (map, graph): (&str, &str),
    selected: bool,
    extra: &[String],
) -> SpaceSnapshot {
    let first_graph = format!(
        r#"{{"id":"{graph}","title":"Graph","edges":[{{"to":"{to}","from":"{from}"}}]}},"#,
        to = ids.a_second,
        from = ids.a_first,
    );
    let document = format!(
        r#"{{"version":1,"title":"A","defaultMap":"{map}","maps":[{{"id":"{map}","title":"Map","kind":"positioned","positions":{{"{first}":{{"x":0,"y":0}},"{second}":{{"x":{second_x},"y":0}}}},"graphs":[{first_graph}{{"id":"{other}","title":"Second Graph","edges":[]}}],"activeGraph":"{active}"}}]}}"#,
        first = ids.a_first,
        second = ids.a_second,
        first_graph = if selected { first_graph.as_str() } else { "" },
        other = ids.a_second_graph,
        active = if selected {
            graph
        } else {
            ids.a_second_graph.as_str()
        },
    );
    let mut resources = vec![
        markdown(&ids.a_first, "First"),
        markdown(&ids.a_second, "Second"),
    ];
    resources.extend_from_slice(extra);
    resources.sort();
    snapshot(&ids.a, &document, &resources)
}

/// A Space shaped as `fast-path-races.ts`'s B, at `id` with its own Map,
/// Graph and Resource, holding `extra` Resources besides.
fn space_like_b(
    id: &str,
    map: &str,
    graph: &str,
    first: &str,
    x: u32,
    extra: &[String],
) -> SpaceSnapshot {
    let document = format!(
        r#"{{"version":1,"title":"B","defaultMap":"{map}","maps":[{{"id":"{map}","title":"Map","kind":"positioned","positions":{{"{first}":{{"x":{x},"y":0}}}},"graphs":[{{"id":"{graph}","color":"teal","title":"Graph","edges":[]}}]}}]}}"#
    );
    let mut resources = vec![markdown(first, "First")];
    resources.extend_from_slice(extra);
    resources.sort();
    snapshot(id, &document, &resources)
}

fn space_b(ids: &Ids, x: u32) -> SpaceSnapshot {
    space_like_b(&ids.b, &ids.b_map, &ids.b_graph, &ids.b_first, x, &[])
}

/// The race's fixtures, as `fast-path-races.ts` names them.
struct Fixtures {
    ids: Ids,
    seed_meta: SpaceSnapshot,
    seed_a: SpaceSnapshot,
    seed_b: SpaceSnapshot,
    moved_a: SpaceSnapshot,
    without_selected_graph: SpaceSnapshot,
    meta_selecting_second_graph: SpaceSnapshot,
    replaced_a: SpaceSnapshot,
    replaced_meta: SpaceSnapshot,
    meta_linking_b_only: SpaceSnapshot,
}

fn fixtures() -> Fixtures {
    let ids = ids();
    let link_to_a = link(&ids.link_to_a, &ids.a, &ids.a_map, &ids.a_graph);
    let link_to_b = link(&ids.link_to_b, &ids.b, &ids.b_map, &ids.b_graph);
    Fixtures {
        seed_meta: meta(&ids, &[link_to_a.clone(), link_to_b.clone()]),
        seed_a: space_a(&ids, 300, (&ids.a_map, &ids.a_graph), true, &[]),
        seed_b: space_b(&ids, 0),
        moved_a: space_a(&ids, 640, (&ids.a_map, &ids.a_graph), true, &[]),
        without_selected_graph: space_a(&ids, 300, (&ids.a_map, &ids.a_graph), false, &[]),
        meta_selecting_second_graph: meta(
            &ids,
            &[
                link(&ids.link_to_a, &ids.a, &ids.a_map, &ids.a_second_graph),
                link_to_b.clone(),
            ],
        ),
        replaced_a: space_a(
            &ids,
            300,
            (&ids.replaced_a_map, &ids.replaced_a_graph),
            true,
            &[],
        ),
        replaced_meta: meta(
            &ids,
            &[
                link(
                    &ids.link_to_a,
                    &ids.a,
                    &ids.replaced_a_map,
                    &ids.replaced_a_graph,
                ),
                link_to_b.clone(),
            ],
        ),
        meta_linking_b_only: meta(&ids, &[link_to_b]),
        ids,
    }
}

fn update(snapshot: &SpaceSnapshot, expected: u64) -> SpaceChange {
    SpaceChange::Update {
        space_id: snapshot.id,
        snapshot: snapshot.clone(),
        expected_revision: revision(expected),
    }
}

fn commit(changes: Vec<SpaceChange>) -> SpaceCommit {
    SpaceCommit { changes }
}

fn stored(snapshot: &SpaceSnapshot, at: u64) -> LoadedSpace {
    LoadedSpace {
        snapshot: snapshot.clone(),
        revision: revision(at),
        exported_revision: None,
    }
}

fn aggregate(fixtures: &Fixtures, spaces: Vec<LoadedSpace>) -> AggregateLoad {
    AggregateLoad::Loaded(LoadedAggregate {
        meta_space_id: space(&fixtures.ids.meta),
        spaces,
    })
}

fn committed(answer: &CommitResult) -> bool {
    matches!(answer, CommitResult::Committed { .. })
}

/// A repository over a fresh database holding Meta, A and B, put there
/// through `initialize_aggregate`.
async fn seeded(fixtures: &Fixtures) -> (Fresh, Store) {
    let database = Fresh::new().await;
    let store = Arc::new(database.open());
    let answer = store
        .initialize_aggregate(AggregateInput {
            meta_space_id: space(&fixtures.ids.meta),
            spaces: vec![
                fixtures.seed_meta.clone(),
                fixtures.seed_a.clone(),
                fixtures.seed_b.clone(),
            ],
        })
        .await
        .unwrap();
    assert!(
        matches!(answer, InitializeResult::Initialized(_)),
        "could not seed the aggregate: {answer:?}"
    );
    (database, store)
}

fn spawn<R, F, Fut>(store: &Store, operation: F) -> JoinHandle<R>
where
    F: FnOnce(Store) -> Fut,
    Fut: Future<Output = R> + Send + 'static,
    R: Send + 'static,
{
    tokio::spawn(operation(Arc::clone(store)))
}

async fn joined<R>(handle: JoinHandle<R>) -> R {
    handle.await.unwrap()
}

/// A probe stopping `store`'s first operation to reach a step `at` accepts
/// until released, telling the test it got there; later steps pass.
fn pause_once(
    store: &Store,
    at: impl Fn(&Step) -> bool + Send + Sync + 'static,
) -> (Arc<Notify>, Arc<Notify>) {
    let reached = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let paused = Arc::new(AtomicBool::new(false));
    let at = Arc::new(at);
    let (signal, wait) = (Arc::clone(&reached), Arc::clone(&release));
    let probe: Probe = Arc::new(move |step| {
        let (signal, wait, paused, at) = (
            Arc::clone(&signal),
            Arc::clone(&wait),
            Arc::clone(&paused),
            Arc::clone(&at),
        );
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

mod given_the_fast_path_beside_the_exclusive_lock {
    use super::*;

    // Case: commits a Map-internal Edit under the shared aggregate lock only
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn commits_a_map_internal_edit_under_the_shared_aggregate_lock_only() {
        let fixtures = fixtures();
        let (_database, store) = seeded(&fixtures).await;
        let locks = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&locks);
        let probe: Probe = Arc::new(move |step| {
            if let Step::Locked(mode) = step {
                recorded.lock().unwrap().push(mode);
            }
            Box::pin(async {})
        });
        store.set_probe(Some(probe));
        let take = || std::mem::take(&mut *locks.lock().unwrap());

        let moved = store
            .commit(commit(vec![update(&fixtures.moved_a, 0)]))
            .await
            .unwrap();
        assert!(committed(&moved), "{moved:?}");
        assert_eq!(take(), vec![LockMode::Shared]);

        // A Graph deletion changes what Meta's Space Resource can select, so
        // the fast path hands it to the complete-aggregate decision.
        let deleting = store
            .commit(commit(vec![update(&fixtures.without_selected_graph, 1)]))
            .await
            .unwrap();
        assert!(
            matches!(deleting, CommitResult::AggregateRefused(_)),
            "{deleting:?}"
        );
        assert_eq!(take(), vec![LockMode::Shared, LockMode::Exclusive]);
    }

    // The fast path paused after its read and before its write, where
    // TypeScript pauses it after `loadWithResources`.
    // Case: serialises a Map-internal Edit that read first before a Graph deletion that reads after
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serialises_a_map_internal_edit_that_read_first_before_a_graph_deletion() {
        let fixtures = Arc::new(fixtures());
        let (database, store) = seeded(&fixtures).await;
        let a = space(&fixtures.ids.a);
        let (reached, release) = pause_once(&store, move |step| *step == Step::RowLock(a));
        let change = commit(vec![update(&fixtures.moved_a, 0)]);
        let moving = spawn(&store, |store| async move { store.commit(change).await });
        let moving = rendezvous(&reached, moving).await;
        let change = commit(vec![
            update(&fixtures.without_selected_graph, 0),
            update(&fixtures.meta_selecting_second_graph, 0),
        ]);
        let deleting = spawn(&store, |store| async move { store.commit(change).await });
        waiting(&database, 1).await;
        release.notify_one();

        let moved = joined(moving).await.unwrap();
        assert!(committed(&moved), "{moved:?}");
        assert_eq!(
            joined(deleting).await.unwrap(),
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: a,
                current: Some(stored(&fixtures.moved_a, 1)),
            }])
        );
        assert_eq!(
            Arc::new(database.open()).load_aggregate().await.unwrap(),
            aggregate(
                &fixtures,
                vec![
                    stored(&fixtures.seed_meta, 0),
                    stored(&fixtures.moved_a, 1),
                    stored(&fixtures.seed_b, 0),
                ]
            )
        );
    }

    // The deletion paused under the exclusive lock as it reads every Space,
    // where TypeScript pauses it after `loadEvery`: both hold the lock.
    // Case: serialises a Graph deletion that read first before a Map-internal Edit that reads after
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serialises_a_graph_deletion_that_read_first_before_a_map_internal_edit() {
        let fixtures = Arc::new(fixtures());
        let (database, store) = seeded(&fixtures).await;
        let (reached, release) = pause_once(&store, |step| *step == Step::CompleteRead);
        let change = commit(vec![
            update(&fixtures.without_selected_graph, 0),
            update(&fixtures.meta_selecting_second_graph, 0),
        ]);
        let deleting = spawn(&store, |store| async move { store.commit(change).await });
        let deleting = rendezvous(&reached, deleting).await;
        let change = commit(vec![update(&fixtures.moved_a, 0)]);
        let moving = spawn(&store, |store| async move { store.commit(change).await });
        waiting(&database, 1).await;
        release.notify_one();

        let deleted = joined(deleting).await.unwrap();
        assert!(committed(&deleted), "{deleted:?}");
        assert_eq!(
            joined(moving).await.unwrap(),
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: space(&fixtures.ids.a),
                current: Some(stored(&fixtures.without_selected_graph, 1)),
            }])
        );
        assert_eq!(
            Arc::new(database.open()).load_aggregate().await.unwrap(),
            aggregate(
                &fixtures,
                vec![
                    stored(&fixtures.meta_selecting_second_graph, 1),
                    stored(&fixtures.without_selected_graph, 1),
                    stored(&fixtures.seed_b, 0),
                ]
            )
        );
    }

    // Case: keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn keeps_a_replacement_from_landing_between_a_fast_path_read_and_its_write() {
        let fixtures = Arc::new(fixtures());
        let (database, store) = seeded(&fixtures).await;
        let a = space(&fixtures.ids.a);
        let (reached, release) = pause_once(&store, move |step| *step == Step::RowLock(a));
        let change = commit(vec![update(&fixtures.moved_a, 0)]);
        let moving = spawn(&store, |store| async move { store.commit(change).await });
        let moving = rendezvous(&reached, moving).await;
        let input = AggregateInput {
            meta_space_id: space(&fixtures.ids.meta),
            spaces: vec![
                fixtures.replaced_meta.clone(),
                fixtures.replaced_a.clone(),
                fixtures.seed_b.clone(),
            ],
        };
        let meta_id = space(&fixtures.ids.meta);
        let replacing = spawn(&store, move |store| async move {
            store.replace_aggregate(input, Some(meta_id)).await
        });
        waiting(&database, 1).await;
        release.notify_one();

        // The Edit, then the replacement over it. Had the replacement landed
        // inside the pause, the Edit would have written A's old Map and Graph
        // ids over the recreated A, leaving Meta's Space Resource dangling.
        let moved = joined(moving).await.unwrap();
        assert!(committed(&moved), "{moved:?}");
        let replaced = joined(replacing).await.unwrap();
        assert!(
            matches!(replaced, ReplaceResult::Replaced(_)),
            "{replaced:?}"
        );
        assert_eq!(
            Arc::new(database.open()).load_aggregate().await.unwrap(),
            aggregate(
                &fixtures,
                vec![
                    stored(&fixtures.replaced_meta, 0),
                    stored(&fixtures.replaced_a, 0),
                    stored(&fixtures.seed_b, 0),
                ]
            )
        );
    }

    // The fast path paused once it has written A's row, before it reads A's
    // Resource rows again and commits, where TypeScript pauses it after
    // `deleteExcept`: written, and not committed.
    // Case: keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn keeps_a_space_deletion_from_passing_at_a_revision_an_uncommitted_fast_path_moved() {
        let fixtures = Arc::new(fixtures());
        let (database, store) = seeded(&fixtures).await;
        let a = space(&fixtures.ids.a);
        let (reached, release) = pause_once(&store, move |step| *step == Step::ResourceReread(a));
        let change = commit(vec![update(&fixtures.moved_a, 0)]);
        let moving = spawn(&store, |store| async move { store.commit(change).await });
        let moving = rendezvous(&reached, moving).await;
        let change = commit(vec![
            SpaceChange::Delete {
                space_id: a,
                expected_revision: revision(0),
            },
            update(&fixtures.meta_linking_b_only, 0),
        ]);
        let deleting = spawn(&store, |store| async move { store.commit(change).await });
        waiting(&database, 1).await;
        release.notify_one();

        let moved = joined(moving).await.unwrap();
        assert!(committed(&moved), "{moved:?}");
        assert_eq!(
            joined(deleting).await.unwrap(),
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: a,
                current: Some(stored(&fixtures.moved_a, 1)),
            }])
        );
        assert_eq!(
            Arc::new(database.open()).load_aggregate().await.unwrap(),
            aggregate(
                &fixtures,
                vec![
                    stored(&fixtures.seed_meta, 0),
                    stored(&fixtures.moved_a, 1),
                    stored(&fixtures.seed_b, 0),
                ]
            )
        );
    }

    // B has to commit while A is held, so it is awaited within a bound
    // rather than timed: a B that waits for A fails the bound.
    // Case: lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn lets_map_internal_edits_to_different_spaces_commit_side_by_side() {
        let fixtures = Arc::new(fixtures());
        let (database, store) = seeded(&fixtures).await;
        let a = space(&fixtures.ids.a);
        let (reached, release) = pause_once(&store, move |step| *step == Step::RowLock(a));
        let change = commit(vec![update(&fixtures.moved_a, 0)]);
        let moving_a = spawn(&store, |store| async move { store.commit(change).await });
        let moving_a = rendezvous(&reached, moving_a).await;
        let change = commit(vec![update(&space_b(&fixtures.ids, 480), 0)]);
        let moving_b = spawn(&store, |store| async move { store.commit(change).await });
        let moved_b = tokio::time::timeout(PATIENCE, moving_b).await;
        release.notify_one();
        let moved_b = moved_b
            .expect("B commits while A is held")
            .unwrap()
            .unwrap();
        assert!(committed(&moved_b), "{moved_b:?}");

        let moved_a = joined(moving_a).await.unwrap();
        assert!(committed(&moved_a), "{moved_a:?}");
        assert_eq!(
            Arc::new(database.open()).load_aggregate().await.unwrap(),
            aggregate(
                &fixtures,
                vec![
                    stored(&fixtures.seed_meta, 0),
                    stored(&fixtures.moved_a, 1),
                    stored(&space_b(&fixtures.ids, 480), 1),
                ]
            )
        );
    }
}

/// Whether two operations started together run on one repository, sharing
/// its pool, or on two repositories over one database, as two hosts would.
#[derive(Clone, Copy, Debug)]
enum Sides {
    One,
    Two,
}

impl Sides {
    fn stores(self, database: &Fresh, store: &Store) -> (Store, Store) {
        match self {
            Self::One => (Arc::clone(store), Arc::clone(store)),
            Self::Two => (Arc::clone(store), Arc::new(database.open())),
        }
    }
}

/// Run `first` and `second` at once, each starting when both are ready.
async fn together<R1, R2, F1, F2>(first: F1, second: F2) -> (R1, R2)
where
    F1: Future<Output = R1> + Send + 'static,
    F2: Future<Output = R2> + Send + 'static,
    R1: Send + 'static,
    R2: Send + 'static,
{
    let barrier = Arc::new(Barrier::new(2));
    let (left, right) = (Arc::clone(&barrier), barrier);
    let first = tokio::spawn(async move {
        left.wait().await;
        first.await
    });
    let second = tokio::spawn(async move {
        right.wait().await;
        second.await
    });
    (first.await.unwrap(), second.await.unwrap())
}

/// What a new pool over `database` reads: the aggregate, and how many rows
/// hold the Resource `resource`.
async fn read_back(database: &Fresh, resource: &str) -> (AggregateLoad, i64) {
    let fresh = database.open();
    let load = fresh.load_aggregate().await.unwrap();
    fresh.close().await;
    let rows = database
        .scalar(&format!(
            "SELECT count(*)::text FROM resources WHERE id = '{resource}'"
        ))
        .await
        .unwrap()
        .parse()
        .unwrap();
    (load, rows)
}

/// What `second` answers on the memory store run after `first`, from the
/// same seed: the answer one sequential order gives it.
async fn after(fixtures: &Fixtures, first: SpaceCommit, second: SpaceCommit) -> CommitResult {
    let memory = MemorySpaceRepository::new();
    let seeded = memory
        .initialize_aggregate(AggregateInput {
            meta_space_id: space(&fixtures.ids.meta),
            spaces: vec![
                fixtures.seed_meta.clone(),
                fixtures.seed_a.clone(),
                fixtures.seed_b.clone(),
            ],
        })
        .await
        .unwrap();
    assert!(matches!(seeded, InitializeResult::Initialized(_)));
    assert!(committed(&memory.commit(first).await.unwrap()));
    memory.commit(second).await.unwrap()
}

mod given_operations_started_together {
    use super::*;

    async fn commits_to_different_spaces_both_commit(sides: Sides) {
        let fixtures = fixtures();
        let (database, store) = seeded(&fixtures).await;
        let (left, right) = sides.stores(&database, &store);
        let moved_b = space_b(&fixtures.ids, 480);
        let (a, b) = (
            commit(vec![update(&fixtures.moved_a, 0)]),
            commit(vec![update(&moved_b, 0)]),
        );
        let (a, b) = together(async move { left.commit(a).await }, async move {
            right.commit(b).await
        })
        .await;
        assert!(committed(&a.unwrap()), "A commits");
        assert!(committed(&b.unwrap()), "B commits");
        let (load, _) = read_back(&database, &fixtures.ids.a_first).await;
        assert_eq!(
            load,
            aggregate(
                &fixtures,
                vec![
                    stored(&fixtures.seed_meta, 0),
                    stored(&fixtures.moved_a, 1),
                    stored(&moved_b, 1),
                ]
            )
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn commit_to_different_spaces_on_one_repository() {
        commits_to_different_spaces_both_commit(Sides::One).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn commit_to_different_spaces_on_two_repositories() {
        commits_to_different_spaces_both_commit(Sides::Two).await;
    }

    /// A and B each adding the same Resource id: whichever lands first owns
    /// it, and the other answers as it would after it, one row stored.
    async fn two_adding_one_resource_id(sides: Sides) {
        let fixtures = fixtures();
        let (database, store) = seeded(&fixtures).await;
        let (left, right) = sides.stores(&database, &store);
        let ids = &fixtures.ids;
        let shared = markdown(&ids.shared_resource, "Shared");
        let a_with = space_a(
            ids,
            300,
            (&ids.a_map, &ids.a_graph),
            true,
            std::slice::from_ref(&shared),
        );
        let b_with = space_like_b(&ids.b, &ids.b_map, &ids.b_graph, &ids.b_first, 0, &[shared]);
        let (to_a, to_b) = (
            commit(vec![update(&a_with, 0)]),
            commit(vec![update(&b_with, 0)]),
        );
        let (a, b) = {
            let (to_a, to_b) = (to_a.clone(), to_b.clone());
            together(async move { left.commit(to_a).await }, async move {
                right.commit(to_b).await
            })
            .await
        };
        let (a, b) = (a.unwrap(), b.unwrap());
        let (load, rows) = read_back(&database, &ids.shared_resource).await;
        assert_eq!(rows, 1, "one row holds the Resource");
        let (winner, loser, sequential) = match (committed(&a), committed(&b)) {
            (true, false) => (&a_with, &b, after(&fixtures, to_a, to_b).await),
            (false, true) => (&b_with, &a, after(&fixtures, to_b, to_a).await),
            _ => panic!("exactly one commits: {a:?}, {b:?}"),
        };
        assert_eq!(*loser, sequential, "the other answers as it would after it");
        let mut spaces = vec![
            stored(&fixtures.seed_meta, 0),
            stored(&fixtures.seed_a, 0),
            stored(&fixtures.seed_b, 0),
        ];
        let index = spaces
            .iter()
            .position(|space| space.snapshot.id == winner.id)
            .unwrap();
        spaces[index] = stored(winner, 1);
        assert_eq!(load, aggregate(&fixtures, spaces));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn add_one_resource_id_to_two_spaces_on_one_repository() {
        two_adding_one_resource_id(Sides::One).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn add_one_resource_id_to_two_spaces_on_two_repositories() {
        two_adding_one_resource_id(Sides::Two).await;
    }

    /// Two commits each creating Space C and linking it from Meta at Meta's
    /// revision 0: one lands, and the other answers as it would after it.
    async fn two_creating_one_space_id(sides: Sides) {
        let fixtures = fixtures();
        let (database, store) = seeded(&fixtures).await;
        let (left, right) = sides.stores(&database, &store);
        let ids = &fixtures.ids;
        let created = space_like_b(&ids.c, &ids.c_map, &ids.c_graph, &id_at(61), 0, &[]);
        let linking = meta(
            ids,
            &[
                link(&ids.link_to_a, &ids.a, &ids.a_map, &ids.a_graph),
                link(&ids.link_to_b, &ids.b, &ids.b_map, &ids.b_graph),
                link(&ids.link_to_c, &ids.c, &ids.c_map, &ids.c_graph),
            ],
        );
        let creating = commit(vec![
            SpaceChange::Create {
                space_id: created.id,
                snapshot: created.clone(),
            },
            update(&linking, 0),
        ]);
        let (first, second) = (creating.clone(), creating.clone());
        let (first, second) = together(async move { left.commit(first).await }, async move {
            right.commit(second).await
        })
        .await;
        let mut answers = [first.unwrap(), second.unwrap()];
        answers.sort_by_key(|answer| !committed(answer));
        assert!(committed(&answers[0]), "one commits: {answers:?}");
        assert_eq!(
            answers[1],
            after(&fixtures, creating.clone(), creating).await,
            "the other answers as it would after it"
        );
        let (load, _) = read_back(&database, &id_at(61)).await;
        assert_eq!(
            load,
            aggregate(
                &fixtures,
                vec![
                    stored(&linking, 1),
                    stored(&fixtures.seed_a, 0),
                    stored(&fixtures.seed_b, 0),
                    stored(&created, 0),
                ]
            )
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn create_one_space_id_twice_on_one_repository() {
        two_creating_one_space_id(Sides::One).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn create_one_space_id_twice_on_two_repositories() {
        two_creating_one_space_id(Sides::Two).await;
    }

    /// A replacement and an Edit to B started together end as one of the two
    /// orders leaves them: the replacement over the Edit, B at its seed at
    /// revision 0; or the Edit over the replacement, B moved at revision 1.
    async fn a_replacement_beside_a_commit(sides: Sides) {
        let fixtures = fixtures();
        let (database, store) = seeded(&fixtures).await;
        let (left, right) = sides.stores(&database, &store);
        let moved_b = space_b(&fixtures.ids, 480);
        let input = AggregateInput {
            meta_space_id: space(&fixtures.ids.meta),
            spaces: vec![
                fixtures.replaced_meta.clone(),
                fixtures.replaced_a.clone(),
                fixtures.seed_b.clone(),
            ],
        };
        let meta_id = space(&fixtures.ids.meta);
        let change = commit(vec![update(&moved_b, 0)]);
        let (replaced, moved) = together(
            async move { left.replace_aggregate(input, Some(meta_id)).await },
            async move { right.commit(change).await },
        )
        .await;
        let replaced = replaced.unwrap();
        assert!(
            matches!(replaced, ReplaceResult::Replaced(_)),
            "{replaced:?}"
        );
        let moved = moved.unwrap();
        assert!(committed(&moved), "B commits in either order: {moved:?}");
        let (load, _) = read_back(&database, &fixtures.ids.b_first).await;
        let replacement_last = aggregate(
            &fixtures,
            vec![
                stored(&fixtures.replaced_meta, 0),
                stored(&fixtures.replaced_a, 0),
                stored(&fixtures.seed_b, 0),
            ],
        );
        let edit_last = aggregate(
            &fixtures,
            vec![
                stored(&fixtures.replaced_meta, 0),
                stored(&fixtures.replaced_a, 0),
                stored(&moved_b, 1),
            ],
        );
        assert!(
            load == replacement_last || load == edit_last,
            "one order's state, never a mix: {load:?}"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn replace_beside_a_commit_on_one_repository() {
        a_replacement_beside_a_commit(Sides::One).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn replace_beside_a_commit_on_two_repositories() {
        a_replacement_beside_a_commit(Sides::Two).await;
    }
}
