//! Concurrent operations on one SQLite repository in one process
//! (rust-sqlite-test-coverage 13): the races
//! `test/integration/sqlite-space-repository.test.ts`,
//! `test/integration/sqlite-contention.test.ts` and
//! `test/support/fast-path-races.ts` hold for TypeScript, beyond the
//! same-Space race `tests/sqlite.rs`' `given_contention` holds.
//!
//! The repository runs one operation at a time, in the order they reach it,
//! each in one transaction that reads and writes (ST-127). So two operations
//! started together, the first polled first, end as the two run one after
//! the other in that order, and neither waits on SQLite: every repository
//! here sets a busy timeout of zero, so an operation that met another's
//! lock on the file would fail unreachable rather than wait. Where the
//! TypeScript races pause one side inside its transaction and see the other
//! still waiting, the Rust ones hold the outcome of that order; Rust has no
//! seam inside an operation to pause at.

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

use std::sync::Arc;
use std::time::Duration;

use host::{
    AggregateInput, AggregateLoad, CommitResult, LoadedAggregate, ReplaceResult, SpaceChange,
    SpaceConflict, SpaceRepository, SpaceSummary, SqliteSpaceRepository,
};
use repository_contract::{
    LINK_RESOURCE_ID, OTHER_RESOURCE_ID, OTHER_SPACE_ID, RESOURCE_ID, SECOND_RESOURCE_ID, SPACE_ID,
    commit, committed, id, refused_kinds, resource, retitled, seed, snapshot, space, space_holding,
    space_json, space_resource, stored, target_document, target_space, update,
};
use serde_json::{Value, json};
use sqlite_support::{Migrated, on_file};
use tokio::task::JoinSet;

/// A repository over `file` that never waits on SQLite.
fn open(file: &Migrated) -> SqliteSpaceRepository {
    SqliteSpaceRepository::open_with_busy_timeout(&file.path(), Duration::ZERO)
}

/// The repository closed and opened again over its file: a fresh host.
async fn reopened(file: &Migrated, store: SqliteSpaceRepository) -> SqliteSpaceRepository {
    store.close().await;
    open(file)
}

fn loaded(meta: &str, spaces: Vec<host::LoadedSpace>) -> AggregateLoad {
    AggregateLoad::Loaded(LoadedAggregate {
        meta_space_id: id(meta),
        spaces,
    })
}

fn create(snapshot: &intake::SpaceSnapshot) -> SpaceChange {
    SpaceChange::Create {
        space_id: snapshot.id,
        snapshot: snapshot.clone(),
    }
}

fn conflict(space_id: &str, current: Option<host::LoadedSpace>) -> CommitResult {
    CommitResult::Conflict(vec![SpaceConflict {
        space_id: id(space_id),
        current,
    }])
}

/// The id of linked Space `index`, one of the Spaces Meta links.
fn linked_space_id(index: usize) -> String {
    format!("c1000000-0000-4000-8000-{index:012x}")
}

/// The id of the Space Resource in Meta that links Space `index`.
fn link_resource_id(index: usize) -> String {
    format!("c1000000-0000-4000-8000-{:012x}", 0x100 + index)
}

/// Meta, holding `RESOURCE_ID` and a Space Resource for each of `targets`.
fn meta_linking(
    title: &str,
    extra: &[Value],
    targets: &[(String, String)],
) -> intake::SpaceSnapshot {
    let mut resources = vec![resource(RESOURCE_ID, "Meta resource")];
    resources.extend(extra.iter().cloned());
    resources.extend(
        targets
            .iter()
            .map(|(link, target)| space_resource(link, target)),
    );
    // Stored in ascending id order (ST-21), as every store answers them.
    resources.sort_by_key(|resource| resource["id"].as_str().map(str::to_owned));
    space_holding(SPACE_ID, title, resources)
}

