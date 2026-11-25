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

    /// Import reads a Space directory only by a lower-case name, so a Space
    /// created under an upper-case id would be exported where no later run
    /// could read it, even with an owner that makes it a valid aggregate.
    #[test]
    fn rejects_a_space_named_in_upper_case() {
        const UPPER: &str = "ABCDEF00-0000-4000-8000-00000000000A";
        let created = plain(UPPER, "Upper");
        let create = SpaceChange::Create {
            space_id: created.id,
            snapshot: created,
        };
        let owner = update(meta_holding(UPPER, "space"), 3);
        let result = answer(decide_commit(
            &commit(vec![owner, create]),
            Some(id(META)),
            &[stored(plain(META, "Meta"), 3)],
        ));
        let CommitResult::Rejected { message } = result else {
            panic!("expected a rejection, got {result:?}");
        };
        assert_eq!(
            message,
            format!("Space {UPPER} must be named in lower case")
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

/// `decide_single_space` is a shortcut through `decide_commit` and never a
/// second set of rules: over a stored aggregate that can be read, it answers
/// as `decide_commit` answers, or hands the commit to it.
mod given_a_single_update_decided_against_its_own_space {
    use super::*;

    const UNKNOWN_RESOURCE: &str = "00000000-0000-4000-8000-0000000000ff";

    /// The child as `plain` writes it, with `from` replaced by `to` in its
    /// JSON text.
    fn child_with(from: &str, to: &str) -> SpaceSnapshot {
        let json = format!(
            r#"{{"id":"{CHILD}","document":{{"version":1,"title":"Child","maps":[{{"id":"00000000-0000-4000-8000-0000000002a1","title":"M","kind":"positioned","positions":{{}},"graphs":[{{"id":"00000000-0000-4000-8000-0000000002b1","title":"G","edges":[]}}]}}]}},"resources":[]}}"#
        );
        assert!(json.contains(from), "{from} is in the child");
        snapshot(&json.replace(from, to))
    }

    /// The Meta Space selecting `graph` of the child's Map.
    fn meta_selecting(graph: &str) -> SpaceSnapshot {
        snapshot(&format!(
            r#"{{"id":"{META}","document":{{"version":1,"title":"Meta"}},"resources":[{{"id":"00000000-0000-4000-8000-000000000201","document":{{"title":"Child","kind":"space","content":{{"spaceId":"{CHILD}","map":"00000000-0000-4000-8000-0000000002a1","graph":"{graph}"}}}}}}]}}"#
        ))
    }

    fn decided(change: SpaceChange, stored: &[LoadedSpace]) -> SingleSpaceDecision {
        let request = commit(vec![change]);
        let current = single_update_space(&request)
            .and_then(|space| stored.iter().find(|loaded| loaded.snapshot.id == space));
        decide_single_space(&request, Some(id(META)), current)
    }

    #[test]
    fn the_fixtures_build_the_stored_spaces() {
        assert_eq!(
            child_with("Child", "Child"),
            plain(CHILD, "Child"),
            "the child"
        );
        assert_eq!(
            meta_selecting("00000000-0000-4000-8000-0000000002b1"),
            meta_holding(CHILD, "space"),
            "the Meta Space"
        );
    }

    #[test]
    fn answers_a_stale_or_missing_space_as_decide_commit_does() {
        for change in [
            update(plain(CHILD, "Renamed"), 2),
            update(plain(OTHER, "Other"), 3),
        ] {
            let request = commit(vec![change.clone()]);
            assert_eq!(
                decided(change, &two_spaces()),
                SingleSpaceDecision::Answer(answer(decide_commit(
                    &request,
                    Some(id(META)),
                    &two_spaces()
                ))),
                "the conflict decide_commit answers"
            );
        }
    }

    #[test]
    fn writes_an_update_moving_no_boundary_as_decide_commit_does() {
        let mut stored = two_spaces();
        stored[1].exported_revision = Revision::new(2);
        let change = update(plain(CHILD, "Renamed"), 3);
        let CommitDecision::Write {
            result, written, ..
        } = decide_commit(&commit(vec![change.clone()]), Some(id(META)), &stored)
        else {
            panic!("decide_commit writes the rename");
        };
        assert_eq!(
            decided(change, &stored),
            SingleSpaceDecision::Write {
                result,
                written: written[0].clone(),
            },
            "the same answer and the same Space written"
        );
    }

    #[test]
    fn hands_on_an_update_moving_a_boundary_or_failing_its_own_intake() {
        let placed = format!(r#""positions":{{"{UNKNOWN_RESOURCE}":{{"x":0,"y":0}}}}"#);
        let added = format!(
            r#""resources":[{{"id":"{UNKNOWN_RESOURCE}","document":{{"title":"Note","kind":"ur","content":{{}}}}}}]"#
        );
        for (what, next) in [
            ("a Map id", child_with("0002a1", "0002a9")),
            ("a Graph id", child_with("0002b1", "0002b9")),
            (
                "the default Map",
                child_with(
                    r#""title":"Child","#,
                    r#""title":"Child","defaultMap":"00000000-0000-4000-8000-0000000002a1","#,
                ),
            ),
            (
                "a placement of a Resource it does not hold",
                child_with(r#""positions":{}"#, &placed),
            ),
            ("a Resource added", child_with(r#""resources":[]"#, &added)),
            ("a Resource's kind", meta_holding(CHILD, "unlisted")),
            (
                "a Space Resource's selection",
                meta_selecting("00000000-0000-4000-8000-0000000002b2"),
            ),
        ] {
            assert_eq!(
                decided(update(next, 3), &two_spaces()),
                SingleSpaceDecision::Aggregate,
                "{what}"
            );
        }
    }

    #[test]
    fn hands_on_any_other_change_set() {
        for request in [
            commit(vec![SpaceChange::Create {
                space_id: id(OTHER),
                snapshot: plain(OTHER, "Other"),
            }]),
            commit(vec![
                update(plain(CHILD, "Renamed"), 3),
                update(meta_holding(CHILD, "space"), 3),
            ]),
        ] {
            assert_eq!(single_update_space(&request), None, "no one Space");
            assert_eq!(
                decide_single_space(&request, Some(id(META)), Some(&two_spaces()[1])),
                SingleSpaceDecision::Aggregate,
                "{request:?}"
            );
        }
    }

    #[test]
    fn hands_on_a_write_to_a_store_with_no_meta_space() {
        let stored = two_spaces();
        assert_eq!(
            decide_single_space(
                &commit(vec![update(plain(CHILD, "Renamed"), 3)]),
                None,
                Some(&stored[1])
            ),
            SingleSpaceDecision::Aggregate,
            "decide_commit refuses it"
        );
    }
}

mod given_a_space_at_the_revision_ceiling {
    use super::*;

    const CEILING: u64 = Revision::CEILING;

    fn at(revision: u64) -> Vec<LoadedSpace> {
        let mut stored = two_spaces();
        stored[1].revision = Revision::new(revision).unwrap();
        stored
    }

    fn single(change: SpaceChange, stored: &[LoadedSpace]) -> SingleSpaceDecision {
        decide_single_space(&commit(vec![change]), Some(id(META)), Some(&stored[1]))
    }

    #[test]
    fn refuses_an_update_on_either_path_rather_than_holding_the_revision() {
        let refused = CommitResult::Rejected {
            message: format!("Space {CHILD} is at the highest revision a store keeps"),
        };
        let change = update(plain(CHILD, "Renamed"), CEILING);
        assert_eq!(
            answer(decide_commit(
                &commit(vec![change.clone()]),
                Some(id(META)),
                &at(CEILING)
            )),
            refused,
            "the complete decision"
        );
        assert_eq!(
            single(change, &at(CEILING)),
            SingleSpaceDecision::Answer(refused),
            "the single-Space decision"
        );
    }

    #[test]
    fn commits_the_update_that_reaches_it() {
        let change = update(plain(CHILD, "Renamed"), CEILING - 1);
        let reached = CommitResult::Committed {
            revisions: vec![(id(CHILD), Revision::new(CEILING).unwrap())],
            deleted_space_ids: vec![],
        };
        let CommitDecision::Write { result, .. } = decide_commit(
            &commit(vec![change.clone()]),
            Some(id(META)),
            &at(CEILING - 1),
        ) else {
            panic!("the complete decision writes it");
        };
        assert_eq!(result, reached, "the complete decision");
        let SingleSpaceDecision::Write { result, .. } = single(change, &at(CEILING - 1)) else {
            panic!("the single-Space decision writes it");
        };
        assert_eq!(result, reached, "the single-Space decision");
    }

    #[test]
    fn answers_a_stale_update_as_a_conflict_first() {
        let change = update(plain(CHILD, "Renamed"), CEILING);
        assert!(
            matches!(
                answer(decide_commit(&commit(vec![change]), Some(id(META)), &at(3))),
                CommitResult::Conflict(_)
            ),
            "expecting the ceiling when the store holds another revision"
        );
    }
}
