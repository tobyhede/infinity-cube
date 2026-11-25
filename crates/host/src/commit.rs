//! What a commit means, decided once for every store
//! (`packages/persistence/src/commit-decision.ts`).
//!
//! [`decide_commit`] takes what a store has already read and answers what it
//! must do next, answer or write, before anything is written. It is pure: no
//! IO and no async. Each store keeps its own reads, writes and locking.

use std::collections::{BTreeMap, HashMap, HashSet};

use intake::{
    GraphId, MapId, Refusal, Refusals, Resource, ResourceId, SpaceDocument, SpaceId, SpaceSnapshot,
    load_aggregate, load_space,
};

use crate::repository::{
    AggregateRefusal, CommitRefusal, CommitResult, LoadedSpace, Revision, SpaceChange, SpaceCommit,
    SpaceConflict,
};

/// What a store does next with a commit.
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub enum CommitDecision {
    /// Answer the caller now; nothing is written.
    Answer(CommitResult),
    /// Store `written` and remove `deleted`, leaving every other stored Space
    /// as it is, then answer `result`.
    Write {
        /// What to answer once written.
        result: CommitResult,
        /// Each Space the commit creates or updates, as it is stored once the
        /// commit lands, ascending by id.
        written: Vec<LoadedSpace>,
        /// Each Space the commit deletes, in the order the changes name them.
        deleted: Vec<SpaceId>,
    },
}

fn rejection(message: String) -> CommitResult {
    CommitResult::Rejected { message }
}

fn rejected(message: String) -> CommitDecision {
    CommitDecision::Answer(rejection(message))
}

/// The revision a created or updated Space carries once the commit lands.
fn committed_revision(change: &SpaceChange) -> Revision {
    match change {
        SpaceChange::Update {
            expected_revision, ..
        }
        | SpaceChange::Delete {
            expected_revision, ..
        } => expected_revision.next(),
        SpaceChange::Create { .. } => Revision::FIRST,
    }
}

/// Refuse a change set the store will not judge: an empty one, one naming a
/// Space twice, one naming a Space in other than lower case, or one whose
/// change and snapshot disagree about the Space.
///
/// A Space's id is its directory's name, which Import reads only in lower
/// case, so a Space created under an upper-case id would be exported to a
/// directory no later run can read.
///
/// It reads nothing stored, so a store asks it before opening a transaction:
/// a malformed request is refused whether or not the store answers (Storage
/// ST-17), as `#commitUnserialised` refuses it first.
pub(crate) fn request_refusal(request: &SpaceCommit) -> Option<CommitResult> {
    if request.changes.is_empty() {
        return Some(rejection(
            "A commit requires at least one change".to_owned(),
        ));
    }
    let mut ids = HashSet::new();
    for change in &request.changes {
        let id = change.space_id();
        if !ids.insert(id) {
            return Some(rejection(format!("Space {id} is named more than once")));
        }
        if !id.uuid().is_lower_case() {
            return Some(rejection(format!("Space {id} must be named in lower case")));
        }
        if let Some(snapshot) = change.snapshot()
            && snapshot.id != id
        {
            return Some(rejection(format!(
                "Change Space id {id} does not match its snapshot"
            )));
        }
    }
    None
}

/// Refuse an update to a Space already at [`Revision::CEILING`], whose next
/// revision no store can keep: holding it there would let two Edits commit at
/// one revision, the second overwriting the first without a conflict. Asked
/// only once every expected revision matches the stored one.
fn ceiling_refusal(request: &SpaceCommit) -> Option<CommitDecision> {
    request.changes.iter().find_map(|change| match change {
        SpaceChange::Update {
            space_id,
            expected_revision,
            ..
        } if expected_revision.get() == Revision::CEILING => Some(rejected(format!(
            "Space {space_id} is at the highest revision a store keeps"
        ))),
        _ => None,
    })
}

/// A Space of the candidate aggregate, borrowed from the store or from the
/// change that writes it; only a written one is copied.
#[derive(Debug, Clone, Copy)]
struct Candidate<'a> {
    snapshot: &'a SpaceSnapshot,
    revision: Revision,
    exported_revision: Option<Revision>,
}

impl<'a> From<&'a LoadedSpace> for Candidate<'a> {
    fn from(space: &'a LoadedSpace) -> Self {
        Self {
            snapshot: &space.snapshot,
            revision: space.revision,
            exported_revision: space.exported_revision,
        }
    }
}