// Case: serialises overlapping in-process commits at different Spaces well under the busy timeout
/// Commits to Meta and to each Space it links, all started together: each
/// commits at its Space's next revision, never waiting on SQLite, and a
/// fresh host reads every one back.
#[tokio::test]
async fn commits_overlapping_edits_to_different_spaces_each_at_its_next_revision() {
    let file = Migrated::new().await;
    let store = open(&file);
    let linked: Vec<intake::SpaceSnapshot> = (0..6)
        .map(|index| target_space(&linked_space_id(index), &format!("Linked {index}"), &[]))
        .collect();
    let links: Vec<(String, String)> = (0..6)
        .map(|index| (link_resource_id(index), linked_space_id(index)))
        .collect();
    let meta = meta_linking("Meta", &[], &links);
    let mut seeded = vec![&meta];
    seeded.extend(linked.iter());
    seed(&store, &seeded).await;

    let store = Arc::new(store);
    let mut edits = JoinSet::new();
    for space in std::iter::once(&meta).chain(linked.iter()) {
        let store = Arc::clone(&store);
        let edited = retitled(space, &format!("{} edited", space.document.title));
        edits.spawn(async move { store.commit(commit(vec![update(&edited, 0)])).await });
    }
    while let Some(answer) = edits.join_next().await {
        assert!(
            matches!(answer.unwrap(), Ok(CommitResult::Committed { .. })),
            "every edit commits"
        );
    }

    let store = reopened(&file, Arc::into_inner(store).unwrap()).await;
    for space in std::iter::once(&meta).chain(linked.iter()) {
        let edited = retitled(space, &format!("{} edited", space.document.title));
        assert_eq!(
            store.load_space(space.id).await,
            Ok(Some(stored(&edited, 1, None))),
            "{}",
            space.document.title
        );
    }
}

/// Reads started beside a commit, before it or after, answer what is stored
/// on the side of it they reached the repository on, never waiting on
/// SQLite: for a commit through the complete-aggregate decision (a Space
/// created and linked) and one through the single-Space decision (Meta
/// retitled).
async fn serves_reads_overlapping_a_commit(multi_space: bool, reads_first: bool) {
    let file = Migrated::new().await;
    let store = open(&file);
    let linked: Vec<intake::SpaceSnapshot> = (0..8)
        .map(|index| target_space(&linked_space_id(index), &format!("Linked {index}"), &[]))
        .collect();
    let links: Vec<(String, String)> = (0..8)
        .map(|index| (link_resource_id(index), linked_space_id(index)))
        .collect();
    let second = resource(SECOND_RESOURCE_ID, "Second meta resource");
    let meta = meta_linking("Meta", std::slice::from_ref(&second), &links);
    let mut seeded = vec![&meta];
    seeded.extend(linked.iter());
    seed(&store, &seeded).await;

    let child = target_space(OTHER_SPACE_ID, "Child", &[OTHER_RESOURCE_ID]);
    let mut with_child = links.clone();
    with_child.push((LINK_RESOURCE_ID.to_owned(), OTHER_SPACE_ID.to_owned()));
    let after = if multi_space {
        meta_linking("Meta linked", std::slice::from_ref(&second), &with_child)
    } else {
        retitled(&meta, "Meta edited")
    };
    let request = if multi_space {
        commit(vec![create(&child), update(&after, 0)])
    } else {
        commit(vec![update(&after, 0)])
    };
    let expected_commit = if multi_space {
        committed(&[(OTHER_SPACE_ID, 0), (SPACE_ID, 1)], &[])
    } else {
        committed(&[(SPACE_ID, 1)], &[])
    };

    let (space_read, list_read, committing) = if reads_first {
        tokio::join!(
            store.load_space(id(SPACE_ID)),
            store.list_spaces(),
            store.commit(request)
        )
    } else {
        let (committing, space_read, list_read) = tokio::join!(
            store.commit(request),
            store.load_space(id(SPACE_ID)),
            store.list_spaces()
        );
        (space_read, list_read, committing)
    };

    assert_eq!(committing, Ok(expected_commit));
    let seen = if reads_first { &meta } else { &after };
    assert_eq!(
        space_read,
        Ok(Some(stored(seen, u64::from(!reads_first), None)))
    );
    let mut listed = vec![SpaceSummary {
        id: id(SPACE_ID),
        title: seen.document.title.clone(),
    }];
    if multi_space && !reads_first {
        listed.push(SpaceSummary {
            id: id(OTHER_SPACE_ID),
            title: "Child".to_owned(),
        });
    }
    listed.extend(linked.iter().map(|space| SpaceSummary {
        id: space.id,
        title: space.document.title.clone(),
    }));
    listed.sort_by(|left, right| left.id.as_str().cmp(right.id.as_str()));
    assert_eq!(list_read, Ok(listed));
}

