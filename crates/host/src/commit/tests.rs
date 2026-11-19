use intake::json::parse;
use intake::{Refusal, SpaceId, SpaceSnapshot, decode_space_snapshot};

use super::*;
use crate::repository::{AggregateRefusal, CommitResult, LoadedSpace, Revision, SpaceChange};

const META: &str = "10000000-0000-4000-8000-000000000001";
const CHILD: &str = "10000000-0000-4000-8000-000000000002";
const OTHER: &str = "10000000-0000-4000-8000-000000000003";

fn id(text: &str) -> SpaceId {
    SpaceId::parse(text).unwrap()
}

fn snapshot(json: &str) -> SpaceSnapshot {
    let value = parse(json).unwrap();
    let space = value
        .as_object()
        .unwrap()
        .get("id")
        .unwrap()
        .as_str()
        .unwrap();
    decode_space_snapshot(&value, id(space)).unwrap()
}

fn plain(space: &str, title: &str) -> SpaceSnapshot {
    snapshot(&format!(
        r#"{{"id":"{space}","document":{{"version":1,"title":"{title}","maps":[{{"id":"00000000-0000-4000-8000-000000{suffix}a1","title":"M","kind":"positioned","positions":{{}},"graphs":[{{"id":"00000000-0000-4000-8000-000000{suffix}b1","title":"G","edges":[]}}]}}]}},"resources":[]}}"#,
        suffix = &space[32..]
    ))
}

/// The Meta Space, holding one Space Resource that owns `target`.
fn meta_holding(target: &str, kind: &str) -> SpaceSnapshot {
    let suffix = &target[32..];
    snapshot(&format!(
        r#"{{"id":"{META}","document":{{"version":1,"title":"Meta"}},"resources":[{{"id":"00000000-0000-4000-8000-000000{suffix}01","document":{{"title":"Child","kind":"{kind}","content":{{"spaceId":"{target}","map":"00000000-0000-4000-8000-000000{suffix}a1","graph":"00000000-0000-4000-8000-000000{suffix}b1"}}}}}}]}}"#
    ))
}

fn stored(snapshot: SpaceSnapshot, revision: u64) -> LoadedSpace {
    LoadedSpace {
        snapshot,
        revision: Revision::new(revision).unwrap(),
        exported_revision: None,
    }
}

fn update(snapshot: SpaceSnapshot, expected: u64) -> SpaceChange {
    SpaceChange::Update {
        space_id: snapshot.id,
        snapshot,
        expected_revision: Revision::new(expected).unwrap(),
    }
}

fn commit(changes: Vec<SpaceChange>) -> SpaceCommit {
    SpaceCommit { changes }
}

fn answer(decision: CommitDecision) -> CommitResult {
    match decision {
        CommitDecision::Answer(result) => result,
        CommitDecision::Write { result, .. } => {
            panic!("expected an answer, got a write of {result:?}")
        }
    }
}

/// A Meta Space owning one child, both at revision 3.
fn two_spaces() -> Vec<LoadedSpace> {
    vec![
        stored(meta_holding(CHILD, "space"), 3),
        stored(plain(CHILD, "Child"), 3),
    ]
}

mod given_a_change_set_the_store_will_not_judge {
    use super::*;

    #[test]
    fn rejects_an_empty_one() {
        let result = answer(decide_commit(
            &commit(vec![]),
            Some(id(META)),
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::Rejected { .. }),
            "got {result:?}"
        );
    }

    #[test]
    fn rejects_one_naming_a_space_twice() {
        let change = update(plain(CHILD, "Twice"), 3);
        let result = answer(decide_commit(
            &commit(vec![change.clone(), change]),
            Some(id(META)),
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::Rejected { .. }),
            "got {result:?}"
        );
    }