impl Candidate<'_> {
    fn to_loaded(self) -> LoadedSpace {
        LoadedSpace {
            snapshot: self.snapshot.clone(),
            revision: self.revision,
            exported_revision: self.exported_revision,
        }
    }
}

/// The Space stage's refusals grouped as the wire carries them: each refused
/// Space by its position in the candidate aggregate, as intake names it.
/// `None` when a later stage refused.
fn space_stage_errors(refusals: &Refusals) -> Option<Vec<AggregateRefusal>> {
    Some(
        refusals
            .space_stage()?
            .into_iter()
            .map(
                |(snapshot_index, errors)| AggregateRefusal::InvalidSpaceSnapshot {
                    snapshot_index,
                    errors: errors.to_vec(),
                },
            )
            .collect(),
    )
}

/// The aggregate stage's refusals of a candidate aggregate grouped as the
/// wire carries them.
fn grouped(
    refusals: &[Refusal],
    candidate: &BTreeMap<SpaceId, Candidate<'_>>,
) -> Vec<AggregateRefusal> {
    let order: Vec<SpaceId> = candidate.keys().copied().collect();
    let position = |id: SpaceId| order.iter().position(|candidate| *candidate == id);
    let mut errors = Vec::new();
    let mut resources: Vec<intake::ResourceId> = Vec::new();
    for refusal in refusals {
        match refusal {
            Refusal::DuplicateSpaceId { space } => {
                errors.push(AggregateRefusal::DuplicateSpaceId {
                    space_id: *space,
                    snapshot_indexes: position(*space).into_iter().collect(),
                });
            }
            Refusal::DuplicateResourceId { resource, .. } => {
                if resources.contains(resource) {
                    continue;
                }
                resources.push(*resource);
                let space_ids = candidate
                    .values()
                    .filter(|space| {
                        space
                            .snapshot
                            .resources
                            .iter()
                            .any(|held| held.id == *resource)
                    })
                    .map(|space| space.snapshot.id)
                    .collect();
                errors.push(AggregateRefusal::DuplicateResourceId {
                    resource_id: *resource,
                    space_ids,
                });
            }
            other => errors.push(AggregateRefusal::Aggregate(other.clone())),
        }
    }
    errors
}

fn refused(refusals: Vec<Refusal>, candidate: &BTreeMap<SpaceId, Candidate<'_>>) -> CommitDecision {
    let errors = grouped(&refusals, candidate);
    CommitDecision::Answer(CommitResult::AggregateRefused(CommitRefusal {
        refusals,
        errors,
    }))
}

