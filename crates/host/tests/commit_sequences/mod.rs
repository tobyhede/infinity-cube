//! Generated commit sequences (rust-sqlite-test-coverage 07), written once
//! and run by every durable store against the memory store:
//! `tests/store_properties.rs` on a SQLite file and
//! `tests/postgres_properties.rs` on a PostgreSQL database. Every step
//! answers the same on both stores, and both hold the same aggregate at the
//! end, the durable store read again by a fresh repository.
//!
//! A case starts from Meta and two linked Spaces, each at revision 0 or
//! within two of the ceiling, and takes up to eleven steps: renames and
//! Resources added or dropped at a current, stale or ahead revision; a
//! Resource moved between Spaces, the receiver listed first or last; a Space
//! created, linked from Meta or not, one already stored among them; a Space
//! linked from another, stored or not; a Space deleted, Meta among them, the
//! Spaces linking it left alone, changed but still linking, or unlinked, the
//! delete listed first or last; a Graph Meta selects removed or one added;
//! Resources placed and an Edge drawn (a Map-internal Edit); one Space
//! changed twice in a commit; and an update whose snapshot names another
//! Space. Some Resources belong to no plugin and hold content whose keys are
//! out of `jsonb`'s order (by length, then by bytes) and out of ascending
//! order, as do their placements' Map content, and a Map's positions are
//! listed out of Resource id order.
//!
//! **Resource order is normalised by neither side of a comparison.** Every
//! snapshot a step commits lists its Resources out of ascending id order, and
//! each store must answer them ascending (Storage ST-21): each answer and
//! each stored Space is asserted ascending on each store before the two are
//! compared. **Key order** is the durable store's to keep or not: a store
//! that keeps it ([`KeyOrder::Kept`], SQLite's text column) is compared
//! exactly; one that reorders it ([`KeyOrder::Reordered`], PostgreSQL's
//! `jsonb`) is compared as the TypeScript contract's `toEqual` compares, with
//! every JSON object on both sides put in ascending key order
//! (`repository_contract::InKeyOrder`): each Resource's content, each
//! placement's Map content and each Map's positions, keyed by Resource id.
//! The values must still agree, and the memory store's side is normalised
//! the same way, so neither side's order decides the comparison.
//!
//! The stores share `decide_commit`, so a defect in it is the same on both
//! and passes here; the repository contract (`tests/repository_contract/`)
//! holds TypeScript's absolute answers, and these come after it.

#![allow(
    dead_code,
    reason = "each test binary running the sequences uses part of their support"
)]

use host::{
    AggregateLoad, CommitResult, LoadedAggregate, LoadedSpace, MemorySpaceRepository,
    RepositoryError, Revision, SpaceChange, SpaceCommit, SpaceRepository,
};
use intake::json::JsonValue;
use intake::{Edge, GraphId, Placement, Resource, ResourceId, SpaceId, SpaceSnapshot};
use proptest::prelude::*;
use serde_json::Value;

use crate::repository_contract::{
    EMPTY_ASSET_REF, InKeyOrder, SPACE_ID, id, resource, snapshot, snapshot_text, space_holding,
    space_json, space_resource, target_document,
};

/// The Spaces a generated case can name: Meta, then the ordinary ones, the
/// last two stored by no initialization.
pub const ORDINARY: [&str; 4] = [
    "c2000000-0000-4000-8000-000000000001",
    "c2000000-0000-4000-8000-000000000002",
    "c2000000-0000-4000-8000-000000000003",
    "c2000000-0000-4000-8000-000000000004",
];

/// The kind no plugin draws, whose content a store keeps as written.
pub const CHART: &str = "vnd.example.chart";

/// The Markdown Resources a generated case can add, by index.
fn note_id(index: u8) -> String {
    format!("c2000000-0000-4000-8000-0000000001{:02x}", index % 8)
}

/// The Resources of no plugin a generated case can add, by index.
fn chart_id(index: u8) -> String {
    format!("c2000000-0000-4000-8000-0000000003{:02x}", index % 4)
}

