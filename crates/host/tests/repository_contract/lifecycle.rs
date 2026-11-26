//! The contract's lifecycle cases: the two doors, the Meta identity they
//! leave, a fresh host over what they stored, and `mark_exported`'s refusal
//! (rust-sqlite-test-coverage 04).

use std::collections::{BTreeMap, VecDeque};
use std::sync::{Arc, Mutex};

use bytes::Bytes;
use host::{
    AggregateInput, AggregateLoad, Application, IdSource, InitializeResult, LoadedAggregate,
    ReplaceResult, RepositoryError, Shell, SpaceRepository, SpaceSummary,
};
use http::Request;
use intake::Uuid;

use super::*;

fn input(meta: &str, spaces: &[&SpaceSnapshot]) -> AggregateInput {
    AggregateInput {
        meta_space_id: id(meta),
        spaces: spaces.iter().map(|space| (*space).clone()).collect(),
    }
}

fn loaded(meta: &str, spaces: &[(&SpaceSnapshot, u64)]) -> LoadedAggregate {
    LoadedAggregate {
        meta_space_id: id(meta),
        spaces: spaces
            .iter()
            .map(|(space, revision)| stored(space, *revision, None))
            .collect(),
    }
}

/// The Space the contract's lifecycle cases link a child from: the Meta
/// Space holding a Resource and a Space Resource showing `OTHER_SPACE_ID`.
fn linking_meta() -> SpaceSnapshot {
    space_holding(
        SPACE_ID,
        "Meta",
        vec![
            resource(RESOURCE_ID, "Meta resource"),
            space_resource(LINK_RESOURCE_ID, OTHER_SPACE_ID),
        ],
    )
}

fn kind_of_initialize(result: &InitializeResult) -> &'static str {
    match result {
        InitializeResult::Initialized(_) => "initialized",
        InitializeResult::Existing(_) => "existing",
        InitializeResult::AlreadyInitialized(_) => "already-initialized",
        InitializeResult::AggregateRefused(_) => "aggregate-refused",
        _ => "another answer",
    }
}

fn initialize_refusals(result: &InitializeResult) -> Vec<&'static str> {
    match result {
        InitializeResult::AggregateRefused(refusals) => refusals
            .as_slice()
            .iter()
            .map(|refusal| refusal.kind().as_str())
            .collect(),
        other => panic!("an aggregate refusal, not {other:?}"),
    }
}

fn replace_refusals(result: &ReplaceResult) -> Vec<&'static str> {
    match result {
        ReplaceResult::AggregateRefused(refusals) => refusals
            .as_slice()
            .iter()
            .map(|refusal| refusal.kind().as_str())
            .collect(),
        other => panic!("an aggregate refusal, not {other:?}"),
    }
}

// Case: preserves the established aggregate across a fresh repository host
pub async fn preserves_the_established_aggregate_across_a_fresh_host<H: Harness>(
    harness: &mut H,
) -> Ran {
    let first = space(SPACE_ID, "Durable", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&first]).await;
    harness.reopen().await?;
    assert_eq!(
        harness.store().load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(SPACE_ID, &[(&first, 0)]))),
        "the fresh host reads what the first stored"
    );
    Ok(())
}

/// Ids handed out in the order given, and none after.
struct Listed(Mutex<VecDeque<Uuid>>);

impl Listed {
    fn of(ids: &[&str]) -> Self {
        Self(Mutex::new(
            ids.iter().map(|text| Uuid::parse(text).unwrap()).collect(),
        ))
    }
}

impl IdSource for Listed {
    fn new_id(&self) -> Uuid {
        self.0
            .lock()
            .unwrap()
            .pop_front()
            .expect("the initializer minted no more ids than it was given")
    }
}

type Built = BTreeMap<String, Bytes>;

/// The body `GET /api/spaces/<space>` answers over `store`, minting from `ids`.
async fn working_read<R: SpaceRepository>(store: &Arc<R>, ids: Listed, space: &str) -> Bytes {
    let application: Application<R, Listed, Built> =
        Application::new(Arc::clone(store), ids, Shell::new("", Built::new()));
    let request = Request::get(format!("/api/spaces/{space}"))
        .body(http_body_util::Full::new(Bytes::new()))
        .unwrap();
    let response = application.handle(request).await;
    assert_eq!(response.status(), 200, "the working read answers");
    response.into_body()
}

