//! Generated commit sequences on the memory store and on a SQLite file
//! (rust-sqlite-test-coverage 07): every step answers the same on both, and
//! both hold the same aggregate at the end, the file read again by a fresh
//! repository. Each answer and each stored Space lists its Resources
//! ascending by id (ST-21), asserted on each store before the two are
//! compared, though every generated snapshot lists them in another order.
//!
//! The two stores share `decide_commit`, so a defect in it is the same on
//! both and passes here; the repository contract
//! (`tests/repository_contract/`) holds TypeScript's answers.

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

use host::{
    AggregateLoad, CommitResult, LoadedSpace, MemorySpaceRepository, Revision, SpaceChange,
    SpaceCommit, SpaceRepository, SqliteSpaceRepository,
};
use intake::{Resource, SpaceSnapshot};
use proptest::prelude::*;
use repository_contract::{
    SPACE_ID, id, resource, seed, snapshot, space_holding, space_json, space_resource,
    target_document,
};
use serde_json::Value;
use sqlite_support::Migrated;

/// The Spaces a generated case can name: Meta, then the ordinary ones, the
/// last two stored by no initialization.
const ORDINARY: [&str; 4] = [
    "c2000000-0000-4000-8000-000000000001",
    "c2000000-0000-4000-8000-000000000002",
    "c2000000-0000-4000-8000-000000000003",
    "c2000000-0000-4000-8000-000000000004",
];

/// The Markdown Resources a generated case can add, by index.
fn note_id(index: u8) -> String {
    format!("c2000000-0000-4000-8000-0000000001{:02x}", index % 8)
}

/// The id of the Space Resource through which Meta links ordinary Space
/// `index`.
fn link_resource_id(index: usize) -> String {
    format!("c2000000-0000-4000-8000-0000000002{index:02x}")
}

fn note(index: u8) -> Resource {
    let id = note_id(index);
    let holder = space_holding(SPACE_ID, "Holder", vec![resource(&id, "Note")]);
    holder.resources.into_iter().next().unwrap()
}

fn link(index: usize) -> Resource {
    let holder = space_holding(
        SPACE_ID,
        "Holder",
        vec![space_resource(&link_resource_id(index), ORDINARY[index])],
    );
    holder.resources.into_iter().next().unwrap()
}

/// `resources` in an order that is not ascending whenever there are two:
/// rotated by `order` and reversed when its top bit is set, then rotated
/// once more if that left them ascending.
fn reordered(mut resources: Vec<Resource>, order: u8) -> Vec<Resource> {
    resources.sort_by(|left, right| left.id.as_str().cmp(right.id.as_str()));
    if resources.len() > 1 {
        let by = 1 + usize::from(order & 0x7f) % (resources.len() - 1);
        resources.rotate_left(by);
        if order & 0x80 != 0 {
            resources.reverse();
        }
        if resources
            .windows(2)
            .all(|pair| pair[0].id.as_str() < pair[1].id.as_str())
        {
            resources.rotate_left(1);
        }
    }
    resources
}

fn ordinary(index: usize, title: &str, notes: &[u8]) -> SpaceSnapshot {
    let resources: Vec<Value> = notes
        .iter()
        .map(|note| resource(&note_id(*note), "Note"))
        .collect();
    snapshot(
        ORDINARY[index],
        &space_json(ORDINARY[index], target_document(title), resources),
    )
}

/// What a generated step asks of the Spaces stored when it runs.
#[derive(Debug, Clone)]
enum Step {
    /// Retitle a stored Space.
    Retitle { space: usize, revision: Expected },
    /// Add a Markdown Resource to a stored Space, perhaps one another holds.
    Add {
        space: usize,
        note: u8,
        revision: Expected,
    },
    /// Drop a Resource from a stored Space, perhaps a Space Resource.
    Drop {
        space: usize,
        index: usize,
        revision: Expected,
    },
    /// Move a Markdown Resource between two stored Spaces in one commit,
    /// listing the receiving Space first or last.
    Move {
        from: usize,
        to: usize,
        index: usize,
        receiver_first: bool,
    },
    /// Create an ordinary Space, linked from Meta or not; one the store
    /// already holds among them.
    Create {
        space: usize,
        linked: bool,
        meta_first: bool,
    },
    /// Delete a stored Space, Meta among them, unlinking it from Meta or not.
    Delete {
        space: usize,
        unlinked: bool,
        meta_first: bool,
        revision: Expected,
    },
    /// Remove the Graph Meta's Space Resource selects from an ordinary Space.
    DropGraph { space: usize },
}