/// The id of the Space Resource through which Meta links ordinary Space
/// `index`.
fn link_resource_id(index: usize) -> String {
    format!("c2000000-0000-4000-8000-0000000002{index:02x}")
}

/// The id of the Graph a step adds to ordinary Space `index`.
fn added_graph_id(index: usize) -> GraphId {
    GraphId::parse(&format!("c2000000-0000-4000-8000-0000000004{index:02x}")).unwrap()
}

fn note(index: u8) -> Resource {
    let id = note_id(index);
    let holder = space_holding(SPACE_ID, "Holder", vec![resource(&id, "Note")]);
    holder.resources.into_iter().next().unwrap()
}

/// A Resource of no plugin whose content holds its keys out of `jsonb`'s
/// order and out of ascending order, at every depth.
fn chart(index: u8) -> Resource {
    let id = chart_id(index);
    let number = index % 4;
    let holder = snapshot_text(
        SPACE_ID,
        &format!(
            r#"{{"id":"{SPACE_ID}","document":{{"version":1,"title":"Holder"}},"resources":[{{"id":"{id}","document":{{"title":"Chart {number}","kind":"{CHART}","content":{{"source":"{EMPTY_ASSET_REF}","legend":"Legend {number}","options":{{"direction":"TD","at":[1,2.5,null,{{"nested":true,"id":{number}}}]}}}}}}}}]}}"#
        ),
    );
    holder.resources.into_iter().next().unwrap()
}