// Case: persists first-working-load initialization for a fresh repository host
pub async fn persists_first_working_load_initialization_for_a_fresh_host<H: Harness>(
    harness: &mut H,
) -> Ran {
    let initial = space(SPACE_ID, "Mapless", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&initial]).await;
    let first_body = working_read(harness.store(), Listed::of(&[MAP_ID, GRAPH_ID]), SPACE_ID).await;
    let first = harness
        .store()
        .load_space(id(SPACE_ID))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        first.revision,
        revision(1),
        "the initialization is committed once"
    );
    let maps = first.snapshot.document.maps.clone().unwrap_or_default();
    let map = maps
        .first()
        .expect("the working read gives the Space a Map");
    assert_eq!(map.id.as_str(), MAP_ID, "the first id minted names the Map");
    assert!(map.positions.is_empty(), "the Map places nothing yet");
    assert_eq!(
        map.active_graph.map(|graph| graph.as_str().to_owned()),
        Some(GRAPH_ID.to_owned()),
        "its Graph is active"
    );

    harness.reopen().await?;
    let again = working_read(harness.store(), Listed::of(&[]), SPACE_ID).await;
    assert_eq!(
        again, first_body,
        "a fresh host reads the initialized Space as it was answered"
    );
    assert_eq!(
        harness.store().load_space(id(SPACE_ID)).await,
        Ok(Some(first)),
        "and initializes nothing again"
    );
    Ok(())
}

// Case: initializes and replaces only through explicit Meta-rooted aggregates
pub async fn initializes_and_replaces_only_through_meta_rooted_aggregates<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Uninitialized)
    );
    assert_eq!(
        store.initialize_aggregate(input(SPACE_ID, &[&first])).await,
        Ok(InitializeResult::Initialized(loaded(
            SPACE_ID,
            &[(&first, 0)]
        ))),
    );
    assert!(
        matches!(
            store
                .initialize_aggregate(input(SPACE_ID, &[&first.clone()]))
                .await,
            Ok(InitializeResult::Existing(_))
        ),
        "the same aggregate again is existing"
    );
    let replacement = retitled(&first, "Replacement");
    assert_eq!(
        store
            .replace_aggregate(input(SPACE_ID, &[&replacement]), Some(id(OTHER_SPACE_ID)))
            .await,
        Ok(ReplaceResult::Conflict {
            current_meta_space_id: Some(id(SPACE_ID))
        }),
    );
    assert_eq!(
        store
            .replace_aggregate(input(SPACE_ID, &[&replacement]), Some(id(SPACE_ID)))
            .await,
        Ok(ReplaceResult::Replaced(loaded(
            SPACE_ID,
            &[(&replacement, 0)]
        ))),
    );
    harness.reopen().await.ok();
    assert_eq!(
        harness.store().load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(
            SPACE_ID,
            &[(&replacement, 0)]
        ))),
        "the replacement is what is stored"
    );
    Ok(())
}

// Case: classifies canonical and different initialization proposals
pub async fn classifies_canonical_and_different_initialization_proposals<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    let child = target_space(OTHER_SPACE_ID, "Child", &[OTHER_RESOURCE_ID]);
    let meta = linking_meta();
    let (first, second) = tokio::join!(
        store.initialize_aggregate(input(SPACE_ID, &[&meta, &child])),
        store.initialize_aggregate(input(SPACE_ID, &[&child, &meta])),
    );
    let mut kinds = [
        kind_of_initialize(&first.unwrap()),
        kind_of_initialize(&second.unwrap()),
    ];
    kinds.sort_unstable();
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(
        kinds,
        ["existing", "initialized"],
        "one installs, the other is the same"
    );
    assert!(
        matches!(
            store
                .initialize_aggregate(input(SPACE_ID, &[&retitled(&meta, "Different"), &child]))
                .await,
            Ok(InitializeResult::AlreadyInitialized(_))
        ),
        "a different aggregate is already initialized"
    );
    Ok(())
}

// Case: refuses a replacement proposal naming a Meta Space it does not hold
pub async fn refuses_a_replacement_naming_a_meta_space_it_does_not_hold<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    let child = target_space(OTHER_SPACE_ID, "Child", &[OTHER_RESOURCE_ID]);
    let meta = linking_meta();
    seed(store.as_ref(), &[&meta, &child]).await;
    assert!(
        matches!(
            store
                .replace_aggregate(
                    input(MISSING_SPACE_ID, &[&meta, &child]),
                    Some(id(SPACE_ID))
                )
                .await,
            Ok(ReplaceResult::AggregateRefused(_))
        ),
        "the Meta identity it names is not among its Spaces"
    );
    Ok(())
}