/// Decide a change set against every stored Space and the Meta identity, by
/// checking the complete candidate aggregate it would produce, ascending by
/// Space id with created Spaces among the stored ones.
///
/// The order of the answers is the TypeScript decision's: a request the
/// store will not judge; then each stale change as a conflict; then a store
/// with no Meta Space; then a deletion another Space the change set leaves
/// alone still references, as a conflict the caller resolves by reloading;
/// then intake's refusals, less an unreferenced Space the stored aggregate
/// already refused and, while a Resource of a missing kind remains, one it
/// already held (ADR 0142).
///
/// `stored` is read, not copied: only what the answer carries is, a
/// conflict's current Space or each Space a Write creates or updates.
pub fn decide_commit<'a>(
    request: &SpaceCommit,
    meta_space_id: Option<SpaceId>,
    stored: impl IntoIterator<Item = &'a LoadedSpace>,
) -> CommitDecision {
    if let Some(refusal) = request_refusal(request) {
        return CommitDecision::Answer(refusal);
    }
    let by_id: BTreeMap<SpaceId, &LoadedSpace> = stored
        .into_iter()
        .map(|space| (space.snapshot.id, space))
        .collect();

    let conflicts: Vec<SpaceConflict> = request
        .changes
        .iter()
        .filter_map(|change| {
            let current = by_id.get(&change.space_id());
            let stale = match change {
                SpaceChange::Create { .. } => current.is_some(),
                SpaceChange::Update {
                    expected_revision, ..
                }
                | SpaceChange::Delete {
                    expected_revision, ..
                } => current.map(|space| space.revision) != Some(*expected_revision),
            };
            stale.then(|| SpaceConflict {
                space_id: change.space_id(),
                current: current.map(|space| (*space).clone()),
            })
        })
        .collect();
    if !conflicts.is_empty() {
        return CommitDecision::Answer(CommitResult::Conflict(conflicts));
    }
    if let Some(refusal) = ceiling_refusal(request) {
        return refusal;
    }

    let Some(meta_space_id) = meta_space_id else {
        return rejected("The repository has no Meta Space".to_owned());
    };

    // The Spaces the stored aggregate refused as unreferenced, which a
    // refused candidate is forgiven; and those it held while a Resource of a
    // missing kind remained, which only a candidate that still holds such a
    // Resource is also forgiven (ADR 0142).
    let baseline = load_aggregate(meta_space_id, by_id.values().map(|space| &space.snapshot));
    let (baseline_held, baseline_unreferenced): (&[SpaceId], Vec<SpaceId>) = match &baseline {
        Ok(aggregate) => (aggregate.held_space_ids(), Vec::new()),
        Err(refusals) => (
            &[],
            refusals
                .as_slice()
                .iter()
                .filter_map(|refusal| match refusal {
                    Refusal::OrdinarySpaceUnreferenced { space } => Some(*space),
                    _ => None,
                })
                .collect(),
        ),
    };

    let mut candidate: BTreeMap<SpaceId, Candidate<'_>> = by_id
        .iter()
        .map(|(id, space)| (*id, Candidate::from(*space)))
        .collect();
    for change in &request.changes {
        match change {
            SpaceChange::Delete { space_id, .. } => {
                candidate.remove(space_id);
            }
            SpaceChange::Create {
                space_id, snapshot, ..
            }
            | SpaceChange::Update {
                space_id, snapshot, ..
            } => {
                candidate.insert(
                    *space_id,
                    Candidate {
                        snapshot,
                        revision: committed_revision(change),
                        exported_revision: by_id
                            .get(space_id)
                            .and_then(|space| space.exported_revision),
                    },
                );
            }
        }
    }

    let deleted: Vec<SpaceId> = request
        .changes
        .iter()
        .filter(|change| matches!(change, SpaceChange::Delete { .. }))
        .map(SpaceChange::space_id)
        .collect();
    let changed: HashSet<SpaceId> = request.changes.iter().map(SpaceChange::space_id).collect();

    match load_aggregate(
        meta_space_id,
        candidate.values().map(|space| space.snapshot),
    ) {
        Err(refusals) => {
            if let Some(errors) = space_stage_errors(&refusals) {
                return CommitDecision::Answer(CommitResult::AggregateRefused(CommitRefusal {
                    refusals: refusals.into_vec(),
                    errors,
                }));
            }
            let mut incomplete: Vec<SpaceId> = Vec::new();
            for refusal in refusals.as_slice() {
                if let Refusal::SpaceReferenceMissing { space, target, .. } = refusal
                    && deleted.contains(target)
                    && !changed.contains(space)
                    && !incomplete.contains(target)
                {
                    incomplete.push(*target);
                }
            }
            if !incomplete.is_empty() {
                return CommitDecision::Answer(CommitResult::Conflict(
                    incomplete
                        .into_iter()
                        .map(|space_id| SpaceConflict {
                            space_id,
                            current: by_id.get(&space_id).map(|space| (*space).clone()),
                        })
                        .collect(),
                ));
            }
            let remaining: Vec<Refusal> = refusals
                .into_vec()
                .into_iter()
                .filter(|refusal| match refusal {
                    Refusal::OrdinarySpaceUnreferenced { space } => {
                        !baseline_unreferenced.contains(space)
                    }
                    _ => true,
                })
                .collect();
            if !remaining.is_empty() {
                return refused(remaining, &candidate);
            }
        }
        Ok(aggregate) => {
            let newly_unrooted: Vec<Refusal> = aggregate
                .refused_unrooted_space_ids(
                    baseline_held.iter().chain(&baseline_unreferenced).copied(),
                )
                .into_iter()
                .map(|space| Refusal::OrdinarySpaceUnreferenced { space })
                .collect();
            if !newly_unrooted.is_empty() {
                return refused(newly_unrooted, &candidate);
            }
        }
    }

    CommitDecision::Write {
        result: CommitResult::Committed {
            revisions: request
                .changes
                .iter()
                .filter(|change| !matches!(change, SpaceChange::Delete { .. }))
                .map(|change| (change.space_id(), committed_revision(change)))
                .collect(),
            deleted_space_ids: deleted.clone(),
        },
        written: candidate
            .into_iter()
            .filter(|(id, _)| changed.contains(id))
            .map(|(_, space)| space.to_loaded())
            .collect(),
        deleted,
    }
}