// Case: serves loadSpace and listSpaces overlapping a * commit (*) well under the busy timeout
#[tokio::test]
async fn serves_reads_started_before_a_multi_space_commit() {
    serves_reads_overlapping_a_commit(true, true).await;
}

// Case: serves loadSpace and listSpaces overlapping a * commit (*) well under the busy timeout
#[tokio::test]
async fn serves_reads_started_after_a_multi_space_commit() {
    serves_reads_overlapping_a_commit(true, false).await;
}

// Case: serves loadSpace and listSpaces overlapping a * commit (*) well under the busy timeout
#[tokio::test]
async fn serves_reads_started_before_a_single_space_commit() {
    serves_reads_overlapping_a_commit(false, true).await;
}

// Case: serves loadSpace and listSpaces overlapping a * commit (*) well under the busy timeout
#[tokio::test]
async fn serves_reads_started_after_a_single_space_commit() {
    serves_reads_overlapping_a_commit(false, false).await;
}

/// Meta, linking `OTHER_SPACE_ID`, and that Space, its target.
fn meta_and_child() -> (intake::SpaceSnapshot, intake::SpaceSnapshot) {
    let meta = meta_linking(
        "Meta",
        &[],
        &[(LINK_RESOURCE_ID.to_owned(), OTHER_SPACE_ID.to_owned())],
    );
    (
        meta,
        target_space(OTHER_SPACE_ID, "Child", &[OTHER_RESOURCE_ID]),
    )
}

const CONTESTED_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000017";

// Case: refuses the loser of a Resource identity race and writes nothing of it
/// Two commits adding one Resource id, one to Meta and one to the Space it
/// links: the first commits, the second is refused, and the file holds one
/// row for the Resource, Meta's.
#[tokio::test]
async fn refuses_the_loser_of_a_resource_identity_race() {
    let file = Migrated::new().await;
    let store = open(&file);
    let (meta, child) = meta_and_child();
    seed(&store, &[&meta, &child]).await;
    let contested = resource(CONTESTED_RESOURCE_ID, "Contested");
    let meta_holding = meta_linking(
        "Meta",
        std::slice::from_ref(&contested),
        &[(LINK_RESOURCE_ID.to_owned(), OTHER_SPACE_ID.to_owned())],
    );
    let child_holding = snapshot(
        OTHER_SPACE_ID,
        &space_json(
            OTHER_SPACE_ID,
            target_document("Child"),
            vec![resource(OTHER_RESOURCE_ID, "Child resource"), contested],
        ),
    );

    let (first, second) = tokio::join!(
        store.commit(commit(vec![update(&meta_holding, 0)])),
        store.commit(commit(vec![update(&child_holding, 0)])),
    );
    assert_eq!(first, Ok(committed(&[(SPACE_ID, 1)], &[])));
    let second = second.unwrap();
    assert!(
        matches!(second, CommitResult::AggregateRefused(_)),
        "the loser is refused: {second:?}"
    );
    assert!(!refused_kinds(&second).is_empty(), "{second:?}");

    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_space(id(OTHER_SPACE_ID)).await,
        Ok(Some(stored(&child, 0, None)))
    );
    assert_eq!(
        on_file(
            &file.file,
            &format!("SELECT space_id FROM resources WHERE id = '{CONTESTED_RESOURCE_ID}'"),
        )
        .await,
        Some(SPACE_ID.to_owned()),
        "one row, Meta's"
    );
    assert_eq!(
        on_file(
            &file.file,
            &format!(
                "SELECT CAST(count(*) AS TEXT) FROM resources WHERE id = '{CONTESTED_RESOURCE_ID}'"
            ),
        )
        .await,
        Some("1".to_owned())
    );
}

