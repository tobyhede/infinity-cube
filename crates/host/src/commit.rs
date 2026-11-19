//! What a commit means, decided once for every store
//! (`packages/persistence/src/commit-decision.ts`).
//!
//! [`decide_commit`] takes what a store has already read and answers what it
//! must do next, answer or write, before anything is written. It is pure: no
//! IO and no async. Each store keeps its own reads, writes and locking.

use std::collections::{BTreeMap, HashSet};

use intake::{Refusal, Refusals, SpaceId, SpaceSnapshot, load_aggregate};

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

fn rejected(message: String) -> CommitDecision {
    CommitDecision::Answer(CommitResult::Rejected { message })
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
/// Space twice, or one whose change and snapshot disagree about the Space.
fn request_refusal(request: &SpaceCommit) -> Option<CommitDecision> {
    if request.changes.is_empty() {
        return Some(rejected("A commit requires at least one change".to_owned()));
    }
    let mut ids = HashSet::new();
    for change in &request.changes {
        let id = change.space_id();
        if !ids.insert(id) {
            return Some(rejected(format!("Space {id} is named more than once")));
        }
        if let Some(snapshot) = change.snapshot()
            && snapshot.id != id
        {
            return Some(rejected(format!(
                "Change Space id {id} does not match its snapshot"
            )));
        }
    }
    None
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
        return refusal;
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

#[cfg(test)]
mod tests;