/// What a store does with a commit it has read one stored Space for
/// (`decideTopologyPreservingUpdate` in
/// `src/persistence/sql-space-repository.ts`).
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub(crate) enum SingleSpaceDecision {
    /// Answer the caller now; nothing is written.
    Answer(CommitResult),
    /// Store `written`, leaving every other stored Space as it is, then
    /// answer `result`.
    Write {
        /// What to answer once written.
        result: CommitResult,
        /// The updated Space, as it is stored once the commit lands.
        written: LoadedSpace,
    },
    /// Read every stored Space and decide by [`decide_commit`].
    Aggregate,
}

/// The Space a commit can be decided against alone: the one it updates, when
/// it is a single update.
pub(crate) fn single_update_space(request: &SpaceCommit) -> Option<SpaceId> {
    match request.changes.as_slice() {
        [SpaceChange::Update { space_id, .. }] => Some(*space_id),
        _ => None,
    }
}

/// The Maps of a document, and each Graph beside the Map that owns it, sorted
/// so two documents compare element by element: what another Space's Space
/// Resource can select in this one (`selectableStructure`).
fn selectable_structure(document: &SpaceDocument) -> Vec<(MapId, Option<GraphId>)> {
    let mut structure: Vec<(MapId, Option<GraphId>)> = document
        .maps
        .iter()
        .flatten()
        .flat_map(|map| {
            std::iter::once((map.id, None))
                .chain(map.graphs.iter().map(|graph| (map.id, Some(graph.id))))
        })
        .collect();
    structure.sort_unstable();
    structure
}

/// Whether `next` keeps every fact complete aggregate intake reads across
/// Spaces (`preservesSnapshotBoundary`): the same default Map, the same Maps
/// and the Graphs each owns, the same Resources by id and kind, and for each
/// the same Spaces referenced and the same selection in them. Everything else
/// in a Space is read by that Space's own intake alone.
fn preserves_snapshot_boundary(current: &SpaceSnapshot, next: &SpaceSnapshot) -> bool {
    if current.document.default_map != next.document.default_map
        || selectable_structure(&current.document) != selectable_structure(&next.document)
        || current.resources.len() != next.resources.len()
    {
        return false;
    }
    let by_id: HashMap<ResourceId, &Resource> = current
        .resources
        .iter()
        .map(|resource| (resource.id, resource))
        .collect();
    next.resources.iter().all(|resource| {
        by_id.get(&resource.id).is_some_and(|previous| {
            previous.kind == resource.kind
                && previous.space_references() == resource.space_references()
                && previous.selection() == resource.selection()
        })
    })
}

/// Decide a single update against the one stored Space it names, `current`,
/// without reading any other: a stale revision is answered as a conflict, and
/// an update whose snapshot passes its own intake and moves no snapshot
/// boundary is written, once the store holds a Meta identity. Everything else
/// is handed to [`decide_commit`], which alone can say where in the aggregate
/// a refusal sits.
///
/// It answers only what [`decide_commit`] answers over the whole stored
/// aggregate when the other stored Spaces can be read; when one cannot, the
/// update is still decided here, as the TypeScript repository decides it.
pub(crate) fn decide_single_space(
    request: &SpaceCommit,
    meta_space_id: Option<SpaceId>,
    current: Option<&LoadedSpace>,
) -> SingleSpaceDecision {
    let [
        change @ SpaceChange::Update {
            space_id,
            snapshot,
            expected_revision,
        },
    ] = request.changes.as_slice()
    else {
        return SingleSpaceDecision::Aggregate;
    };
    if request_refusal(request).is_some() {
        return SingleSpaceDecision::Aggregate;
    }
    let Some(current) = current.filter(|space| space.revision == *expected_revision) else {
        return SingleSpaceDecision::Answer(CommitResult::Conflict(vec![SpaceConflict {
            space_id: *space_id,
            current: current.cloned(),
        }]));
    };
    if let Some(CommitDecision::Answer(result)) = ceiling_refusal(request) {
        return SingleSpaceDecision::Answer(result);
    }
    if load_space(snapshot).is_err()
        || !preserves_snapshot_boundary(&current.snapshot, snapshot)
        || meta_space_id.is_none()
    {
        return SingleSpaceDecision::Aggregate;
    }
    let revision = committed_revision(change);
    SingleSpaceDecision::Write {
        result: CommitResult::Committed {
            revisions: vec![(*space_id, revision)],
            deleted_space_ids: vec![],
        },
        written: LoadedSpace {
            snapshot: snapshot.clone(),
            revision,
            exported_revision: current.exported_revision,
        },
    }
}

#[cfg(test)]
mod tests;