const NEW_SPACE_ID: &str = "c0000000-0000-4000-8000-000000000004";
const LINK_A_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000018";
const LINK_B_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000019";

// Case: conflicts the loser of a same-id create race on both the new Space and Meta, and writes nothing of it
/// Two commits each creating one new Space id and linking it from Meta at
/// the revision both read: the first commits, and the second answers what
/// `decide_commit` answers it run after the first, a conflict on both the
/// new Space, now stored, and Meta, now moved.
#[tokio::test]
async fn conflicts_the_loser_of_a_same_id_create_race_on_the_new_space_and_meta() {
    let file = Migrated::new().await;
    let store = open(&file);
    let (meta, child) = meta_and_child();
    seed(&store, &[&meta, &child]).await;
    let creating = |link: &str, title: &str| {
        let created = target_space(NEW_SPACE_ID, title, &[]);
        let linking = meta_linking(
            "Meta",
            &[],
            &[
                (LINK_RESOURCE_ID.to_owned(), OTHER_SPACE_ID.to_owned()),
                (link.to_owned(), NEW_SPACE_ID.to_owned()),
            ],
        );
        (created, linking)
    };
    let (from_a, meta_a) = creating(LINK_A_RESOURCE_ID, "From A");
    let (from_b, meta_b) = creating(LINK_B_RESOURCE_ID, "From B");

    let (first, second) = tokio::join!(
        store.commit(commit(vec![create(&from_a), update(&meta_a, 0)])),
        store.commit(commit(vec![create(&from_b), update(&meta_b, 0)])),
    );
    assert_eq!(
        first,
        Ok(committed(&[(NEW_SPACE_ID, 0), (SPACE_ID, 1)], &[]))
    );
    assert_eq!(
        second,
        Ok(CommitResult::Conflict(vec![
            SpaceConflict {
                space_id: id(NEW_SPACE_ID),
                current: Some(stored(&from_a, 0, None)),
            },
            SpaceConflict {
                space_id: id(SPACE_ID),
                current: Some(stored(&meta_a, 1, None)),
            },
        ]))
    );
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_space(id(NEW_SPACE_ID)).await,
        Ok(Some(stored(&from_a, 0, None)))
    );
}

const REPLACEMENT_META_ID: &str = "c0000000-0000-4000-8000-000000000005";
const REPLACEMENT_RESOURCE_ID: &str = "c0000000-0000-4000-8000-00000000001a";

fn replacement() -> (intake::SpaceSnapshot, AggregateInput) {
    let replacement = space(
        REPLACEMENT_META_ID,
        "Replacement",
        &[REPLACEMENT_RESOURCE_ID],
    );
    let input = AggregateInput {
        meta_space_id: id(REPLACEMENT_META_ID),
        spaces: vec![replacement.clone()],
    };
    (replacement, input)
}

// Case: settles a replacement racing a commit in arrival order, commit first
#[tokio::test]
async fn settles_a_commit_then_a_replacement_in_arrival_order() {
    let file = Migrated::new().await;
    let store = open(&file);
    let (meta, child) = meta_and_child();
    seed(&store, &[&meta, &child]).await;
    let (replacement, input) = replacement();

    let (committing, replacing) = tokio::join!(
        store.commit(commit(vec![update(&retitled(&meta, "Edited"), 0)])),
        store.replace_aggregate(input, Some(id(SPACE_ID))),
    );
    assert_eq!(committing, Ok(committed(&[(SPACE_ID, 1)], &[])));
    assert!(
        matches!(replacing, Ok(ReplaceResult::Replaced(_))),
        "{replacing:?}"
    );
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            REPLACEMENT_META_ID,
            vec![stored(&replacement, 0, None)]
        ))
    );
}

