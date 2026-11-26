//! The contract's commit cases: what a commit answers, what it stores, and
//! which Resource rows it writes (rust-sqlite-test-coverage 04).

use host::{
    AggregateInput, AggregateLoad, AggregateRefusal, CommitResult, InitializeResult,
    LoadedAggregate, SpaceConflict, SpaceRepository, SpaceSummary,
};
use serde_json::Value;

use super::*;

/// A create of `snapshot`'s Space.
fn create(snapshot: &SpaceSnapshot) -> SpaceChange {
    SpaceChange::Create {
        space_id: snapshot.id,
        snapshot: snapshot.clone(),
    }
}

/// A delete of `space` at `expected`.
fn delete(space: &str, expected: u64) -> SpaceChange {
    SpaceChange::Delete {
        space_id: id(space),
        expected_revision: revision(expected),
    }
}

/// What `load_space` answers for `space`.
async fn load<R: SpaceRepository>(store: &R, space: &str) -> Option<LoadedSpace> {
    store.load_space(id(space)).await.unwrap()
}

/// Commit `changes`.
async fn commit_changes<R: SpaceRepository>(store: &R, changes: Vec<SpaceChange>) -> CommitResult {
    store.commit(commit(changes)).await.unwrap()
}

fn is_committed(result: &CommitResult) -> bool {
    matches!(result, CommitResult::Committed { .. })
}

fn is_rejected(result: &CommitResult) -> bool {
    matches!(result, CommitResult::Rejected { .. })
}

fn is_refused(result: &CommitResult) -> bool {
    matches!(result, CommitResult::AggregateRefused(_))
}

/// A Space complete enough to be pointed at, holding `resources` exactly.
fn target_holding(space_id: &str, title: &str, resources: Vec<Value>) -> SpaceSnapshot {
    snapshot(
        space_id,
        &space_json(space_id, target_document(title), resources),
    )
}

/// The Meta Space holding a Resource and a Space Resource, `link`, showing
/// `OTHER_SPACE_ID`.
fn linked_meta(link: &str) -> SpaceSnapshot {
    space_holding(
        SPACE_ID,
        "Meta",
        vec![
            resource(RESOURCE_ID, "Meta resource"),
            space_resource(link, OTHER_SPACE_ID),
        ],
    )
}

/// The Space `OTHER_SPACE_ID` a linked Meta Space points at.
fn target() -> SpaceSnapshot {
    target_space(OTHER_SPACE_ID, "Target", &[OTHER_RESOURCE_ID])
}

fn conflict(space: &str, current: Option<LoadedSpace>) -> SpaceConflict {
    SpaceConflict {
        space_id: id(space),
        current,
    }
}

// Case: stores an initialized Space, then lists, loads and commits it
pub async fn stores_an_initialized_space_then_lists_loads_and_commits_it<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    assert_eq!(
        store
            .initialize_aggregate(AggregateInput {
                meta_space_id: id(SPACE_ID),
                spaces: vec![first.clone()],
            })
            .await,
        Ok(InitializeResult::Initialized(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&first, 0, None)],
        }))
    );
    assert_eq!(
        store.list_spaces().await,
        Ok(vec![SpaceSummary {
            id: id(SPACE_ID),
            title: "One".to_owned(),
        }])
    );
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&first, 0, None)));
    assert_eq!(load(store, MISSING_SPACE_ID).await, None);

    let changed = retitled(&first, "Changed");
    assert_eq!(
        commit_update(store, &changed, 0).await,
        committed(&[(SPACE_ID, 1)], &[])
    );
    let store = reopened(harness).await;
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&changed, 1, None)));
    Ok(())
}

// Case: keeps every Resource through a topology-preserving commit's own delete
pub async fn keeps_every_resource_through_a_topology_preserving_commits_own_delete<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(
        SPACE_ID,
        "Three resources",
        &[RESOURCE_ID, SECOND_RESOURCE_ID, OTHER_RESOURCE_ID],
    );
    seed(store, &[&first]).await;
    let changed = retitled(&first, "Renamed, same Resources");
    assert_eq!(
        commit_update(store, &changed, 0).await,
        committed(&[(SPACE_ID, 1)], &[])
    );
    let store = reopened(harness).await;
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&changed, 1, None)));
    Ok(())
}