// Case: ignores object-key insertion order when classifying initialization
pub async fn ignores_object_key_order_when_classifying_initialization<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    // A Space's document decodes into fields, so only opaque content, a
    // missing plugin's here, keeps the order its keys were written in.
    let written = |content: &str| {
        snapshot_text(
            SPACE_ID,
            &format!(
                r#"{{"id":"{SPACE_ID}","document":{{"version":1,"title":"Meta"}},"resources":[{{"id":"{RESOURCE_ID}","document":{{"title":"Resource","kind":"vnd.example.unread","content":{content}}}}}]}}"#
            ),
        )
    };
    let first = written(r#"{"zeta":1,"alpha":{"y":2,"x":1}}"#);
    let reordered = written(r#"{"alpha":{"x":1,"y":2},"zeta":1}"#);
    assert_ne!(
        first, reordered,
        "the two proposals hold their content's keys in different orders"
    );
    assert!(matches!(
        store.initialize_aggregate(input(SPACE_ID, &[&first])).await,
        Ok(InitializeResult::Initialized(_))
    ));
    harness.reopen().await.ok();
    let store = harness.store();
    assert!(
        matches!(
            store
                .initialize_aggregate(input(SPACE_ID, &[&reordered]))
                .await,
            Ok(InitializeResult::Existing(_))
        ),
        "the same authored data in another key order is existing"
    );
    Ok(())
}

// Case: lets only one different concurrent initialization establish state
pub async fn lets_only_one_different_concurrent_initialization_establish_state<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    let first = space(SPACE_ID, "First", &[RESOURCE_ID]);
    let second = space(OTHER_SPACE_ID, "Second", &[OTHER_RESOURCE_ID]);
    let (left, right) = tokio::join!(
        store.initialize_aggregate(input(SPACE_ID, &[&first])),
        store.initialize_aggregate(input(OTHER_SPACE_ID, &[&second])),
    );
    let mut kinds = [
        kind_of_initialize(&left.unwrap()),
        kind_of_initialize(&right.unwrap()),
    ];
    kinds.sort_unstable();
    assert_eq!(
        kinds,
        ["already-initialized", "initialized"],
        "one establishes state"
    );
    harness.reopen().await.ok();
    let Ok(AggregateLoad::Loaded(aggregate)) = harness.store().load_aggregate().await else {
        panic!("an aggregate is stored");
    };
    assert_eq!(aggregate.spaces.len(), 1, "one of the two, never both");
    Ok(())
}

// Case: rolls back a refused replacement
pub async fn rolls_back_a_refused_replacement<H: Harness>(harness: &mut H) -> Ran {
    let initial = space(SPACE_ID, "Initial", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&initial]).await;
    assert!(matches!(
        harness
            .store()
            .replace_aggregate(
                input(MISSING_SPACE_ID, &[&retitled(&initial, "Invalid")]),
                Some(id(SPACE_ID))
            )
            .await,
        Ok(ReplaceResult::AggregateRefused(_))
    ));
    harness.reopen().await.ok();
    assert_eq!(
        harness.store().load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(SPACE_ID, &[(&initial, 0)]))),
    );
    Ok(())
}

// Case: refuses replacement before initialization
pub async fn refuses_replacement_before_initialization<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    for expected in [Some(id(SPACE_ID)), None] {
        assert_eq!(
            store
                .replace_aggregate(input(SPACE_ID, &[&meta]), expected)
                .await,
            Ok(ReplaceResult::Uninitialized),
            "expecting {expected:?}"
        );
    }
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Uninitialized)
    );
    Ok(())
}

// Case: reads the stored Meta identity as each lifecycle door leaves it
pub async fn reads_the_meta_identity_as_each_door_leaves_it<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store();
    assert_eq!(store.load_meta_space_id().await, Ok(None));
    seed(store.as_ref(), &[&space(SPACE_ID, "Meta", &[RESOURCE_ID])]).await;
    assert_eq!(store.load_meta_space_id().await, Ok(Some(id(SPACE_ID))));
    store
        .replace_aggregate(
            input(OTHER_SPACE_ID, &[&space(OTHER_SPACE_ID, "Other", &[])]),
            Some(id(SPACE_ID)),
        )
        .await
        .unwrap();
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(
        store.load_meta_space_id().await,
        Ok(Some(id(OTHER_SPACE_ID)))
    );
    Ok(())
}

