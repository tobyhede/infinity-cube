//! The contract's broken-state cases: stored state no valid write produces,
//! each read as an invariant failure (`RepositoryError::BrokenStoredState`,
//! Storage ST-7) and each replaced through the destructive lifecycle door
//! (rust-sqlite-test-coverage 05).

use host::{
    AggregateInput, AggregateLoad, CommitResult, LoadedAggregate, ReplaceResult, RepositoryError,
    SpaceRepository,
};

use super::*;

fn is_broken<T: std::fmt::Debug>(answer: &Result<T, RepositoryError>) -> bool {
    matches!(answer, Err(RepositoryError::BrokenStoredState(_)))
}

fn replacing_with(replacement: &SpaceSnapshot) -> AggregateInput {
    AggregateInput {
        meta_space_id: id(SPACE_ID),
        spaces: vec![replacement.clone()],
    }
}

async fn replaces_broken_state<H: Harness>(harness: &mut H, state: BrokenState) -> Ran {
    let expected = harness
        .arrange_broken_state(state, id(SPACE_ID), id(OTHER_SPACE_ID))
        .await?;
    let store = harness.store().as_ref();
    let replacement = space(SPACE_ID, "Replacement", &[RESOURCE_ID]);

    let loaded = store.load_aggregate().await;
    assert!(is_broken(&loaded), "{loaded:?}");
    let initialized = store
        .initialize_aggregate(replacing_with(&replacement))
        .await;
    assert!(is_broken(&initialized), "{initialized:?}");
    let replaced = store
        .replace_aggregate(replacing_with(&replacement), Some(expected))
        .await;
    assert!(
        matches!(replaced, Ok(ReplaceResult::Replaced(_))),
        "{replaced:?}"
    );
    let store = reopened(harness).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&replacement, 0, None)],
        }))
    );
    Ok(())
}

// Case: replaces * stored state through the destructive lifecycle door (invalid-space-document)
pub async fn replaces_an_invalid_space_document<H: Harness>(harness: &mut H) -> Ran {
    replaces_broken_state(harness, BrokenState::InvalidSpaceDocument).await
}

// Case: replaces * stored state through the destructive lifecycle door (invalid-aggregate)
pub async fn replaces_an_invalid_aggregate<H: Harness>(harness: &mut H) -> Ran {
    replaces_broken_state(harness, BrokenState::InvalidAggregate).await
}

// Case: names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower
/// `load_space` answers the invariant failure too, where the TypeScript
/// `loadSpace` keeps a narrower answer (ADR 0176).
pub async fn names_a_broken_document_broken_on_the_fast_path_and_load_space<H: Harness>(
    harness: &mut H,
) -> Ran {
    harness
        .arrange_broken_state(
            BrokenState::InvalidSpaceDocument,
            id(SPACE_ID),
            id(OTHER_SPACE_ID),
        )
        .await?;
    let store = harness.store().as_ref();
    let repaired = space(SPACE_ID, "Repaired", &[]);
    let loaded = store.load_space(id(SPACE_ID)).await;
    assert!(is_broken(&loaded), "{loaded:?}");
    let committed = store.commit(commit(vec![update(&repaired, 0)])).await;
    assert!(is_broken(&committed), "{committed:?}");
    Ok(())
}

// Case: truncates stored Spaces without a Meta identity only when none was expected
pub async fn truncates_spaces_without_a_meta_identity_only_when_none_was_expected<H: Harness>(
    harness: &mut H,
) -> Ran {
    let orphan = space(OTHER_SPACE_ID, "Orphan", &[OTHER_RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&orphan]).await;
    harness.remove_meta_identity().await?;
    let store = harness.store().as_ref();
    let replacement = space(SPACE_ID, "Replacement", &[RESOURCE_ID]);

    let loaded = store.load_aggregate().await;
    assert!(is_broken(&loaded), "{loaded:?}");
    assert_eq!(
        store
            .replace_aggregate(replacing_with(&replacement), Some(id(OTHER_SPACE_ID)))
            .await,
        Ok(ReplaceResult::Conflict {
            current_meta_space_id: None
        })
    );
    let replaced = store
        .replace_aggregate(replacing_with(&replacement), None)
        .await;
    assert!(
        matches!(replaced, Ok(ReplaceResult::Replaced(_))),
        "{replaced:?}"
    );
    let store = reopened(harness).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&replacement, 0, None)],
        }))
    );
    Ok(())
}