// Case: refuses to create a new unreachable Space by removing its last reference alone
pub async fn refuses_to_create_an_unreachable_space_by_removing_its_last_reference<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let target = target();
    let linked = linked_meta(SECOND_RESOURCE_ID);
    seed(store, &[&linked, &target]).await;

    let unlinked = space_holding(
        SPACE_ID,
        "Meta",
        vec![resource(RESOURCE_ID, "Meta resource")],
    );
    let result = commit_update(store, &unlinked, 0).await;
    let store = reopened(harness).await;
    assert_eq!(refused_kinds(&result), ["ordinary-space-unreferenced"]);
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&linked, 0, None)));
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&target, 0, None))
    );
    Ok(())
}

// Case: atomically creates, links, reads, converges on, and deletes a Space
pub async fn atomically_creates_links_reads_converges_on_and_deletes_a_space<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    let child = target_space(OTHER_SPACE_ID, "Child", &[OTHER_RESOURCE_ID]);
    let meta_resource = resource(RESOURCE_ID, "Meta resource");
    let linked = space_holding(
        SPACE_ID,
        "Meta",
        vec![
            meta_resource.clone(),
            space_resource(SECOND_RESOURCE_ID, OTHER_SPACE_ID),
            space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID),
        ],
    );

    assert_eq!(
        commit_changes(store, vec![update(&linked, 0), create(&child)]).await,
        committed(&[(SPACE_ID, 1), (OTHER_SPACE_ID, 0)], &[])
    );
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&linked, 1, None), stored(&child, 0, None)],
        }))
    );

    assert_eq!(
        commit_changes(store, vec![delete(OTHER_SPACE_ID, 0)]).await,
        CommitResult::Conflict(vec![conflict(
            OTHER_SPACE_ID,
            Some(stored(&child, 0, None))
        )]),
        "a delete leaving the Space referenced conflicts"
    );

    // A reference the caller itself submits is not authoritative state, so an
    // incomplete deletion it can see in its own change set is refused.
    let half_unlinked = space_holding(
        SPACE_ID,
        "Meta",
        vec![
            meta_resource,
            space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID),
        ],
    );
    let result = commit_changes(
        store,
        vec![update(&half_unlinked, 1), delete(OTHER_SPACE_ID, 0)],
    )
    .await;
    let store = reopened(harness).await;
    assert!(is_refused(&result), "{result:?}");
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&child, 0, None))
    );

    assert_eq!(
        commit_changes(store, vec![update(&meta, 1), delete(OTHER_SPACE_ID, 0)]).await,
        committed(&[(SPACE_ID, 2)], &[OTHER_SPACE_ID])
    );
    assert_eq!(load(store, OTHER_SPACE_ID).await, None);
    Ok(())
}

// Case: refuses an authored commit that deletes the Meta Space
pub async fn refuses_an_authored_commit_deleting_the_meta_space<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    let result = commit_changes(store, vec![delete(SPACE_ID, 0)]).await;
    let store = reopened(harness).await;
    assert_eq!(refused_kinds(&result), ["meta-space-missing"]);
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&meta, 0, None)],
        }))
    );
    Ok(())
}

// Case: reports every conflict and rolls back every refused aggregate
pub async fn reports_every_conflict_and_rolls_back_every_refused_aggregate<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    let orphan = space(OTHER_SPACE_ID, "Orphan", &[OTHER_RESOURCE_ID]);

    let result = commit_changes(store, vec![create(&orphan)]).await;
    let store = reopened(harness).await;
    assert!(is_refused(&result), "{result:?}");
    assert_eq!(load(store, OTHER_SPACE_ID).await, None);

    assert_eq!(
        commit_changes(
            store,
            vec![
                create(&meta),
                update(&space(MISSING_SPACE_ID, "Missing", &[]), 0),
            ]
        )
        .await,
        CommitResult::Conflict(vec![
            conflict(SPACE_ID, Some(stored(&meta, 0, None))),
            conflict(MISSING_SPACE_ID, None),
        ])
    );
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&meta, 0, None)));
    Ok(())
}