// Case: settles a replacement racing a commit in arrival order, replacement first
#[tokio::test]
async fn settles_a_replacement_then_a_commit_in_arrival_order() {
    let file = Migrated::new().await;
    let store = open(&file);
    let (meta, child) = meta_and_child();
    seed(&store, &[&meta, &child]).await;
    let (replacement, input) = replacement();

    let (replacing, committing) = tokio::join!(
        store.replace_aggregate(input, Some(id(SPACE_ID))),
        store.commit(commit(vec![update(&retitled(&meta, "Edited"), 0)])),
    );
    assert!(
        matches!(replacing, Ok(ReplaceResult::Replaced(_))),
        "{replacing:?}"
    );
    assert_eq!(committing, Ok(conflict(SPACE_ID, None)));
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            REPLACEMENT_META_ID,
            vec![stored(&replacement, 0, None)]
        ))
    );
}

/// The fast-path races' Spaces (`test/support/fast-path-races.ts`): Meta
/// linking A and B, A placing two Resources with an Edge in the Graph Meta
/// selects and a second Graph, and B one Resource.
mod fast_path {
    use super::*;

    fn at(offset: u32) -> String {
        format!("21e00000-0000-4000-8000-{offset:012x}")
    }

    pub fn meta_id() -> String {
        at(1)
    }
    pub fn a_id() -> String {
        at(2)
    }
    pub fn b_id() -> String {
        at(3)
    }

    fn markdown(offset: u32, title: &str) -> Value {
        json!({
            "id": at(offset),
            "document": {
                "title": title,
                "kind": "markdown",
                "content": { "url": repository_contract::EMPTY_ASSET_REF },
            },
        })
    }

    fn link(offset: u32, space: u32, map: u32, graph: u32) -> Value {
        json!({
            "id": at(offset),
            "document": {
                "title": "Link",
                "kind": "space",
                "content": { "spaceId": at(space), "map": at(map), "graph": at(graph) },
            },
        })
    }

    pub fn link_to_a() -> Value {
        link(40, 2, 20, 21)
    }
    pub fn link_to_b() -> Value {
        link(41, 3, 30, 31)
    }

    pub fn meta(links: Vec<Value>) -> intake::SpaceSnapshot {
        snapshot(
            &meta_id(),
            &space_json(
                &meta_id(),
                json!({
                    "version": 1,
                    "title": "Meta",
                    "defaultMap": at(10),
                    "maps": [{
                        "id": at(10),
                        "title": "Map",
                        "kind": "positioned",
                        "positions": {},
                        "graphs": [{ "id": at(11), "title": "Graph", "edges": [] }],
                    }],
                }),
                links,
            ),
        )
    }

    pub fn seed_meta() -> intake::SpaceSnapshot {
        meta(vec![link_to_a(), link_to_b()])
    }

    /// A, with its second Resource at `second_x`, its Map and selected Graph
    /// at `map` and `graph`, and the selected Graph left out unless `keep`.
    fn a_with(second_x: f64, map: u32, graph: u32, keep: bool) -> intake::SpaceSnapshot {
        let mut graphs = Vec::new();
        if keep {
            graphs.push(json!({
                "id": at(graph),
                "title": "Graph",
                "edges": [{ "from": at(50), "to": at(51) }],
            }));
        }
        graphs.push(json!({ "id": at(22), "title": "Second Graph", "edges": [] }));
        let active = if keep { at(graph) } else { at(22) };
        snapshot(
            &a_id(),
            &space_json(
                &a_id(),
                json!({
                    "version": 1,
                    "title": "A",
                    "defaultMap": at(map),
                    "maps": [{
                        "id": at(map),
                        "title": "Map",
                        "kind": "positioned",
                        "positions": {
                            at(50): { "x": 0, "y": 0 },
                            at(51): { "x": second_x, "y": 0 },
                        },
                        "graphs": graphs,
                        "activeGraph": active,
                    }],
                }),
                vec![markdown(50, "First"), markdown(51, "Second")],
            ),
        )
    }

    pub fn space_a(second_x: f64) -> intake::SpaceSnapshot {
        a_with(second_x, 20, 21, true)
    }

    /// A without the Graph Meta selects.
    pub fn without_selected_graph() -> intake::SpaceSnapshot {
        a_with(300.0, 20, 21, false)
    }