    #[test]
    fn rejects_a_change_whose_snapshot_names_another_space() {
        let change = SpaceChange::Update {
            space_id: id(OTHER),
            snapshot: plain(CHILD, "Elsewhere"),
            expected_revision: Revision::FIRST,
        };
        let result = answer(decide_commit(
            &commit(vec![change]),
            Some(id(META)),
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::Rejected { .. }),
            "got {result:?}"
        );
    }
}

mod given_a_stale_change {
    use super::*;

    #[test]
    fn answers_a_conflict_carrying_what_is_stored() {
        let result = answer(decide_commit(
            &commit(vec![update(plain(CHILD, "Stale"), 2)]),
            Some(id(META)),
            &two_spaces(),
        ));
        let CommitResult::Conflict(conflicts) = result else {
            panic!("expected a conflict, got {result:?}");
        };
        assert_eq!(conflicts.len(), 1, "one conflict");
        assert_eq!(conflicts[0].space_id, id(CHILD), "the stale Space");
        assert_eq!(
            conflicts[0]
                .current
                .as_ref()
                .map(|space| space.revision.get()),
            Some(3),
            "what is stored now"
        );
    }

    #[test]
    fn answers_a_conflict_for_creating_a_stored_space() {
        let change = SpaceChange::Create {
            space_id: id(CHILD),
            snapshot: plain(CHILD, "Again"),
        };
        let result = answer(decide_commit(
            &commit(vec![change]),
            Some(id(META)),
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::Conflict(_)),
            "got {result:?}"
        );
    }

    #[test]
    fn answers_the_conflict_before_a_missing_meta_space() {
        let result = answer(decide_commit(
            &commit(vec![update(plain(CHILD, "Stale"), 9)]),
            None,
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::Conflict(_)),
            "got {result:?}"
        );
    }
}

mod given_a_store_with_no_meta_space {
    use super::*;

    #[test]
    fn rejects_a_commit() {
        let result = answer(decide_commit(
            &commit(vec![update(plain(CHILD, "Renamed"), 3)]),
            None,
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::Rejected { .. }),
            "got {result:?}"
        );
    }
}

mod given_a_change_that_lands {
    use super::*;

    #[test]
    fn writes_the_changed_space_alone_with_the_next_revision_keeping_its_exported_one() {
        let mut spaces = two_spaces();
        spaces[1].exported_revision = Revision::new(2);
        let decision = decide_commit(
            &commit(vec![update(plain(CHILD, "Renamed"), 3)]),
            Some(id(META)),
            &spaces,
        );
        let CommitDecision::Write {
            result,
            written,
            deleted,
        } = decision
        else {
            panic!("expected a write, got {decision:?}");
        };
        assert_eq!(
            result,
            CommitResult::Committed {
                revisions: vec![(id(CHILD), Revision::new(4).unwrap())],
                deleted_space_ids: vec![],
            },
            "the next revision"
        );
        assert_eq!(
            written
                .iter()
                .map(|space| space.snapshot.id)
                .collect::<Vec<_>>(),
            vec![id(CHILD)],
            "only the changed Space is written; the Meta Space stays as stored"
        );
        assert_eq!(
            written[0].snapshot.document.title, "Renamed",
            "the change applied"
        );
        assert_eq!(
            written[0].revision,
            Revision::new(4).unwrap(),
            "next revision"
        );
        assert_eq!(
            written[0].exported_revision,
            Revision::new(2),
            "exported revision kept"
        );
        assert!(deleted.is_empty(), "nothing deleted");
    }