// Case: refuses a replacement expecting no Meta identity where one is stored
pub async fn refuses_a_replacement_expecting_no_meta_identity_where_one_is_stored<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    seed(
        store.as_ref(),
        &[&space(SPACE_ID, "Initial", &[RESOURCE_ID])],
    )
    .await;
    assert_eq!(
        store
            .replace_aggregate(
                input(OTHER_SPACE_ID, &[&space(OTHER_SPACE_ID, "Other", &[])]),
                None
            )
            .await,
        Ok(ReplaceResult::Conflict {
            current_meta_space_id: Some(id(SPACE_ID))
        }),
    );
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(store.load_meta_space_id().await, Ok(Some(id(SPACE_ID))));
    Ok(())
}

// Case: refuses a replacement authorized against a superseded Meta identity
pub async fn refuses_a_replacement_authorized_against_a_superseded_meta_identity<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    let initial = space(SPACE_ID, "Initial", &[RESOURCE_ID]);
    let first = space(OTHER_SPACE_ID, "First replacement", &[OTHER_RESOURCE_ID]);
    let second = space(
        MISSING_SPACE_ID,
        "Second replacement",
        &[MISSING_RESOURCE_ID],
    );
    seed(store.as_ref(), &[&initial]).await;
    assert!(matches!(
        store
            .replace_aggregate(input(OTHER_SPACE_ID, &[&first]), Some(id(SPACE_ID)))
            .await,
        Ok(ReplaceResult::Replaced(_))
    ));
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(
        store
            .replace_aggregate(input(MISSING_SPACE_ID, &[&second]), Some(id(SPACE_ID)))
            .await,
        Ok(ReplaceResult::Conflict {
            current_meta_space_id: Some(id(OTHER_SPACE_ID))
        }),
    );
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(
            OTHER_SPACE_ID,
            &[(&first, 0)]
        ))),
    );
    Ok(())
}

// Case: refuses to record an exported revision for a Space it does not store
pub async fn refuses_to_record_an_exported_revision_for_a_space_it_does_not_store<H: Harness>(
    harness: &mut H,
) -> Ran {
    assert_eq!(
        harness
            .store()
            .mark_exported(id(MISSING_SPACE_ID), revision(0))
            .await,
        Err(RepositoryError::Unclassified(format!(
            "Space {MISSING_SPACE_ID} does not exist"
        ))),
    );
    Ok(())
}

// Case: refuses an aggregate that repeats a Space identity, storing none of it
pub async fn refuses_an_aggregate_repeating_a_space_identity<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store();
    let result = store
        .initialize_aggregate(input(
            SPACE_ID,
            &[
                &space(SPACE_ID, "First", &[RESOURCE_ID]),
                &space(SPACE_ID, "Repeat", &[OTHER_RESOURCE_ID]),
            ],
        ))
        .await
        .unwrap();
    harness.reopen().await.ok();
    let store = harness.store();
    assert!(
        initialize_refusals(&result).contains(&"duplicate-space-id"),
        "{result:?}"
    );
    assert_eq!(store.list_spaces().await, Ok(vec![]), "nothing is stored");
    Ok(())
}

// Case: refuses an aggregate that repeats a Resource identity, storing none of it
pub async fn refuses_an_aggregate_repeating_a_resource_identity<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store();
    let result = store
        .initialize_aggregate(input(
            SPACE_ID,
            &[
                &space(SPACE_ID, "First", &[RESOURCE_ID]),
                &space(OTHER_SPACE_ID, "Second", &[RESOURCE_ID]),
            ],
        ))
        .await
        .unwrap();
    harness.reopen().await.ok();
    let store = harness.store();
    assert!(
        initialize_refusals(&result).contains(&"duplicate-resource-id"),
        "{result:?}"
    );
    assert_eq!(store.list_spaces().await, Ok(vec![]), "nothing is stored");
    Ok(())
}

async fn refuses_a_repeating_replacement<H: Harness>(
    harness: &mut H,
    spaces: &[&SpaceSnapshot],
    kind: &str,
) -> Ran {
    let existing = space(SPACE_ID, "Existing", &[OTHER_RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&existing]).await;
    let result = harness
        .store()
        .replace_aggregate(input(OTHER_SPACE_ID, spaces), Some(id(SPACE_ID)))
        .await
        .unwrap();
    assert!(replace_refusals(&result).contains(&kind), "{result:?}");
    harness.reopen().await.ok();
    assert_eq!(
        harness.store().load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(SPACE_ID, &[(&existing, 0)]))),
        "the stored aggregate is kept"
    );
    Ok(())
}