    /// Meta selecting A's other Graph.
    pub fn meta_selecting_second_graph() -> intake::SpaceSnapshot {
        meta(vec![link(40, 2, 20, 22), link_to_b()])
    }

    /// A recreated with new Map and Graph ids.
    pub fn replaced_a() -> intake::SpaceSnapshot {
        a_with(300.0, 23, 24, true)
    }

    /// Meta selecting the recreated A's Map and Graph.
    pub fn replaced_meta() -> intake::SpaceSnapshot {
        meta(vec![link(40, 2, 23, 24), link_to_b()])
    }

    pub fn space_b(x: f64) -> intake::SpaceSnapshot {
        snapshot(
            &b_id(),
            &space_json(
                &b_id(),
                json!({
                    "version": 1,
                    "title": "B",
                    "defaultMap": at(30),
                    "maps": [{
                        "id": at(30),
                        "title": "Map",
                        "kind": "positioned",
                        "positions": { at(60): { "x": x, "y": 0 } },
                        "graphs": [{ "id": at(31), "title": "Graph", "color": "teal", "edges": [] }],
                    }],
                }),
                vec![markdown(60, "First")],
            ),
        )
    }

    /// A file seeded with Meta, A and B, and a repository over it.
    pub async fn seeded() -> (Migrated, SqliteSpaceRepository) {
        let file = Migrated::new().await;
        let store = open(&file);
        seed(&store, &[&seed_meta(), &space_a(300.0), &space_b(0.0)]).await;
        (file, store)
    }

    pub fn moving() -> host::SpaceCommit {
        commit(vec![update(&space_a(640.0), 0)])
    }

    pub fn deleting_the_selected_graph() -> host::SpaceCommit {
        commit(vec![
            update(&without_selected_graph(), 0),
            update(&meta_selecting_second_graph(), 0),
        ])
    }
}

/// Not a port of "commits a Map-internal Edit under the shared aggregate
/// lock only", which `test/unit/repository-contract-rust-ports.test.ts`
/// exempts: a Map-internal Edit commits through the single-Space decision,
/// and a Graph deletion Meta's Space Resource selects goes on to the
/// complete-aggregate one and is refused.
#[tokio::test]
async fn hands_a_graph_deletion_on_to_the_complete_aggregate_decision() {
    let (_file, store) = fast_path::seeded().await;
    assert_eq!(
        store.commit(fast_path::moving()).await,
        Ok(committed(&[(&fast_path::a_id(), 1)], &[]))
    );
    let refused = store
        .commit(commit(vec![update(
            &fast_path::without_selected_graph(),
            1,
        )]))
        .await
        .unwrap();
    assert!(
        matches!(refused, CommitResult::AggregateRefused(_)),
        "{refused:?}"
    );
}

// Case: serialises a Map-internal Edit that read first before a Graph deletion that reads after
#[tokio::test]
async fn serialises_a_map_internal_edit_before_a_graph_deletion_that_arrives_after() {
    let (file, store) = fast_path::seeded().await;
    let moved = fast_path::space_a(640.0);
    let (moving, deleting) = tokio::join!(
        store.commit(fast_path::moving()),
        store.commit(fast_path::deleting_the_selected_graph()),
    );
    assert_eq!(moving, Ok(committed(&[(&fast_path::a_id(), 1)], &[])));
    assert_eq!(
        deleting,
        Ok(conflict(&fast_path::a_id(), Some(stored(&moved, 1, None))))
    );
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            &fast_path::meta_id(),
            vec![
                stored(&fast_path::seed_meta(), 0, None),
                stored(&moved, 1, None),
                stored(&fast_path::space_b(0.0), 0, None),
            ]
        ))
    );
}