/// The revision a change expects, against what is stored.
#[derive(Debug, Clone, Copy)]
enum Expected {
    Current,
    Behind,
    Ahead,
    NearCeiling(u64),
}

impl Expected {
    fn of(self, stored: Revision) -> Revision {
        let value = stored.get();
        Revision::new(match self {
            Self::Current => value,
            Self::Behind => value.saturating_sub(1),
            Self::Ahead => value + 1,
            Self::NearCeiling(below) => Revision::CEILING - below,
        })
        .unwrap()
    }
}

fn expected() -> impl Strategy<Value = Expected> {
    prop_oneof![
        6 => Just(Expected::Current),
        1 => Just(Expected::Behind),
        1 => Just(Expected::Ahead),
        1 => (0_u64..2).prop_map(Expected::NearCeiling),
    ]
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        (0_usize..8, expected()).prop_map(|(space, revision)| Step::Retitle { space, revision }),
        (0_usize..8, any::<u8>(), expected()).prop_map(|(space, note, revision)| Step::Add {
            space,
            note,
            revision
        }),
        (0_usize..8, 0_usize..8, expected()).prop_map(|(space, index, revision)| Step::Drop {
            space,
            index,
            revision
        }),
        (0_usize..8, 0_usize..8, 0_usize..8, any::<bool>()).prop_map(
            |(from, to, index, receiver_first)| Step::Move {
                from,
                to,
                index,
                receiver_first
            }
        ),
        (0_usize..4, any::<bool>(), any::<bool>()).prop_map(|(space, linked, meta_first)| {
            Step::Create {
                space,
                linked,
                meta_first,
            }
        }),
        (0_usize..8, any::<bool>(), any::<bool>(), expected()).prop_map(
            |(space, unlinked, meta_first, revision)| Step::Delete {
                space,
                unlinked,
                meta_first,
                revision
            }
        ),
        (0_usize..4).prop_map(|space| Step::DropGraph { space }),
    ]
}

fn update(snapshot: SpaceSnapshot, expected: Revision) -> SpaceChange {
    SpaceChange::Update {
        space_id: snapshot.id,
        snapshot,
        expected_revision: expected,
    }
}

fn in_order(first: SpaceChange, second: SpaceChange, swap: bool) -> SpaceCommit {
    SpaceCommit {
        changes: if swap {
            vec![second, first]
        } else {
            vec![first, second]
        },
    }
}