// Case: refuses a replacement that repeats a * identity, keeping the stored aggregate (Space)
pub async fn refuses_a_replacement_repeating_a_space_identity<H: Harness>(harness: &mut H) -> Ran {
    refuses_a_repeating_replacement(
        harness,
        &[
            &space(OTHER_SPACE_ID, "First", &[RESOURCE_ID]),
            &space(OTHER_SPACE_ID, "Repeat", &[SECOND_RESOURCE_ID]),
        ],
        "duplicate-space-id",
    )
    .await
}

// Case: refuses a replacement that repeats a * identity, keeping the stored aggregate (Resource)
pub async fn refuses_a_replacement_repeating_a_resource_identity<H: Harness>(
    harness: &mut H,
) -> Ran {
    refuses_a_repeating_replacement(
        harness,
        &[
            &space(OTHER_SPACE_ID, "First", &[RESOURCE_ID]),
            &space(SPACE_ID, "Second", &[RESOURCE_ID]),
        ],
        "duplicate-resource-id",
    )
    .await
}

// Case: refuses an initialization that fails domain intake, storing none of it
pub async fn refuses_an_initialization_failing_domain_intake<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store();
    let valid = space(SPACE_ID, "Must roll back", &[RESOURCE_ID]);
    let dangling = space_with_dangling_edge(OTHER_SPACE_ID, "Dangling", OTHER_RESOURCE_ID);
    assert!(matches!(
        store
            .initialize_aggregate(input(SPACE_ID, &[&valid, &dangling]))
            .await,
        Ok(InitializeResult::AggregateRefused(_))
    ));
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(
        store.list_spaces().await,
        Ok(vec![]),
        "not even the valid Space"
    );
    Ok(())
}

// Case: replaces everything stored, freeing the Resource ids it clears
pub async fn replaces_everything_stored_freeing_the_resource_ids_it_clears<H: Harness>(
    harness: &mut H,
) -> Ran {
    seed(
        harness.store().as_ref(),
        &[&space(SPACE_ID, "Cleared", &[RESOURCE_ID])],
    )
    .await;
    let replacement = space(OTHER_SPACE_ID, "Replacement", &[RESOURCE_ID]);
    assert_eq!(
        harness
            .store()
            .replace_aggregate(input(OTHER_SPACE_ID, &[&replacement]), Some(id(SPACE_ID)))
            .await,
        Ok(ReplaceResult::Replaced(loaded(
            OTHER_SPACE_ID,
            &[(&replacement, 0)]
        ))),
    );
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(store.load_space(id(SPACE_ID)).await, Ok(None));
    assert_eq!(
        store.list_spaces().await,
        Ok(vec![SpaceSummary {
            id: id(OTHER_SPACE_ID),
            title: "Replacement".to_owned()
        }]),
    );
    Ok(())
}

// Case: becomes committable from an empty store
pub async fn becomes_committable_from_an_empty_store<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store();
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(store.as_ref(), &[&first]).await;
    harness.reopen().await.ok();
    let store = harness.store();
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(SPACE_ID, &[(&first, 0)]))),
    );
    assert_eq!(
        commit_update(store.as_ref(), &retitled(&first, "Changed"), 0).await,
        committed(&[(SPACE_ID, 1)], &[]),
    );
    Ok(())
}

/// Not a port: `replace_aggregate` over stored Spaces its input drops leaves
/// none of them, read back after a reopen.
pub async fn leaves_no_dropped_space_after_a_replacement_across_a_reopen<H: Harness>(
    harness: &mut H,
) -> Ran {
    let child = target_space(OTHER_SPACE_ID, "Child", &[OTHER_RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&linking_meta(), &child]).await;
    let replacement = space(MISSING_SPACE_ID, "Replacement", &[SECOND_RESOURCE_ID]);
    harness
        .store()
        .replace_aggregate(input(MISSING_SPACE_ID, &[&replacement]), Some(id(SPACE_ID)))
        .await
        .unwrap();
    harness.reopen().await?;
    let store = harness.store();
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(loaded(
            MISSING_SPACE_ID,
            &[(&replacement, 0)]
        ))),
        "only the replacement is stored"
    );
    for dropped in [SPACE_ID, OTHER_SPACE_ID] {
        assert_eq!(
            store.load_space(id(dropped)).await,
            Ok(None),
            "Space {dropped}"
        );
    }
    Ok(())
}