// Case: serialises a Graph deletion that read first before a Map-internal Edit that reads after
#[tokio::test]
async fn serialises_a_graph_deletion_before_a_map_internal_edit_that_arrives_after() {
    let (file, store) = fast_path::seeded().await;
    let without = fast_path::without_selected_graph();
    let (deleting, moving) = tokio::join!(
        store.commit(fast_path::deleting_the_selected_graph()),
        store.commit(fast_path::moving()),
    );
    assert_eq!(
        deleting,
        Ok(committed(
            &[(&fast_path::a_id(), 1), (&fast_path::meta_id(), 1)],
            &[]
        ))
    );
    assert_eq!(
        moving,
        Ok(conflict(
            &fast_path::a_id(),
            Some(stored(&without, 1, None))
        ))
    );
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            &fast_path::meta_id(),
            vec![
                stored(&fast_path::meta_selecting_second_graph(), 1, None),
                stored(&without, 1, None),
                stored(&fast_path::space_b(0.0), 0, None),
            ]
        ))
    );
}

// Case: keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write
/// An Edit to A arriving first, then a replacement recreating A at revision
/// 0: the Edit lands at A's next revision, then the replacement recreates A
/// over it. This holds the outcome of that arrival order only; the Rust
/// repository has no seam between an Edit's read and its write.
#[tokio::test]
async fn settles_an_edit_then_a_replacement_recreating_its_space_in_arrival_order() {
    let (file, store) = fast_path::seeded().await;
    let (moving, replacing) = tokio::join!(
        store.commit(fast_path::moving()),
        store.replace_aggregate(
            AggregateInput {
                meta_space_id: id(&fast_path::meta_id()),
                spaces: vec![
                    fast_path::replaced_meta(),
                    fast_path::replaced_a(),
                    fast_path::space_b(0.0),
                ],
            },
            Some(id(&fast_path::meta_id())),
        ),
    );
    assert_eq!(moving, Ok(committed(&[(&fast_path::a_id(), 1)], &[])));
    assert!(
        matches!(replacing, Ok(ReplaceResult::Replaced(_))),
        "{replacing:?}"
    );
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            &fast_path::meta_id(),
            vec![
                stored(&fast_path::replaced_meta(), 0, None),
                stored(&fast_path::replaced_a(), 0, None),
                stored(&fast_path::space_b(0.0), 0, None),
            ]
        ))
    );
}

// Case: keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved
#[tokio::test]
async fn keeps_a_space_deletion_from_passing_at_a_revision_an_edit_moved() {
    let (file, store) = fast_path::seeded().await;
    let moved = fast_path::space_a(640.0);
    let (moving, deleting) = tokio::join!(
        store.commit(fast_path::moving()),
        store.commit(commit(vec![
            SpaceChange::Delete {
                space_id: id(&fast_path::a_id()),
                expected_revision: repository_contract::revision(0),
            },
            update(&fast_path::meta(vec![fast_path::link_to_b()]), 0),
        ])),
    );
    assert_eq!(moving, Ok(committed(&[(&fast_path::a_id(), 1)], &[])));
    assert_eq!(
        deleting,
        Ok(conflict(&fast_path::a_id(), Some(stored(&moved, 1, None))))
    );
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            &fast_path::meta_id(),
            vec![
                stored(&fast_path::seed_meta(), 0, None),
                stored(&moved, 1, None),
                stored(&fast_path::space_b(0.0), 0, None),
            ]
        ))
    );
}

// Case: lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently
/// The Rust repository runs no two commits at once, so B's Edit commits
/// after A's, which is the TypeScript case's branch for a store that
/// queues every operation.
#[tokio::test]
async fn commits_map_internal_edits_to_different_spaces_one_after_the_other() {
    let (file, store) = fast_path::seeded().await;
    let moved_b = fast_path::space_b(480.0);
    let (moving_a, moving_b) = tokio::join!(
        store.commit(fast_path::moving()),
        store.commit(commit(vec![update(&moved_b, 0)])),
    );
    assert_eq!(moving_a, Ok(committed(&[(&fast_path::a_id(), 1)], &[])));
    assert_eq!(moving_b, Ok(committed(&[(&fast_path::b_id(), 1)], &[])));
    let store = reopened(&file, store).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(loaded(
            &fast_path::meta_id(),
            vec![
                stored(&fast_path::seed_meta(), 0, None),
                stored(&fast_path::space_a(640.0), 1, None),
                stored(&moved_b, 1, None),
            ]
        ))
    );
}