    #[test]
    fn writes_the_referrer_and_names_the_space_it_deletes() {
        let delete = SpaceChange::Delete {
            space_id: id(CHILD),
            expected_revision: Revision::new(3).unwrap(),
        };
        let decision = decide_commit(
            &commit(vec![delete, update(plain(META, "Meta"), 3)]),
            Some(id(META)),
            &two_spaces(),
        );
        let CommitDecision::Write {
            result,
            written,
            deleted,
        } = decision
        else {
            panic!("expected a write, got {decision:?}");
        };
        assert_eq!(
            result,
            CommitResult::Committed {
                revisions: vec![(id(META), Revision::new(4).unwrap())],
                deleted_space_ids: vec![id(CHILD)],
            },
            "the Meta Space's next revision and the deletion"
        );
        assert_eq!(
            written
                .iter()
                .map(|space| space.snapshot.id)
                .collect::<Vec<_>>(),
            vec![id(META)],
            "the deleted Space is not written"
        );
        assert_eq!(deleted, vec![id(CHILD)], "the deleted Space");
    }
}

mod given_a_candidate_aggregate_intake_refuses {
    use super::*;

    /// ADR 0159: the candidate is judged ascending by Space id, a created
    /// Space among the stored ones, so a created Space whose id sorts first
    /// is the first to hold a Resource id, and the stored Space holding it
    /// too is the one refused.
    #[test]
    fn judges_a_created_space_whose_id_sorts_first_before_the_stored_ones() {
        const EARLY: &str = "0f000000-0000-4000-8000-000000000004";
        const SHARED: &str = "00000000-0000-4000-8000-000000000201";
        let created = snapshot(&format!(
            r#"{{"id":"{EARLY}","document":{{"version":1,"title":"Early"}},"resources":[{{"id":"{SHARED}","document":{{"title":"Shared","kind":"ur","content":{{}}}}}}]}}"#
        ));
        let stored = two_spaces();
        assert!(
            stored[0]
                .snapshot
                .resources
                .iter()
                .any(|resource| resource.id.as_str() == SHARED),
            "the stored Meta Space holds the shared Resource id"
        );
        let result = answer(decide_commit(
            &commit(vec![SpaceChange::Create {
                space_id: id(EARLY),
                snapshot: created,
            }]),
            Some(id(META)),
            &stored,
        ));
        let CommitResult::AggregateRefused(refusal) = result else {
            panic!("expected a refusal, got {result:?}");
        };
        let shared = intake::ResourceId::parse(SHARED).unwrap();
        assert_eq!(
            refusal.refusals,
            vec![Refusal::DuplicateResourceId {
                space: id(META),
                resource: shared,
            }],
            "the stored Meta Space, after the created one by id, holds the repeat"
        );
        assert_eq!(
            refusal.errors,
            vec![AggregateRefusal::DuplicateResourceId {
                resource_id: shared,
                space_ids: vec![id(EARLY), id(META)],
            }],
            "each Space holding it, ascending by id"
        );
    }

    #[test]
    fn refuses_a_created_space_nothing_references() {
        let change = SpaceChange::Create {
            space_id: id(OTHER),
            snapshot: plain(OTHER, "Unreferenced"),
        };
        let result = answer(decide_commit(
            &commit(vec![change]),
            Some(id(META)),
            &two_spaces(),
        ));
        let CommitResult::AggregateRefused(refusal) = result else {
            panic!("expected a refusal, got {result:?}");
        };
        assert_eq!(
            refusal.refusals,
            vec![Refusal::OrdinarySpaceUnreferenced { space: id(OTHER) }],
            "the unreferenced Space"
        );
        assert_eq!(
            refusal.errors,
            vec![AggregateRefusal::Aggregate(
                Refusal::OrdinarySpaceUnreferenced { space: id(OTHER) }
            )],
            "as the wire carries it"
        );
    }

    #[test]
    fn groups_a_space_s_own_refusals_at_its_position() {
        let broken = snapshot(&format!(
            r#"{{"id":"{CHILD}","document":{{"version":1,"title":"Child","defaultMap":"00000000-0000-4000-8000-000000000999"}},"resources":[]}}"#
        ));
        let result = answer(decide_commit(
            &commit(vec![update(broken, 3)]),
            Some(id(META)),
            &two_spaces(),
        ));
        let CommitResult::AggregateRefused(refusal) = result else {
            panic!("expected a refusal, got {result:?}");
        };
        assert!(
            matches!(
                refusal.errors.as_slice(),
                [AggregateRefusal::InvalidSpaceSnapshot { snapshot_index: 1, errors }] if !errors.is_empty()
            ),
            "the child is second by id: {:?}",
            refusal.errors
        );
    }