// Case: answers a stale expected revision with the current aggregate
pub async fn answers_a_stale_expected_revision_with_the_current_space<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store, &[&first]).await;
    let committed_space = retitled(&first, "Committed");
    commit_update(store, &committed_space, 0).await;

    assert_eq!(
        commit_update(store, &retitled(&first, "Stale"), 0).await,
        CommitResult::Conflict(vec![conflict(
            SPACE_ID,
            Some(stored(&committed_space, 1, None))
        )])
    );
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&committed_space, 1, None))
    );
    Ok(())
}

// Case: refuses a commit that fails domain intake and stores nothing
pub async fn refuses_a_commit_failing_domain_intake_storing_nothing<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store, &[&first]).await;
    let dangling = space_with_dangling_edge(SPACE_ID, "One", RESOURCE_ID);
    let result = commit_update(store, &dangling, 0).await;
    let store = reopened(harness).await;
    assert!(is_refused(&result), "{result:?}");
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&first, 0, None)));
    Ok(())
}

// Case: refuses a commit for a Space it does not store
pub async fn refuses_a_commit_for_a_space_it_does_not_store<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let absent = space(MISSING_SPACE_ID, "Absent", &[]);
    assert_eq!(
        commit_update(store, &absent, 0).await,
        CommitResult::Conflict(vec![conflict(MISSING_SPACE_ID, None)])
    );
    let store = reopened(harness).await;
    assert_eq!(load(store, MISSING_SPACE_ID).await, None);
    Ok(())
}

// Case: refuses a commit whose Space id differs from its snapshot id
pub async fn refuses_a_commit_whose_space_id_differs_from_its_snapshot_id<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store, &[&first]).await;
    let result = commit_changes(
        store,
        vec![SpaceChange::Update {
            space_id: id(OTHER_SPACE_ID),
            snapshot: first.clone(),
            expected_revision: revision(0),
        }],
    )
    .await;
    let store = reopened(harness).await;
    assert!(is_rejected(&result), "{result:?}");
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&first, 0, None)));
    Ok(())
}

// Case: refuses an update whose snapshot names another stored Space at a matching revision
pub async fn refuses_an_update_naming_another_stored_space_at_a_matching_revision<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let target = target();
    let linked = linked_meta(SECOND_RESOURCE_ID);
    seed(store, &[&linked, &target]).await;

    // Both Spaces stand at revision 0, so a path that checked the revision of
    // the Space `space_id` names and wrote the one the snapshot names would
    // overwrite the target.
    let result = commit_changes(
        store,
        vec![SpaceChange::Update {
            space_id: id(SPACE_ID),
            snapshot: retitled(&target, "Overwritten"),
            expected_revision: revision(0),
        }],
    )
    .await;
    let store = reopened(harness).await;
    assert!(is_rejected(&result), "{result:?}");
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&linked, 0, None)));
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&target, 0, None))
    );
    Ok(())
}

// Case: places a single update's failed intake at its Space's position in the aggregate
pub async fn places_a_single_updates_failed_intake_at_its_position<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let target = target();
    let linked = linked_meta(SECOND_RESOURCE_ID);
    seed(store, &[&linked, &target]).await;
    let dangling = space_with_dangling_edge(OTHER_SPACE_ID, "Target", OTHER_RESOURCE_ID);

    // The refusals the complete-aggregate decision gives: the Target is the
    // second stored Space by id, so it is refused at index 1 rather than at
    // the 0 a decision over that Space alone would name.
    let complete = intake::load_aggregate(id(SPACE_ID), [&linked, &dangling])
        .expect_err("the dangling Target fails complete intake");

    match commit_update(store, &dangling, 0).await {
        CommitResult::AggregateRefused(refusal) => {
            assert_eq!(refusal.refusals.as_slice(), complete.as_slice());
            assert!(
                matches!(
                    refusal.errors.as_slice(),
                    [AggregateRefusal::InvalidSpaceSnapshot {
                        snapshot_index: 1,
                        ..
                    }]
                ),
                "{:?}",
                refusal.errors
            );
        }
        other => panic!("an aggregate refusal, not {other:?}"),
    }
    let store = reopened(harness).await;
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&target, 0, None))
    );
    Ok(())
}