// Case: raises an identifiable invariant failure for a stored Space whose revision is not canonical
pub async fn fails_a_stored_revision_that_is_not_canonical<H: Harness>(harness: &mut H) -> Ran {
    seed(
        harness.store().as_ref(),
        &[&space(SPACE_ID, "One", &[RESOURCE_ID])],
    )
    .await;
    harness.write_raw_revision(id(SPACE_ID), "01", None).await?;
    let loaded = harness.store().load_aggregate().await;
    assert!(is_broken(&loaded), "{loaded:?}");
    Ok(())
}

// Case: refuses a topology-preserving update when stored Spaces have no Meta identity
pub async fn refuses_an_update_when_stored_spaces_have_no_meta_identity<H: Harness>(
    harness: &mut H,
) -> Ran {
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&first]).await;
    harness.remove_meta_identity().await?;
    let store = harness.store().as_ref();
    assert_eq!(
        commit_update(store, &retitled(&first, "Changed"), 0).await,
        CommitResult::Rejected {
            message: "The repository has no Meta Space".to_owned()
        }
    );
    let store = reopened(harness).await;
    assert_eq!(
        store.load_space(id(SPACE_ID)).await,
        Ok(Some(stored(&first, 0, None)))
    );
    Ok(())
}

// Case: raises an identifiable invariant failure for a stored Space whose revision exceeds the 2^63-1 ceiling
pub async fn fails_a_stored_revision_above_the_ceiling<H: Harness>(harness: &mut H) -> Ran {
    seed(
        harness.store().as_ref(),
        &[&space(SPACE_ID, "One", &[RESOURCE_ID])],
    )
    .await;
    harness
        .write_raw_revision(id(SPACE_ID), &(CEILING + 1).to_string(), None)
        .await?;
    let loaded = harness.store().load_aggregate().await;
    assert!(is_broken(&loaded), "{loaded:?}");
    Ok(())
}

// Case: raises an identifiable invariant failure for a commit whose fast-path candidate has a non-canonical stored revision
pub async fn fails_a_fast_path_commit_over_a_revision_that_is_not_canonical<H: Harness>(
    harness: &mut H,
) -> Ran {
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    seed(harness.store().as_ref(), &[&first]).await;
    harness.write_raw_revision(id(SPACE_ID), "01", None).await?;
    let committed = harness
        .store()
        .commit(commit(vec![update(&retitled(&first, "Changed"), 0)]))
        .await;
    assert!(is_broken(&committed), "{committed:?}");
    Ok(())
}

/// Not a port: a stored exported revision that is not canonical is broken
/// stored state, read on every path that decodes the row (Storage ST-7).
pub async fn fails_a_stored_exported_revision_that_is_not_canonical<H: Harness>(
    harness: &mut H,
) -> Ran {
    seed(
        harness.store().as_ref(),
        &[&space(SPACE_ID, "One", &[RESOURCE_ID])],
    )
    .await;
    harness
        .write_raw_revision(id(SPACE_ID), "0", Some(Some("01")))
        .await?;
    let store = harness.store().as_ref();
    let aggregate = store.load_aggregate().await;
    assert!(is_broken(&aggregate), "{aggregate:?}");
    let loaded = store.load_space(id(SPACE_ID)).await;
    assert!(is_broken(&loaded), "{loaded:?}");
    Ok(())
}