    #[test]
    fn answers_a_conflict_for_deleting_a_space_another_still_references() {
        let delete = SpaceChange::Delete {
            space_id: id(CHILD),
            expected_revision: Revision::new(3).unwrap(),
        };
        let result = answer(decide_commit(
            &commit(vec![delete]),
            Some(id(META)),
            &two_spaces(),
        ));
        let CommitResult::Conflict(conflicts) = result else {
            panic!("expected a conflict, got {result:?}");
        };
        assert_eq!(
            conflicts[0].space_id,
            id(CHILD),
            "the deletion is incomplete"
        );
    }

    #[test]
    fn refuses_a_deletion_whose_referrer_the_caller_kept_in_its_own_change_set() {
        let delete = SpaceChange::Delete {
            space_id: id(CHILD),
            expected_revision: Revision::new(3).unwrap(),
        };
        let renamed = update(meta_holding(CHILD, "space"), 3);
        let result = answer(decide_commit(
            &commit(vec![delete, renamed]),
            Some(id(META)),
            &two_spaces(),
        ));
        assert!(
            matches!(result, CommitResult::AggregateRefused(_)),
            "its own proposal is refused, not a conflict: {result:?}"
        );
    }
}

mod given_a_resource_of_a_missing_kind {
    use super::*;

    /// A Meta Space whose only Resource is of a kind no plugin draws, beside
    /// a child nothing a listed plugin reads references.
    fn held() -> Vec<LoadedSpace> {
        vec![
            stored(meta_holding(CHILD, "elsewhere"), 0),
            stored(plain(CHILD, "Held"), 0),
        ]
    }

    #[test]
    fn keeps_holding_the_unreferenced_space_the_store_already_held() {
        let decision = decide_commit(
            &commit(vec![update(plain(CHILD, "Still held"), 0)]),
            Some(id(META)),
            &held(),
        );
        assert!(
            matches!(decision, CommitDecision::Write { .. }),
            "an edit to a held Space lands: {decision:?}"
        );
    }

    #[test]
    fn refuses_a_space_the_commit_leaves_unrooted() {
        let change = SpaceChange::Create {
            space_id: id(OTHER),
            snapshot: plain(OTHER, "New"),
        };
        let result = answer(decide_commit(
            &commit(vec![change]),
            Some(id(META)),
            &held(),
        ));
        let CommitResult::AggregateRefused(refusal) = result else {
            panic!("expected a refusal, got {result:?}");
        };
        assert_eq!(
            refusal.refusals,
            vec![Refusal::OrdinarySpaceUnreferenced { space: id(OTHER) }],
            "only the Space this commit leaves unrooted"
        );
    }
}

mod given_a_commit_removing_the_last_resource_of_a_missing_kind {
    use super::*;

    #[test]
    fn refuses_the_space_the_store_held_only_because_of_it() {
        let stored = vec![
            stored(meta_holding(CHILD, "elsewhere"), 0),
            stored(plain(CHILD, "Held"), 0),
        ];
        let emptied = snapshot(&format!(
            r#"{{"id":"{META}","document":{{"version":1,"title":"Meta"}},"resources":[]}}"#
        ));
        let result = answer(decide_commit(
            &commit(vec![update(emptied, 0)]),
            Some(id(META)),
            &stored,
        ));
        let CommitResult::AggregateRefused(refusal) = result else {
            panic!("expected a refusal, got {result:?}");
        };
        assert_eq!(
            refusal.refusals,
            vec![Refusal::OrdinarySpaceUnreferenced { space: id(CHILD) }],
            "a held Space is forgiven only while a missing kind holds it"
        );
    }
}