// Case: refuses a commit that names one Space more than once
pub async fn refuses_a_commit_naming_one_space_more_than_once<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store, &[&first]).await;
    let result = commit_changes(
        store,
        vec![
            update(&retitled(&first, "First update"), 0),
            update(&retitled(&first, "Second update"), 0),
        ],
    )
    .await;
    let store = reopened(harness).await;
    assert!(is_rejected(&result), "{result:?}");
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&first, 0, None)));
    Ok(())
}

// Case: refuses a commit claiming a Resource another Space owns
pub async fn refuses_a_commit_claiming_a_resource_another_space_owns<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let linked = space_holding(
        SPACE_ID,
        "One",
        vec![
            resource(RESOURCE_ID, "One resource"),
            space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID),
        ],
    );
    let other = target_space(OTHER_SPACE_ID, "Other", &[OTHER_RESOURCE_ID]);
    seed(store, &[&linked, &other]).await;
    let claiming = target_holding(
        OTHER_SPACE_ID,
        "Must roll back",
        vec![
            resource(OTHER_RESOURCE_ID, "Other resource"),
            resource(RESOURCE_ID, "Claimed"),
        ],
    );
    let result = commit_update(store, &claiming, 0).await;
    let store = reopened(harness).await;
    assert!(is_refused(&result), "{result:?}");
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&linked, 0, None)));
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&other, 0, None))
    );
    Ok(())
}

// Case: scopes Graph identities to their containing Space
pub async fn scopes_graph_identities_to_their_space<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let child = snapshot(
        OTHER_SPACE_ID,
        &graphed_value(
            OTHER_SPACE_ID,
            "Child",
            [SECOND_RESOURCE_ID, OTHER_RESOURCE_ID],
            MAP_ID,
            GRAPH_ID,
            "Child graph",
        ),
    );
    let mut meta_value = graphed_value(
        SPACE_ID,
        "Meta",
        [RESOURCE_ID, MISSING_RESOURCE_ID],
        MAP_ID,
        GRAPH_ID,
        "Meta graph",
    );
    meta_value["resources"] = Value::Array(vec![
        resource(RESOURCE_ID, "From"),
        space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID),
        resource(MISSING_RESOURCE_ID, "To"),
    ]);
    let meta = snapshot(SPACE_ID, &meta_value);

    seed(store, &[&meta, &child]).await;
    let store = reopened(harness).await;
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&meta, 0, None)));
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&child, 0, None))
    );
    Ok(())
}

// Case: refuses an unreferenced ordinary Space even when its Graph identity is reused
pub async fn refuses_an_unreferenced_space_even_reusing_a_graph_identity<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = graphed_space(SPACE_ID, "Meta", [RESOURCE_ID, MISSING_RESOURCE_ID]);
    let child = graphed_space(
        OTHER_SPACE_ID,
        "Child",
        [OTHER_RESOURCE_ID, SECOND_RESOURCE_ID],
    );
    let result = store
        .initialize_aggregate(AggregateInput {
            meta_space_id: id(SPACE_ID),
            spaces: vec![meta, child],
        })
        .await
        .unwrap();
    match &result {
        InitializeResult::AggregateRefused(refusals) => assert_eq!(
            refusals
                .as_slice()
                .iter()
                .map(|refusal| refusal.kind().as_str())
                .collect::<Vec<_>>(),
            ["ordinary-space-unreferenced"]
        ),
        other => panic!("an aggregate refusal, not {other:?}"),
    }
    let store = reopened(harness).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Uninitialized)
    );
    Ok(())
}

// Case: permits a Graph and Resource to share an identity
pub async fn permits_a_graph_and_a_resource_to_share_an_identity<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let shared = snapshot(
        SPACE_ID,
        &graphed_value(
            SPACE_ID,
            "Shared identity",
            [RESOURCE_ID, SECOND_RESOURCE_ID],
            MAP_ID,
            RESOURCE_ID,
            "Graph",
        ),
    );
    seed(store, &[&shared]).await;
    let store = reopened(harness).await;
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&shared, 0, None)));
    Ok(())
}