/// The Map content a placed Resource of no plugin holds: its keys out of
/// `jsonb`'s order and out of ascending order.
fn chart_map_content() -> JsonValue {
    intake::json::parse(r#"{"zoom":2,"at":["ink",{"label":"x","id":7}]}"#).unwrap()
}

fn link(index: usize) -> Resource {
    let holder = space_holding(
        SPACE_ID,
        "Holder",
        vec![space_resource(&link_resource_id(index), ORDINARY[index])],
    );
    holder.resources.into_iter().next().unwrap()
}

/// The Space Resource through which stored Space `from` links ordinary
/// Space `to`: its id names both.
fn link_from(from: SpaceId, to: usize) -> Resource {
    let from = position(from.as_str()).map_or(0, |at| at + 1);
    let id = format!("c2000000-0000-4000-8000-0000000005{from:x}{to:x}");
    let holder = space_holding(SPACE_ID, "Holder", vec![space_resource(&id, ORDINARY[to])]);
    holder.resources.into_iter().next().unwrap()
}

/// Whether `resource` is a Space Resource showing `space`.
fn links_to(resource: &Resource, space: SpaceId) -> bool {
    resource.kind.as_str() == "space"
        && resource
            .content
            .as_object()
            .and_then(|content| content.get("spaceId"))
            .and_then(JsonValue::as_str)
            == Some(space.as_str())
}

/// `resources` in an order that is not ascending whenever there are two:
/// rotated by `order` and reversed when its top bit is set, then rotated
/// once more if that left them ascending.
pub fn reordered(mut resources: Vec<Resource>, order: u8) -> Vec<Resource> {
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

/// `snapshot` with no placement and no Edge naming a Resource it no longer
/// holds, so a step that drops or moves a placed Resource fails intake only
/// for what the step itself is about.
fn pruned(mut snapshot: SpaceSnapshot) -> SpaceSnapshot {
    let held: Vec<ResourceId> = snapshot.resources.iter().map(|held| held.id).collect();
    for map in snapshot.document.maps.iter_mut().flatten() {
        map.positions.retain(|(placed, _)| held.contains(placed));
        for graph in &mut map.graphs {
            graph
                .edges
                .retain(|edge| held.contains(&edge.from) && held.contains(&edge.to));
        }
    }
    snapshot
}

/// What a generated step asks of the Spaces stored when it runs.
#[derive(Debug, Clone)]
pub enum Step {
    /// Retitle a stored Space.
    Retitle { space: usize, revision: Expected },
    /// Add a Markdown Resource, or one of no plugin, to a stored Space,
    /// perhaps one another holds.
    Add {
        space: usize,
        note: u8,
        of_no_plugin: bool,
        revision: Expected,
    },
    /// Drop a Resource from a stored Space, perhaps a Space Resource.
    Drop {
        space: usize,
        index: usize,
        revision: Expected,
    },
    /// Move a Resource that is not a Space Resource between two stored
    /// Spaces in one commit, listing the receiving Space first or last.
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
    /// Link an ordinary Space, stored or not, from a stored Space through a
    /// Space Resource of its own.
    Link { from: usize, to: usize },
    /// Delete a stored Space, Meta among them, and update every other stored
    /// Space linking it as `unlinking` says, those updates listed before the
    /// delete or after it.
    Delete {
        space: usize,
        unlinking: Unlinking,
        updates_first: bool,
        revision: Expected,
    },
    /// Remove the Graph Meta's Space Resource selects from an ordinary Space.
    DropGraph { space: usize },
    /// Add a second Graph to an ordinary Space's Map.
    AddGraph { space: usize },
    /// Place every Resource of a stored Space with Maps, retitle and colour
    /// its Graphs and draw an Edge between its first two Resources: nothing
    /// another Space's Space Resource selects.
    Arrange { space: usize, x: u8 },
    /// Update a stored Space and delete it in one commit.
    Twice { space: usize, delete_first: bool },
    /// Update a stored Space with another stored Space's snapshot.
    Mismatched { space: usize, other: usize },
}

/// What a deletion does to the other stored Spaces linking the Space it
/// deletes: the TypeScript differential's "partial-deletion",
/// "incomplete-deletion-proposal" and "complete-deletion".
#[derive(Debug, Clone, Copy)]
pub enum Unlinking {
    /// Leaves them alone.
    Untouched,
    /// Retitles each, keeping its links.
    Retitled,
    /// Drops each one's links to it.
    Dropped,
}

/// The revision a change expects, against what is stored.
#[derive(Debug, Clone, Copy)]
pub enum Expected {
    Current,
    Behind,
    Ahead,
}

impl Expected {
    /// The revision expected of a Space stored at `stored`. Nothing is
    /// ahead of the ceiling, so ahead of it is behind it.
    pub fn of(self, stored: Revision) -> Revision {
        let value = stored.get();
        let behind = Revision::new(value.saturating_sub(1)).unwrap();
        match self {
            Self::Current => stored,
            Self::Behind => behind,
            Self::Ahead => Revision::new(value + 1).unwrap_or(behind),
        }
    }
}

/// The revision an initial Space starts at.
#[derive(Debug, Clone, Copy)]
pub enum Start {
    /// Revision 0, where every store puts it.
    First,
    /// The ceiling, less this many (at most two).
    BelowCeiling(u8),
}

impl Start {
    pub fn revision(self) -> Revision {
        match self {
            Self::First => Revision::FIRST,
            Self::BelowCeiling(less) => Revision::new(Revision::CEILING - u64::from(less)).unwrap(),
        }
    }
}

/// A generated case: the revision each initial Space starts at (Meta first),
/// and the steps, each with the order its snapshots list their Resources in.
#[derive(Debug, Clone)]
pub struct Case {
    pub start: [Start; 3],
    pub steps: Vec<(Step, u8)>,
}

/// A fixed sequence: the revision each initial Space starts at, and each
/// step with the answer it exists to reach, so a store comparison over it
/// holds for that answer whatever a generated case happens to draw.
#[derive(Debug, Clone)]
pub struct Fixed {
    pub start: [Start; 3],
    pub steps: Vec<(Step, &'static str)>,
}

impl Fixed {
    /// The sequence as a case, every snapshot listing its Resources in one
    /// order that is not ascending.
    pub fn case(&self) -> Case {
        Case {
            start: self.start,
            steps: self
                .steps
                .iter()
                .map(|(step, _)| (step.clone(), 0x81))
                .collect(),
        }
    }

    /// The answer each step exists to reach, in order.
    pub fn answers(&self) -> Vec<&'static str> {
        self.steps.iter().map(|(_, answer)| *answer).collect()
    }
}

/// The TypeScript differential's scenarios that need no link or ceiling, in
/// one sequence from the initial aggregate: "topology-preserving-update",
/// "update-conflict", "map-internal-update", "graph-added",
/// "selected-graph-replaced", "create-ordinary-space", "create-conflict",
/// "delete-conflict", "duplicate-space-change" and "mismatched-snapshot".
pub fn scenario_steps() -> Fixed {
    let retitle = |space, revision| Step::Retitle { space, revision };
    Fixed {
        start: [Start::First, Start::First, Start::First],
        steps: vec![
            (retitle(1, Expected::Current), "committed"),
            (retitle(1, Expected::Behind), "conflict"),
            (Step::Arrange { space: 1, x: 7 }, "committed"),
            (Step::AddGraph { space: 0 }, "committed"),
            (Step::DropGraph { space: 1 }, "aggregate-refused"),
            (
                Step::Create {
                    space: 2,
                    linked: true,
                    meta_first: false,
                },
                "committed",
            ),
            (
                Step::Create {
                    space: 0,
                    linked: false,
                    meta_first: false,
                },
                "conflict",
            ),
            (retitle(3, Expected::Current), "committed"),
            (
                Step::Delete {
                    space: 3,
                    unlinking: Unlinking::Dropped,
                    updates_first: false,
                    revision: Expected::Behind,
                },
                "conflict",
            ),
            (
                Step::Twice {
                    space: 2,
                    delete_first: false,
                },
                "rejected",
            ),
            (Step::Mismatched { space: 1, other: 1 }, "rejected"),
        ],
    }
}

/// Placing Resources, drawing an Edge and adding a Graph commit, and
/// committing at revisions near the ceiling reaches it and then fails: a
/// Resource of no plugin added at CEILING − 1 takes the Space to the
/// ceiling, past which an update fails.
pub fn map_internal_and_ceiling_steps() -> Fixed {
    Fixed {
        start: [Start::First, Start::BelowCeiling(1), Start::First],
        steps: vec![
            (
                Step::Add {
                    space: 1,
                    note: 0,
                    of_no_plugin: true,
                    revision: Expected::Current,
                },
                "committed",
            ),
            (Step::Arrange { space: 2, x: 9 }, "committed"),
            (Step::AddGraph { space: 1 }, "committed"),
            (
                Step::Retitle {
                    space: 1,
                    revision: Expected::Current,
                },
                "invariant-failure",
            ),
            (
                Step::Retitle {
                    space: 1,
                    revision: Expected::Ahead,
                },
                "conflict",
            ),
        ],
    }
}

/// The TypeScript differential's deletion scenarios: an ordinary Space
/// links another; deleting a Space two Spaces link, alone, is a conflict
/// ("partial-deletion"); deleting it while each Space linking it changes but
/// keeps its link is refused ("incomplete-deletion-proposal"); deleting it
/// while each drops its link, Meta and an ordinary Space both, commits
/// ("complete-deletion"); and a link to a Space no longer stored is refused.
pub fn linking_and_deletion_steps() -> Fixed {
    let delete = |unlinking| Step::Delete {
        space: 1,
        unlinking,
        updates_first: true,
        revision: Expected::Current,
    };
    Fixed {
        start: [Start::First, Start::First, Start::First],
        steps: vec![
            (Step::Link { from: 2, to: 0 }, "committed"),
            (delete(Unlinking::Untouched), "conflict"),
            (delete(Unlinking::Retitled), "aggregate-refused"),
            (delete(Unlinking::Dropped), "committed"),
            (Step::Link { from: 0, to: 0 }, "aggregate-refused"),
        ],
    }
}

fn expected() -> impl Strategy<Value = Expected> {
    prop_oneof![
        6 => Just(Expected::Current),
        1 => Just(Expected::Behind),
        1 => Just(Expected::Ahead),
    ]
}

fn unlinking() -> impl Strategy<Value = Unlinking> {
    prop_oneof![
        Just(Unlinking::Untouched),
        Just(Unlinking::Retitled),
        Just(Unlinking::Dropped),
    ]
}

fn start() -> impl Strategy<Value = Start> {
    prop_oneof![
        3 => Just(Start::First),
        1 => (0_u8..=2).prop_map(Start::BelowCeiling),
    ]
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        (0_usize..8, expected()).prop_map(|(space, revision)| Step::Retitle { space, revision }),
        (0_usize..8, any::<u8>(), any::<bool>(), expected()).prop_map(
            |(space, note, of_no_plugin, revision)| Step::Add {
                space,
                note,
                of_no_plugin,
                revision
            }
        ),
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
        (0_usize..8, 0_usize..4).prop_map(|(from, to)| Step::Link { from, to }),
        (0_usize..8, unlinking(), any::<bool>(), expected()).prop_map(
            |(space, unlinking, updates_first, revision)| Step::Delete {
                space,
                unlinking,
                updates_first,
                revision
            }
        ),
        (0_usize..4).prop_map(|space| Step::DropGraph { space }),
        (0_usize..4).prop_map(|space| Step::AddGraph { space }),
        (0_usize..8, any::<u8>()).prop_map(|(space, x)| Step::Arrange { space, x }),
        (0_usize..8, any::<bool>()).prop_map(|(space, delete_first)| Step::Twice {
            space,
            delete_first
        }),
        (0_usize..8, 1_usize..8).prop_map(|(space, other)| Step::Mismatched { space, other }),
    ]
}

/// A case of up to `steps` steps.
pub fn case(steps: usize) -> impl Strategy<Value = Case> {
    (
        [start(), start(), start()],
        proptest::collection::vec((step(), any::<u8>()), 1..steps),
    )
        .prop_map(|(start, steps)| Case { start, steps })
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

/// The position among [`ORDINARY`] of `space`, if it is one.
fn position(space: &str) -> Option<usize> {
    ORDINARY.iter().position(|ordinary| *ordinary == space)
}

/// The commit `step` makes of `stored`, the Spaces stored now (Meta first),
/// each snapshot's Resources reordered by `order`; `None` where the step
/// names nothing it can act on.
#[allow(
    clippy::too_many_lines,
    reason = "one arm per step, each the commit its variant documents"
)]
pub fn commit_for(step: &Step, stored: &[LoadedSpace], order: u8) -> Option<SpaceCommit> {
    let meta = &stored[0];
    let pick = |index: usize| &stored[index % stored.len()];
    let ordinary_stored = |space: usize| {
        stored
            .iter()
            .find(|held| position(held.snapshot.id.as_str()) == Some(space))
    };
    let with = |space: &LoadedSpace, resources: Vec<Resource>| {
        let mut next = space.snapshot.clone();
        next.resources = reordered(resources, order);
        pruned(next)
    };
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
            of_no_plugin,
            revision,
        } => {
            let space = pick(*space);
            let mut resources = space.snapshot.resources.clone();
            let added = if *of_no_plugin {
                chart(*added)
            } else {
                note(*added)
            };
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
            let movable: Vec<usize> = giving
                .iter()
                .enumerate()
                .filter(|(_, held)| held.kind.as_str() != "space")
                .map(|(at, _)| at)
                .collect();
            let moved = giving.remove(*movable.get(index % movable.len().max(1))?);
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
        Step::Link { from, to } => {
            let linking = pick(*from);
            let link = link_from(linking.snapshot.id, *to);
            if linking
                .snapshot
                .resources
                .iter()
                .any(|held| held.id == link.id)
            {
                return None;
            }
            let mut resources = linking.snapshot.resources.clone();
            resources.push(link);
            SpaceCommit {
                changes: vec![update(with(linking, resources), linking.revision)],
            }
        }
        Step::Delete {
            space,
            unlinking,
            updates_first,
            revision,
        } => {
            let deleted = pick(*space);
            let delete = SpaceChange::Delete {
                space_id: deleted.snapshot.id,
                expected_revision: revision.of(deleted.revision),
            };
            let updates: Vec<SpaceChange> = stored
                .iter()
                .filter(|_| !matches!(unlinking, Unlinking::Untouched))
                .filter(|held| held.snapshot.id != deleted.snapshot.id)
                .filter(|held| {
                    held.snapshot
                        .resources
                        .iter()
                        .any(|resource| links_to(resource, deleted.snapshot.id))
                })
                .map(|held| {
                    let resources = held
                        .snapshot
                        .resources
                        .iter()
                        .filter(|resource| {
                            matches!(unlinking, Unlinking::Retitled)
                                || !links_to(resource, deleted.snapshot.id)
                        })
                        .cloned()
                        .collect();
                    let mut next = with(held, resources);
                    if matches!(unlinking, Unlinking::Retitled) {
                        next.document.title.push('~');
                    }
                    update(next, held.revision)
                })
                .collect();
            let mut changes = vec![delete];
            if *updates_first {
                changes.splice(0..0, updates);
            } else {
                changes.extend(updates);
            }
            SpaceCommit { changes }
        }
        Step::DropGraph { space } => {
            let target = ordinary_stored(*space)?;
            let mut next = with(target, target.snapshot.resources.clone());
            for map in next.document.maps.iter_mut().flatten() {
                map.graphs.clear();
                map.active_graph = None;
            }
            SpaceCommit {
                changes: vec![update(next, target.revision)],
            }
        }
        Step::AddGraph { space } => {
            let target = ordinary_stored(*space)?;
            let mut next = with(target, target.snapshot.resources.clone());
            let map = next.document.maps.as_mut()?.first_mut()?;
            let mut added = map.graphs.first()?.clone();
            added.id = added_graph_id(*space);
            "Added".clone_into(&mut added.title);
            added.edges.clear();
            map.graphs.push(added);
            SpaceCommit {
                changes: vec![update(next, target.revision)],
            }
        }
        Step::Arrange { space, x } => {
            let target = pick(*space);
            let mut next = with(target, target.snapshot.resources.clone());
            let placed: Vec<(ResourceId, bool)> = next
                .resources
                .iter()
                .map(|held| (held.id, held.kind.as_str() == CHART))
                .collect();
            let map = next.document.maps.as_mut()?.first_mut()?;
            map.title = format!("Map moved {x}");
            map.positions = (0_u32..)
                .zip(&placed)
                .map(|(at, (placed, of_no_plugin))| {
                    (
                        *placed,
                        Placement {
                            x: f64::from(at) * 300.0,
                            y: f64::from(*x),
                            size: None,
                            edit_size: None,
                            content: of_no_plugin.then(chart_map_content),
                        },
                    )
                })
                .collect();
            for graph in &mut map.graphs {
                graph.title = format!("Graph {x}");
                graph.color = Some("teal".to_owned());
                graph.edges = match placed.as_slice() {
                    [(from, _), (to, _), ..] => vec![Edge {
                        from: *from,
                        to: *to,
                        title: None,
                        title_hidden: false,
                    }],
                    _ => Vec::new(),
                };
            }
            SpaceCommit {
                changes: vec![update(next, target.revision)],
            }
        }
        Step::Twice {
            space,
            delete_first,
        } => {
            let target = pick(*space);
            let mut next = with(target, target.snapshot.resources.clone());
            next.document.title.push('?');
            in_order(
                update(next, target.revision),
                SpaceChange::Delete {
                    space_id: target.snapshot.id,
                    expected_revision: target.revision,
                },
                *delete_first,
            )
        }
        Step::Mismatched { space, other } => {
            let (target, named) = (pick(*space), pick(space + other));
            if target.snapshot.id == named.snapshot.id {
                return None;
            }
            SpaceCommit {
                changes: vec![SpaceChange::Update {
                    space_id: target.snapshot.id,
                    snapshot: with(named, named.snapshot.resources.clone()),
                    expected_revision: target.revision,
                }],
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

fn assert_ascending_answer(store: &str, answer: &Result<CommitResult, RepositoryError>) {
    if let Ok(CommitResult::Conflict(conflicts)) = answer {
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

/// The Spaces `loaded` holds, Meta first, each asserted to list its
/// Resources ascending.
pub fn stored_spaces(store: &str, loaded: &AggregateLoad) -> Vec<LoadedSpace> {
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
/// of the first two ordinary Spaces, each holding a Note of its own, every
/// Space listing its Resources out of ascending order.
pub fn initial() -> Vec<SpaceSnapshot> {
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

/// Each initial Space's id and the revision `start` puts it at, Meta first.
pub fn start_revisions(start: &[Start; 3]) -> Vec<(SpaceId, Revision)> {
    initial()
        .iter()
        .zip(start)
        .map(|(space, start)| (space.id, start.revision()))
        .collect()
}

/// The statement that puts stored Space `space` at `revision`, past the
/// store's codec, on SQLite and PostgreSQL alike: both hold revisions as
/// decimal text.
pub fn revision_statement(space: SpaceId, revision: Revision) -> String {
    format!(r#"UPDATE "spaces" SET "revision" = '{revision}' WHERE "id" = '{space}';"#)
}

/// A memory store holding the initial aggregate at the revisions `start`
/// puts it at.
pub fn memory_at(start: &[Start; 3]) -> MemorySpaceRepository {
    MemorySpaceRepository::holding(LoadedAggregate {
        meta_space_id: id(SPACE_ID),
        spaces: initial()
            .into_iter()
            .zip(start)
            .map(|(snapshot, start)| LoadedSpace {
                snapshot,
                revision: start.revision(),
                exported_revision: None,
            })
            .collect(),
    })
}

/// Whether a durable store keeps the key order of the content it is given.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyOrder {
    /// It answers content as committed, so it is compared exactly.
    Kept,
    /// It answers content in an order of its own, so both sides are
    /// compared with every JSON object in ascending key order.
    Reordered,
}

impl KeyOrder {
    /// `value` as this store's comparison sees it.
    fn compared<T: InKeyOrder + Clone>(self, value: &T) -> T {
        match self {
            Self::Kept => value.clone(),
            Self::Reordered => value.in_key_order(),
        }
    }
}

/// What kind of answer a commit made, by name.
pub fn kind_of(answer: &Result<CommitResult, RepositoryError>) -> &'static str {
    match answer {
        Ok(CommitResult::Committed { .. }) => "committed",
        Ok(CommitResult::Conflict(_)) => "conflict",
        Ok(CommitResult::AggregateRefused(_)) => "aggregate-refused",
        Ok(CommitResult::Rejected { .. }) => "rejected",
        Ok(_) => "another answer",
        Err(RepositoryError::BrokenStoredState(_)) => "invariant-failure",
        Err(_) => "failure",
    }
}

/// Run `steps` on `memory` and on `durable`, named `name`, each stored the
/// same initial aggregate at the same revisions: each step's commit is made
/// of what the memory store holds, and both stores answer it the same,
/// compared as `keys` says, each answer's Spaces asserted ascending first.
/// Answers the kind of each answer made.
pub async fn compare_steps<R: SpaceRepository>(
    memory: &MemorySpaceRepository,
    durable: &R,
    name: &str,
    keys: KeyOrder,
    steps: &[(Step, u8)],
) -> Vec<&'static str> {
    let mut kinds = Vec::new();
    for (step, order) in steps {
        let loaded = memory.load_aggregate().await.unwrap();
        let stored = stored_spaces("the memory store", &loaded);
        let Some(request) = commit_for(step, &stored, *order) else {
            continue;
        };
        let from_memory = memory.commit(request.clone()).await;
        let from_durable = durable.commit(request.clone()).await;
        assert_ascending_answer("the memory store", &from_memory);
        assert_ascending_answer(name, &from_durable);
        assert_eq!(
            keys.compared(&from_durable),
            keys.compared(&from_memory),
            "{name}: {step:?} answers {request:?}"
        );
        kinds.push(kind_of(&from_memory));
    }
    kinds
}

/// Assert that `reopened`, a fresh repository over what a durable store
/// named `name` kept, holds the aggregate `memory` holds, compared as `keys`
/// says, each Space's Resources ascending on each.
pub async fn compare_final<R: SpaceRepository>(
    memory: &MemorySpaceRepository,
    reopened: &R,
    name: &str,
    keys: KeyOrder,
) {
    let held = memory.load_aggregate().await.unwrap();
    stored_spaces("the memory store", &held);
    let read = reopened.load_aggregate().await.unwrap();
    stored_spaces(name, &read);
    assert_eq!(
        keys.compared(&read),
        keys.compared(&held),
        "the aggregate the memory store and {name} hold at the end"
    );
}