/// The commit `step` makes of `stored`, the Spaces stored now (Meta first),
/// each snapshot's Resources reordered by `order`; `None` where the step
/// names nothing it can act on.
fn commit_for(step: &Step, stored: &[LoadedSpace], order: u8) -> Option<SpaceCommit> {
    let meta = &stored[0];
    let pick = |index: usize| &stored[index % stored.len()];
    let with = |space: &LoadedSpace, resources: Vec<Resource>| {
        let mut next = space.snapshot.clone();
        next.resources = reordered(resources, order);
        next
    };
    let position = |space: &str| ORDINARY.iter().position(|ordinary| *ordinary == space);
    Some(match step {
        Step::Retitle { space, revision } => {
            let space = pick(*space);
            let mut next = with(space, space.snapshot.resources.clone());
            next.document.title.push('!');
            SpaceCommit {
                changes: vec![update(next, revision.of(space.revision))],
            }
        }
        Step::Add {
            space,
            note: added,
            revision,
        } => {
            let space = pick(*space);
            let mut resources = space.snapshot.resources.clone();
            let added = note(*added);
            if resources.iter().any(|held| held.id == added.id) {
                return None;
            }
            resources.push(added);
            SpaceCommit {
                changes: vec![update(with(space, resources), revision.of(space.revision))],
            }
        }
        Step::Drop {
            space,
            index,
            revision,
        } => {
            let space = pick(*space);
            let mut resources = space.snapshot.resources.clone();
            if resources.is_empty() {
                return None;
            }
            resources.remove(index % resources.len());
            SpaceCommit {
                changes: vec![update(with(space, resources), revision.of(space.revision))],
            }
        }
        Step::Move {
            from,
            to,
            index,
            receiver_first,
        } => {
            let (from, to) = (pick(*from), pick(*to));
            if from.snapshot.id == to.snapshot.id {
                return None;
            }
            let mut giving = from.snapshot.resources.clone();
            let notes: Vec<usize> = giving
                .iter()
                .enumerate()
                .filter(|(_, held)| held.kind.as_str() == "markdown")
                .map(|(at, _)| at)
                .collect();
            let moved = giving.remove(*notes.get(index % notes.len().max(1))?);
            let mut receiving = to.snapshot.resources.clone();
            receiving.push(moved);
            in_order(
                update(with(from, giving), from.revision),
                update(with(to, receiving), to.revision),
                *receiver_first,
            )
        }
        Step::Create {
            space,
            linked,
            meta_first,
        } => {
            let mut created = ordinary(*space, "Created", &[]);
            created.resources = reordered(created.resources, order);
            let create = SpaceChange::Create {
                space_id: created.id,
                snapshot: created,
            };
            if !*linked {
                return Some(SpaceCommit {
                    changes: vec![create],
                });
            }
            let mut resources = meta.snapshot.resources.clone();
            resources.push(link(*space));
            in_order(
                create,
                update(with(meta, resources), meta.revision),
                *meta_first,
            )
        }
        Step::Delete {
            space,
            unlinked,
            meta_first,
            revision,
        } => {
            let deleted = pick(*space);
            let delete = SpaceChange::Delete {
                space_id: deleted.snapshot.id,
                expected_revision: revision.of(deleted.revision),
            };
            let Some(linked) = position(deleted.snapshot.id.as_str()).filter(|_| *unlinked) else {
                return Some(SpaceCommit {
                    changes: vec![delete],
                });
            };
            let resources = meta
                .snapshot
                .resources
                .iter()
                .filter(|held| held.id.as_str() != link_resource_id(linked))
                .cloned()
                .collect();
            in_order(
                delete,
                update(with(meta, resources), meta.revision),
                *meta_first,
            )
        }
        Step::DropGraph { space } => {
            let target = stored
                .iter()
                .find(|held| position(held.snapshot.id.as_str()) == Some(*space))?;
            let mut next = with(target, target.snapshot.resources.clone());
            for map in next.document.maps.iter_mut().flatten() {
                map.graphs.clear();
                map.active_graph = None;
            }
            SpaceCommit {
                changes: vec![update(next, target.revision)],
            }
        }
    })
}

/// Whether `space` lists its Resources strictly ascending by id.
fn ascending(space: &SpaceSnapshot) -> bool {
    space
        .resources
        .windows(2)
        .all(|pair| pair[0].id.as_str() < pair[1].id.as_str())
}

fn assert_ascending_answer(store: &str, answer: &CommitResult) {
    if let CommitResult::Conflict(conflicts) = answer {
        for conflict in conflicts {
            if let Some(current) = &conflict.current {
                assert!(
                    ascending(&current.snapshot),
                    "{store} answers a conflict's Space with its Resources ascending: {current:?}"
                );
            }
        }
    }
}

fn stored_spaces(store: &str, loaded: &AggregateLoad) -> Vec<LoadedSpace> {
    let AggregateLoad::Loaded(aggregate) = loaded else {
        panic!("{store} holds an aggregate: {loaded:?}");
    };
    for space in &aggregate.spaces {
        assert!(
            ascending(&space.snapshot),
            "{store} holds Space {}'s Resources ascending: {:?}",
            space.snapshot.id,
            space.snapshot.resources
        );
    }
    let mut spaces = aggregate.spaces.clone();
    let meta = spaces
        .iter()
        .position(|space| space.snapshot.id == aggregate.meta_space_id)
        .unwrap();
    let meta = spaces.remove(meta);
    spaces.insert(0, meta);
    spaces
}

/// The initial aggregate: Meta holding a Note and a Space Resource for each
/// of the first two ordinary Spaces, each holding a Note of its own.
fn initial() -> Vec<SpaceSnapshot> {
    let meta = space_holding(
        SPACE_ID,
        "Meta",
        vec![
            resource(&note_id(0), "Note"),
            space_resource(&link_resource_id(0), ORDINARY[0]),
            space_resource(&link_resource_id(1), ORDINARY[1]),
        ],
    );
    let mut spaces = vec![
        meta,
        ordinary(0, "First", &[1, 2]),
        ordinary(1, "Second", &[3]),
    ];
    for space in &mut spaces {
        space.resources = reordered(space.resources.clone(), 0x81);
    }
    spaces
}