// Case: refuses two Maps in one Space that own the same Graph identity
pub async fn refuses_two_maps_owning_one_graph_identity<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let mut value = graphed_value(
        SPACE_ID,
        "Duplicate graph",
        [RESOURCE_ID, SECOND_RESOURCE_ID],
        MAP_ID,
        GRAPH_ID,
        "Graph",
    );
    let mut second = value["document"]["maps"][0].clone();
    second["id"] = Value::from(SECOND_MAP_ID);
    second["title"] = Value::from("Second owner");
    second["activeGraph"] = Value::from(GRAPH_ID);
    value["document"]["maps"]
        .as_array_mut()
        .unwrap()
        .push(second);
    let colliding = snapshot(SPACE_ID, &value);

    let result = store
        .initialize_aggregate(AggregateInput {
            meta_space_id: id(SPACE_ID),
            spaces: vec![colliding],
        })
        .await
        .unwrap();
    match &result {
        InitializeResult::AggregateRefused(refusals) => {
            // Every refusal is the Space's own, at its position 0.
            let stage = refusals.space_stage().expect("the Space stage refuses");
            assert!(
                matches!(stage.as_slice(), [(0, errors)] if !errors.is_empty()),
                "{stage:?}"
            );
        }
        other => panic!("an aggregate refusal, not {other:?}"),
    }
    let store = reopened(harness).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Uninitialized)
    );
    Ok(())
}

// Case: keeps the Resources a commit names and drops the ones it omits
pub async fn keeps_the_resources_a_commit_names_and_drops_the_rest<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID, SECOND_RESOURCE_ID]);
    seed(store, &[&first]).await;
    let narrowed = space_holding(SPACE_ID, "One", vec![resource(RESOURCE_ID, "Kept")]);
    let result = commit_update(store, &narrowed, 0).await;
    let store = reopened(harness).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&narrowed, 1, None))
    );
    Ok(())
}

// Case: drops every Resource when a commit omits them all
pub async fn drops_every_resource_when_a_commit_omits_them_all<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID, SECOND_RESOURCE_ID]);
    seed(store, &[&first]).await;
    let empty = space_holding(SPACE_ID, "One", vec![]);
    let result = commit_update(store, &empty, 0).await;
    let store = reopened(harness).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&empty, 1, None)));
    Ok(())
}

// Case: returns a Space's Resources in ascending id order however they were supplied
pub async fn answers_resources_in_ascending_id_order_however_supplied<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let descending = space(
        SPACE_ID,
        "Unordered",
        &[OTHER_RESOURCE_ID, SECOND_RESOURCE_ID, RESOURCE_ID],
    );
    let ascending = space(
        SPACE_ID,
        "Unordered",
        &[RESOURCE_ID, SECOND_RESOURCE_ID, OTHER_RESOURCE_ID],
    );
    assert_eq!(
        store
            .initialize_aggregate(AggregateInput {
                meta_space_id: id(SPACE_ID),
                spaces: vec![descending.clone()],
            })
            .await,
        Ok(InitializeResult::Initialized(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&ascending, 0, None)],
        }))
    );
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&ascending, 0, None))
    );

    let result = commit_update(store, &descending, 0).await;
    let store = reopened(harness).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&ascending, 1, None))
    );
    Ok(())
}

// Case: records an exported revision and carries it across later commits
pub async fn records_an_exported_revision_and_carries_it_across_commits<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store, &[&first]).await;
    store
        .mark_exported(id(SPACE_ID), revision(0))
        .await
        .unwrap();
    let changed = retitled(&first, "Edited after export");
    let result = commit_update(store, &changed, 0).await;
    let store = reopened(harness).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&changed, 1, Some(0)))
    );
    Ok(())
}

// Case: refuses to mark an exported revision above the storage ceiling
pub async fn refuses_to_mark_an_exported_revision_above_the_ceiling<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store, &[&first]).await;
    // `mark_exported` takes a `Revision`, and no `Revision` stands above the
    // ceiling: the refusal is the type's, before the store is reached.
    assert_eq!(host::Revision::new(CEILING + 1), None);
    store
        .mark_exported(id(SPACE_ID), revision(CEILING))
        .await
        .unwrap();
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&first, 0, Some(CEILING))),
        "the ceiling itself is a revision a store records"
    );
    Ok(())
}

