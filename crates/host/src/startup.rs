//! A store-backed host's start-up (Storage ST-10,
//! `src/startup/database-startup.ts`): the store's one Meta identity,
//! established from Default Content only when the store holds none.
//!
//! An initialized store is never reseeded. A store that is not answering is
//! tried again, the wait doubling from five seconds and holding at a minute,
//! with no bound on the attempts: a host that gave up would answer 503 at its
//! root for good. What stops the retry is a failure no wait cures, once a
//! second retry in a row confirms it; contradictory stored state is one
//! (ST-7), and it is never repaired.

use std::time::Duration;

use intake::{Refusals, SpaceId};

use crate::import::IdSource;
use crate::init::default_content;
use crate::repository::{AggregateLoad, InitializeResult, RepositoryError, SpaceRepository};
use crate::run::Clock;

/// The first wait between establishment attempts.
pub const ESTABLISH_RETRY_INITIAL_DELAY: Duration = Duration::from_secs(5);

/// The longest wait between establishment attempts, which the doubling holds at.
pub const ESTABLISH_RETRY_MAX_DELAY: Duration = Duration::from_secs(60);

/// How many retries in a row failing in a way no wait cures stop the retry.
const CONFIRMING_FAILURES: u32 = 2;

/// Why the Meta identity could not be established.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[non_exhaustive]
pub enum EstablishError {
    /// Default Content is not a valid aggregate: a defect in this build,
    /// which no attempt can cure.
    #[error("Default Content is not a valid aggregate: {0}")]
    DefaultContentInvalid(Refusals),
    /// The store failed.
    #[error("failed to establish the Meta Space: {0}")]
    Repository(#[from] RepositoryError),
}

/// The store's Meta identity, establishing it from Default Content through
/// the first lifecycle door when the store holds none (ADR 0078); an
/// initialized store, the same aggregate or another, is left as it is.
///
/// # Errors
///
/// [`EstablishError`]: the store failed, or Default Content is invalid.
pub async fn establish_meta_space<R: SpaceRepository, I: IdSource>(
    repository: &R,
    ids: &I,
) -> Result<SpaceId, EstablishError> {
    if let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await? {
        return Ok(aggregate.meta_space_id);
    }
    let input = default_content(ids).map_err(EstablishError::DefaultContentInvalid)?;
    match repository.initialize_aggregate(input).await? {
        InitializeResult::Initialized(aggregate)
        | InitializeResult::Existing(aggregate)
        | InitializeResult::AlreadyInitialized(aggregate) => Ok(aggregate.meta_space_id),
        InitializeResult::AggregateRefused(refusals) => {
            Err(EstablishError::DefaultContentInvalid(refusals))
        }
    }
}

/// [`establish_meta_space`], tried at once, as the host composes, and after a
/// failure retried on `clock` (`retryMetaSpaceEstablishment`), reporting every
/// failure to `report`, until an attempt succeeds or two retries in a row fail
/// in a way no wait cures.
///
/// # Errors
///
/// The [`EstablishError`] that stopped the retry: invalid Default Content at
/// once, or a store failure other than an outage, on two retries in a row.
pub async fn keep_establishing<R: SpaceRepository, I: IdSource, C: Clock>(
    repository: &R,
    ids: &I,
    clock: &C,
    mut report: impl FnMut(&EstablishError),
) -> Result<SpaceId, EstablishError> {
    let failure = match establish_meta_space(repository, ids).await {
        Ok(meta_space_id) => return Ok(meta_space_id),
        Err(failure) => failure,
    };
    report(&failure);
    if matches!(failure, EstablishError::DefaultContentInvalid(_)) {
        return Err(failure);
    }
    let mut uncured = 0;
    let mut delay = ESTABLISH_RETRY_INITIAL_DELAY;
    loop {
        clock.sleep(delay).await;
        delay = (delay * 2).min(ESTABLISH_RETRY_MAX_DELAY);
        let failure = match establish_meta_space(repository, ids).await {
            Ok(meta_space_id) => return Ok(meta_space_id),
            Err(failure) => failure,
        };
        report(&failure);
        match &failure {
            EstablishError::DefaultContentInvalid(_) => return Err(failure),
            // An outage says nothing about whether the failures around it
            // would recur once the store answers.
            EstablishError::Repository(RepositoryError::Unavailable(_)) => uncured = 0,
            EstablishError::Repository(_) => {
                uncured += 1;
                if uncured == CONFIRMING_FAILURES {
                    return Err(failure);
                }
            }
        }
    }
}