async fn run(steps: Vec<(Step, u8)>) {
    let file = Migrated::new().await;
    let sqlite = SqliteSpaceRepository::open(&file.path());
    let memory = MemorySpaceRepository::new();
    let spaces = initial();
    let seeded: Vec<&SpaceSnapshot> = spaces.iter().collect();
    seed(&memory, &seeded).await;
    seed(&sqlite, &seeded).await;

    for (step, order) in &steps {
        let loaded = memory.load_aggregate().await.unwrap();
        let stored = stored_spaces("the memory store", &loaded);
        let Some(request) = commit_for(step, &stored, *order) else {
            continue;
        };
        let from_memory = memory.commit(request.clone()).await.unwrap();
        let from_sqlite = sqlite.commit(request.clone()).await.unwrap();
        assert_ascending_answer("the memory store", &from_memory);
        assert_ascending_answer("SQLite", &from_sqlite);
        assert_eq!(from_sqlite, from_memory, "{step:?} answers {request:?}");
    }

    let held = memory.load_aggregate().await.unwrap();
    stored_spaces("the memory store", &held);
    sqlite.close().await;
    let reopened = SqliteSpaceRepository::open(&file.path());
    let read = reopened.load_aggregate().await.unwrap();
    stored_spaces("SQLite, read again", &read);
    assert_eq!(read, held, "the aggregate each holds at the end");
    reopened.close().await;
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn answers_every_commit_the_same_and_ends_holding_the_same_aggregate(
        steps in proptest::collection::vec((step(), any::<u8>()), 1..12)
    ) {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(run(steps));
    }
}

/// The steps a generated case is made of reach each kind of answer: a
/// generator that only ever conflicted would hold little.
#[tokio::test]
async fn the_generated_steps_reach_every_kind_of_answer() {
    let file = Migrated::new().await;
    let store = SqliteSpaceRepository::open(&file.path());
    let spaces = initial();
    seed(&store, &spaces.iter().collect::<Vec<_>>()).await;
    let mut kinds = std::collections::BTreeSet::new();
    let steps = [
        Step::Retitle {
            space: 1,
            revision: Expected::Current,
        },
        Step::Retitle {
            space: 0,
            revision: Expected::NearCeiling(0),
        },
        Step::Create {
            space: 2,
            linked: false,
            meta_first: false,
        },
        Step::Create {
            space: 2,
            linked: true,
            meta_first: true,
        },
        Step::Move {
            from: 1,
            to: 2,
            index: 0,
            receiver_first: true,
        },
        Step::Delete {
            space: 1,
            unlinked: true,
            meta_first: false,
            revision: Expected::Current,
        },
    ];
    for step in &steps {
        let AggregateLoad::Loaded(loaded) = store.load_aggregate().await.unwrap() else {
            panic!("an aggregate");
        };
        let mut stored = loaded.spaces.clone();
        let meta = stored
            .iter()
            .position(|space| space.snapshot.id == id(SPACE_ID))
            .unwrap();
        let meta = stored.remove(meta);
        stored.insert(0, meta);
        let request = commit_for(step, &stored, 0x81).unwrap();
        let kind = match store.commit(request).await.unwrap() {
            CommitResult::Committed { .. } => "committed",
            CommitResult::Conflict(_) => "conflict",
            CommitResult::AggregateRefused(_) => "aggregate-refused",
            other => panic!("an answer no step here makes: {other:?}"),
        };
        kinds.insert(kind);
    }
    assert_eq!(
        kinds.into_iter().collect::<Vec<_>>(),
        ["aggregate-refused", "committed", "conflict"]
    );
}

/// `reordered` lists two or more Resources out of ascending order for every
/// `order`, so no generated snapshot reaches a store already sorted.
#[test]
fn reorders_every_snapshot_of_two_or_more_resources_out_of_ascending_order() {
    for count in 2_u8..=4 {
        let resources: Vec<Resource> = (0..count).map(note).collect();
        for order in 0..=u8::MAX {
            let ids: Vec<String> = reordered(resources.clone(), order)
                .iter()
                .map(|held| held.id.as_str().to_owned())
                .collect();
            assert!(
                ids.windows(2).any(|pair| pair[0] > pair[1]),
                "{count} Resources reordered by {order:#04x}: {ids:?}"
            );
        }
    }
}