// Case: stores and commits a revision above Number.MAX_SAFE_INTEGER as canonical decimal text
pub async fn stores_and_commits_a_revision_above_the_largest_safe_integer<H: Harness>(
    harness: &mut H,
) -> Ran {
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&first]).await;
    let above_safe: u64 = (1 << 53) + 1;
    harness
        .write_raw_revision(id(SPACE_ID), &above_safe.to_string(), None)
        .await?;
    let store = harness.store().as_ref();
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&first, above_safe, None))
    );

    let changed = retitled(&first, "Above safe");
    assert_eq!(
        commit_update(store, &changed, above_safe).await,
        committed(&[(SPACE_ID, above_safe + 1)], &[])
    );
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&changed, above_safe + 1, None))
    );
    Ok(())
}

// Case: writes only the Resource a topology-preserving commit changed
pub async fn writes_only_the_resource_a_topology_preserving_commit_changed<H: Harness>(
    harness: &mut H,
) -> Ran {
    harness.take_resource_writes().await?;
    let first = space(
        SPACE_ID,
        "Three resources",
        &[RESOURCE_ID, SECOND_RESOURCE_ID, OTHER_RESOURCE_ID],
    );
    seed(harness.store().as_ref(), &[&first]).await;
    assert_eq!(
        harness.take_resource_writes().await?,
        [RESOURCE_ID, SECOND_RESOURCE_ID, OTHER_RESOURCE_ID]
    );

    let renamed = space_holding(
        SPACE_ID,
        "Three resources",
        vec![
            resource(RESOURCE_ID, "Three resources resource"),
            resource(SECOND_RESOURCE_ID, "Renamed"),
            resource(OTHER_RESOURCE_ID, "Three resources resource"),
        ],
    );
    let result = commit_update(harness.store().as_ref(), &renamed, 0).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(harness.take_resource_writes().await?, [SECOND_RESOURCE_ID]);
    assert_eq!(
        load(harness.store().as_ref(), SPACE_ID).await,
        Some(stored(&renamed, 1, None))
    );

    // The document alone changes: the Space's title, and no Resource.
    let retitled_space = retitled(&renamed, "Retitled");
    let result = commit_update(harness.store().as_ref(), &retitled_space, 1).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(harness.take_resource_writes().await?, Vec::<String>::new());
    assert_eq!(
        load(harness.store().as_ref(), SPACE_ID).await,
        Some(stored(&retitled_space, 2, None))
    );
    Ok(())
}

// Case: writes only the new and changed Resources on the complete-aggregate path
pub async fn writes_only_the_new_and_changed_resources_on_the_aggregate_path<H: Harness>(
    harness: &mut H,
) -> Ran {
    harness.take_resource_writes().await?;
    let first_value = graphed_value(
        SPACE_ID,
        "Graphed",
        [RESOURCE_ID, SECOND_RESOURCE_ID],
        MAP_ID,
        GRAPH_ID,
        "Graph",
    );
    let first = snapshot(SPACE_ID, &first_value);
    seed(harness.store().as_ref(), &[&first]).await;
    harness.take_resource_writes().await?;

    let mut grown_value = first_value;
    let positions = &mut grown_value["document"]["maps"][0]["positions"];
    positions[RESOURCE_ID] = serde_json::json!({ "x": 40, "y": 40 });
    positions[OTHER_RESOURCE_ID] = serde_json::json!({ "x": 600, "y": 0 });
    grown_value["resources"] = Value::Array(vec![
        resource(RESOURCE_ID, "From"),
        resource(SECOND_RESOURCE_ID, "To, renamed"),
        resource(OTHER_RESOURCE_ID, "Added"),
    ]);
    let grown = snapshot(SPACE_ID, &grown_value);
    let result = commit_update(harness.store().as_ref(), &grown, 0).await;
    assert!(is_committed(&result), "{result:?}");
    assert_eq!(
        harness.take_resource_writes().await?,
        [SECOND_RESOURCE_ID, OTHER_RESOURCE_ID]
    );
    assert_eq!(
        load(harness.store().as_ref(), SPACE_ID).await,
        Some(stored(&grown, 1, None))
    );
    Ok(())
}

// Case: writes no Resource for a commit at a stale revision
pub async fn writes_no_resource_for_a_commit_at_a_stale_revision<H: Harness>(
    harness: &mut H,
) -> Ran {
    harness.take_resource_writes().await?;
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&first]).await;
    let committed_space = retitled(&first, "Committed");
    commit_update(harness.store().as_ref(), &committed_space, 0).await;
    harness.take_resource_writes().await?;

    let stale = space_holding(SPACE_ID, "One", vec![resource(RESOURCE_ID, "Stale")]);
    let result = commit_update(harness.store().as_ref(), &stale, 0).await;
    assert!(matches!(result, CommitResult::Conflict(_)), "{result:?}");
    assert_eq!(harness.take_resource_writes().await?, Vec::<String>::new());
    assert_eq!(
        load(harness.store().as_ref(), SPACE_ID).await,
        Some(stored(&committed_space, 1, None))
    );
    Ok(())
}

/// A Resource moving from the Meta Space to the Space it links: the two
/// Spaces before, and after (`movingResource`).
struct Moving {
    releasing: SpaceSnapshot,
    receiving: SpaceSnapshot,
    released: SpaceSnapshot,
    received: SpaceSnapshot,
}

fn moving() -> Moving {
    let link = space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID);
    let moving = resource(RESOURCE_ID, "Moving");
    let own = resource(OTHER_RESOURCE_ID, "Receiving resource");
    Moving {
        releasing: space_holding(SPACE_ID, "Releasing", vec![moving.clone(), link.clone()]),
        receiving: target_holding(OTHER_SPACE_ID, "Receiving", vec![own.clone()]),
        released: space_holding(SPACE_ID, "Releasing", vec![link]),
        // Ahead of the Receiving Space's own Resource: every read answers
        // them in id order.
        received: target_holding(OTHER_SPACE_ID, "Receiving", vec![moving, own]),
    }
}

// Case: moves an unchanged Resource between Spaces in one commit
pub async fn moves_an_unchanged_resource_between_spaces_in_one_commit<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let moving = moving();
    seed(store, &[&moving.releasing, &moving.receiving]).await;
    assert_eq!(
        commit_changes(
            store,
            vec![update(&moving.released, 0), update(&moving.received, 0)]
        )
        .await,
        committed(&[(SPACE_ID, 1), (OTHER_SPACE_ID, 1)], &[])
    );
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&moving.released, 1, None))
    );
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&moving.received, 1, None))
    );
    Ok(())
}

/// The same move from the higher Space id to the lower: the Space the Meta
/// Space links releases a Resource the Meta Space receives.
fn moving_down() -> Moving {
    let link = space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID);
    let moving = resource(RESOURCE_ID, "Moving");
    let own = resource(OTHER_RESOURCE_ID, "Releasing resource");
    Moving {
        releasing: target_holding(
            OTHER_SPACE_ID,
            "Releasing",
            vec![moving.clone(), own.clone()],
        ),
        receiving: space_holding(SPACE_ID, "Receiving", vec![link.clone()]),
        released: target_holding(OTHER_SPACE_ID, "Releasing", vec![own]),
        received: space_holding(SPACE_ID, "Receiving", vec![moving, link]),
    }
}

/// Not a port: the contract's change-order case is exempt (ADR 0176), and
/// this is the answer the Rust stores give instead. A move commits to the
/// same end state whichever of its two Spaces the change set lists first,
/// moving from the lower Space id to the higher and back.
pub async fn commits_a_move_whichever_space_it_lists_first<H: Harness>(harness: &mut H) -> Ran {
    let up = moving();
    seed(harness.store().as_ref(), &[&up.releasing, &up.receiving]).await;
    for (direction, moving) in [("up", up), ("down", moving_down())] {
        for receiving_first in [false, true] {
            let meta = if moving.releasing.id == id(SPACE_ID) {
                &moving.releasing
            } else {
                &moving.receiving
            };
            let other = if meta.id == moving.releasing.id {
                &moving.receiving
            } else {
                &moving.releasing
            };
            let store = harness.store().as_ref();
            let replaced = store
                .replace_aggregate(
                    AggregateInput {
                        meta_space_id: id(SPACE_ID),
                        spaces: vec![meta.clone(), other.clone()],
                    },
                    Some(id(SPACE_ID)),
                )
                .await
                .unwrap();
            assert!(
                matches!(replaced, host::ReplaceResult::Replaced(_)),
                "{replaced:?}"
            );
            let mut changes = vec![update(&moving.released, 0), update(&moving.received, 0)];
            if receiving_first {
                changes.reverse();
            }
            let revisions: Vec<(&str, u64)> = changes
                .iter()
                .map(|change| match change {
                    SpaceChange::Update { space_id, .. } if *space_id == id(SPACE_ID) => {
                        (SPACE_ID, 1)
                    }
                    _ => (OTHER_SPACE_ID, 1),
                })
                .collect();
            assert_eq!(
                commit_changes(store, changes).await,
                committed(&revisions, &[]),
                "moving {direction}, receiving first: {receiving_first}"
            );
            let store = reopened(harness).await;
            assert_eq!(
                load(store, &moving.released.id.to_string()).await,
                Some(stored(&moving.released, 1, None)),
                "moving {direction}, receiving first: {receiving_first}"
            );
            assert_eq!(
                load(store, &moving.received.id.to_string()).await,
                Some(stored(&moving.received, 1, None)),
                "moving {direction}, receiving first: {receiving_first}"
            );
        }
    }
    Ok(())
}

/// Not a port: a create naming a stored Space conflicts with what is stored,
/// alone in its commit, and writes nothing.
pub async fn answers_a_create_of_a_stored_space_as_a_conflict<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    assert_eq!(
        commit_changes(store, vec![create(&retitled(&meta, "Created again"))]).await,
        CommitResult::Conflict(vec![conflict(SPACE_ID, Some(stored(&meta, 0, None)))])
    );
    let store = reopened(harness).await;
    assert_eq!(load(store, SPACE_ID).await, Some(stored(&meta, 0, None)));
    Ok(())
}

/// Not a port: the exported revision a Space carries survives a commit on
/// the complete-aggregate path as it does the topology-preserving one, and
/// a Space the commit creates carries none.
pub async fn keeps_an_exported_revision_through_an_aggregate_commit<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    store
        .mark_exported(id(SPACE_ID), revision(0))
        .await
        .unwrap();
    let child = target();
    let linked = linked_meta(SECOND_RESOURCE_ID);
    assert_eq!(
        commit_changes(store, vec![update(&linked, 0), create(&child)]).await,
        committed(&[(SPACE_ID, 1), (OTHER_SPACE_ID, 0)], &[])
    );
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&linked, 1, Some(0)))
    );
    assert_eq!(
        load(store, OTHER_SPACE_ID).await,
        Some(stored(&child, 0, None))
    );
    Ok(())
}

/// Not a port: a stale revision met on the complete-aggregate path, a commit
/// naming two Spaces, conflicts as the single-Space path's does, and writes
/// neither Space.
pub async fn answers_a_stale_revision_on_the_aggregate_path_as_a_conflict<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    let committed_meta = retitled(&meta, "Committed");
    commit_update(store, &committed_meta, 0).await;
    let child = target();
    let linked = linked_meta(SECOND_RESOURCE_ID);
    assert_eq!(
        commit_changes(store, vec![update(&linked, 0), create(&child)]).await,
        CommitResult::Conflict(vec![conflict(
            SPACE_ID,
            Some(stored(&committed_meta, 1, None))
        )])
    );
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&committed_meta, 1, None))
    );
    assert_eq!(load(store, OTHER_SPACE_ID).await, None);
    Ok(())
}

/// Not a port: a commit deleting a Space and giving one of its Resource ids
/// to the Space that linked it lands, because its deletes run before its
/// writes, so the id is free when the receiving Space takes it.
pub async fn adopts_a_resource_id_from_the_space_a_commit_deletes<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let linked = linked_meta(SECOND_RESOURCE_ID);
    let child = target();
    seed(store, &[&linked, &child]).await;
    let adopting = space_holding(
        SPACE_ID,
        "Meta",
        vec![
            resource(RESOURCE_ID, "Meta resource"),
            resource(OTHER_RESOURCE_ID, "Adopted"),
        ],
    );
    assert_eq!(
        commit_changes(store, vec![update(&adopting, 0), delete(OTHER_SPACE_ID, 0)]).await,
        committed(&[(SPACE_ID, 1)], &[OTHER_SPACE_ID])
    );
    let store = reopened(harness).await;
    assert_eq!(
        load(store, SPACE_ID).await,
        Some(stored(&adopting, 1, None))
    );
    assert_eq!(load(store, OTHER_SPACE_ID).await, None);
    Ok(())
}
