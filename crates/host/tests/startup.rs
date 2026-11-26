//! A store-backed host's start-up (Storage ST-10, `src/startup/database-startup.ts`):
//! an uninitialized store initialized once from Default Content and never
//! reseeded, an unreachable one retried with a bounded back-off, and stored
//! state that cannot be read stopping the retry once a second attempt
//! confirms it (ST-7), with nothing repaired.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Duration;

use host::{
    AggregateInput, AggregateLoad, AssetHash, AssetStored, Clock, CommitResult, EstablishError,
    InitializeResult, LoadedSpace, MemorySpaceRepository, ReplaceResult, RepositoryError, Revision,
    SpaceChange, SpaceCommit, SpaceRepository, SpaceSummary, SqliteSpaceRepository, StoredAsset,
    TokioClock, establish_meta_space, keep_establishing,
};
use http_conformance::Counted;
use intake::SpaceId;
use sqlite_support::Migrated;

/// The first id [`Counted`] mints, which Default Content gives its Meta Space.
const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";

async fn title_of<R: SpaceRepository>(store: &R, id: SpaceId) -> String {
    store
        .load_space(id)
        .await
        .unwrap()
        .unwrap()
        .snapshot
        .document
        .title
}

async fn rename<R: SpaceRepository>(store: &R, id: SpaceId, title: &str) {
    let loaded = store.load_space(id).await.unwrap().unwrap();
    let mut snapshot = loaded.snapshot;
    title.clone_into(&mut snapshot.document.title);
    let answer = store
        .commit(SpaceCommit {
            changes: vec![SpaceChange::Update {
                space_id: id,
                snapshot,
                expected_revision: loaded.revision,
            }],
        })
        .await
        .unwrap();
    assert!(
        matches!(answer, CommitResult::Committed { .. }),
        "renamed: {answer:?}"
    );
}

mod given_an_uninitialized_store {
    use super::*;

    #[tokio::test]
    async fn initializes_it_from_default_content() {
        let store = MemorySpaceRepository::new();
        let meta = establish_meta_space(&store, &Counted::default())
            .await
            .unwrap();
        assert_eq!(meta.as_str(), FIRST_ID, "the new Space is the Meta Space");
        let AggregateLoad::Loaded(aggregate) = store.load_aggregate().await.unwrap() else {
            panic!("the store holds an aggregate");
        };
        assert_eq!(aggregate.meta_space_id, meta, "the stored Meta identity");
        assert_eq!(aggregate.spaces.len(), 1, "one Space");
        assert_eq!(title_of(&store, meta).await, "New space", "the new Space");
        let resources = &aggregate.spaces[0].snapshot.resources;
        assert_eq!(
            resources
                .iter()
                .map(|resource| resource.title.as_str())
                .collect::<Vec<_>>(),
            ["Resource 1"],
            "its one Resource"
        );
    }

    #[tokio::test]
    async fn initializes_a_sqlite_file_once_and_never_reseeds_it() {
        let file = Migrated::new().await;
        let store = SqliteSpaceRepository::open(&file.path());
        let meta = establish_meta_space(&store, &Counted::default())
            .await
            .unwrap();
        rename(&store, meta, "Authored").await;
        store.close().await;

        let reopened = SqliteSpaceRepository::open(&file.path());
        let ids = Counted::default();
        assert_eq!(
            establish_meta_space(&reopened, &ids).await.unwrap(),
            meta,
            "the stored Meta identity answers"
        );
        assert_eq!(
            title_of(&reopened, meta).await,
            "Authored",
            "the author's edit stands"
        );
        assert_eq!(
            reopened.list_spaces().await.unwrap().len(),
            1,
            "no second Space"
        );
    }
}

/// A clock that records each wait and returns at once.
#[derive(Default)]
struct Recorded(Mutex<Vec<Duration>>);

impl Clock for Recorded {
    fn sleep(&self, duration: Duration) -> impl Future<Output = ()> + Send {
        self.0.lock().unwrap().push(duration);
        std::future::ready(())
    }
}

impl Recorded {
    fn waits(&self) -> Vec<u64> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .map(Duration::as_secs)
            .collect()
    }
}

/// A memory store whose aggregate reads fail as `failures` says, in turn,
/// before it answers.
struct Scripted {
    failures: Mutex<VecDeque<RepositoryError>>,
    store: MemorySpaceRepository,
    // Whether initializing answers that Default Content is refused, as a
    // build whose Default Content intake refuses would.
    refuses_initialization: bool,
}

impl Scripted {
    fn new(failures: impl IntoIterator<Item = RepositoryError>) -> Self {
        Self {
            failures: Mutex::new(failures.into_iter().collect()),
            store: MemorySpaceRepository::new(),
            refuses_initialization: false,
        }
    }

    /// A store that answers as `failures` says, then refuses every
    /// initialization as an aggregate intake refuses.
    fn refusing(failures: impl IntoIterator<Item = RepositoryError>) -> Self {
        Self {
            refuses_initialization: true,
            ..Self::new(failures)
        }
    }

    fn failure(&self) -> Option<RepositoryError> {
        self.failures.lock().unwrap().pop_front()
    }
}

impl SpaceRepository for Scripted {
    async fn list_spaces(&self) -> Result<Vec<SpaceSummary>, RepositoryError> {
        self.store.list_spaces().await
    }
    async fn load_space(&self, id: SpaceId) -> Result<Option<LoadedSpace>, RepositoryError> {
        self.store.load_space(id).await
    }
    async fn load_aggregate(&self) -> Result<AggregateLoad, RepositoryError> {
        match self.failure() {
            Some(failure) => Err(failure),
            None => self.store.load_aggregate().await,
        }
    }
    async fn commit(&self, request: SpaceCommit) -> Result<CommitResult, RepositoryError> {
        self.store.commit(request).await
    }
    async fn store_asset(&self, asset: StoredAsset) -> Result<AssetStored, RepositoryError> {
        self.store.store_asset(asset).await
    }
    async fn load_asset(&self, hash: &AssetHash) -> Result<Option<StoredAsset>, RepositoryError> {
        self.store.load_asset(hash).await
    }
    async fn initialize_aggregate(
        &self,
        input: AggregateInput,
    ) -> Result<InitializeResult, RepositoryError> {
        if self.refuses_initialization {
            let mut refused = input;
            refused.spaces.clear();
            return self.store.initialize_aggregate(refused).await;
        }
        self.store.initialize_aggregate(input).await
    }
    async fn load_meta_space_id(&self) -> Result<Option<SpaceId>, RepositoryError> {
        self.store.load_meta_space_id().await
    }
    async fn replace_aggregate(
        &self,
        input: AggregateInput,
        expected: Option<SpaceId>,
    ) -> Result<ReplaceResult, RepositoryError> {
        self.store.replace_aggregate(input, expected).await
    }
    async fn mark_exported(&self, id: SpaceId, revision: Revision) -> Result<(), RepositoryError> {
        self.store.mark_exported(id, revision).await
    }
}

fn unavailable() -> RepositoryError {
    RepositoryError::Unavailable("not answering".to_owned())
}

fn broken() -> RepositoryError {
    RepositoryError::BrokenStoredState("broken".to_owned())
}

fn unclassified() -> RepositoryError {
    RepositoryError::Unclassified("failed".to_owned())
}

/// Every failure `keep_establishing` reports, and what it answers.
async fn kept(
    store: &Scripted,
    clock: &Recorded,
) -> (Vec<String>, Result<SpaceId, EstablishError>) {
    let mut reported = Vec::new();
    let answer = keep_establishing(store, &Counted::default(), clock, |failure| {
        reported.push(failure.to_string());
    })
    .await;
    (reported, answer)
}

mod given_an_unreachable_store {
    use super::*;

    #[tokio::test]
    async fn backs_off_up_to_a_bound_it_then_holds() {
        let store = Scripted::new((0..7).map(|_| unavailable()));
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert_eq!(
            answer.unwrap().as_str(),
            FIRST_ID,
            "established once it answers"
        );
        assert_eq!(reported.len(), 7, "each failed attempt is reported");
        assert_eq!(
            clock.waits(),
            [5, 10, 20, 40, 60, 60, 60],
            "the wait doubles from five seconds and holds at a minute"
        );
    }

    #[tokio::test]
    async fn keeps_trying_through_forty_unreachable_attempts_at_the_bound() {
        let store = Scripted::new((0..40).map(|_| unavailable()));
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert_eq!(
            answer.unwrap().as_str(),
            FIRST_ID,
            "established once it answers"
        );
        assert_eq!(reported.len(), 40, "each failed attempt is reported");
        let waits = clock.waits();
        assert_eq!(waits.len(), 40, "a wait before each retry");
        assert!(
            waits[4..].iter().all(|wait| *wait == 60),
            "every wait from the fifth holds at a minute: {waits:?}"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn waits_on_the_clock_it_is_given() {
        let store = Scripted::new([unavailable(), unavailable()]);
        let started = tokio::time::Instant::now();
        let answer = keep_establishing(&store, &Counted::default(), &TokioClock, |_| {}).await;
        assert!(answer.is_ok(), "established: {answer:?}");
        assert_eq!(
            started.elapsed(),
            Duration::from_secs(15),
            "five seconds, then ten, on paused time"
        );
    }
}

mod given_stored_state_that_cannot_be_read {
    use super::*;

    #[tokio::test]
    async fn stops_once_a_second_retry_confirms_it() {
        let store = Scripted::new([broken(), broken(), broken(), broken()]);
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(
                    RepositoryError::BrokenStoredState(_)
                ))
            ),
            "broken stored state is not repaired: {answer:?}"
        );
        assert_eq!(
            reported.len(),
            3,
            "the first attempt, then two retries in a row that confirm it"
        );
        assert_eq!(clock.waits(), [5, 10], "a wait before each retry");
        assert_eq!(
            store.store.load_aggregate().await,
            Ok(AggregateLoad::Uninitialized),
            "nothing was written"
        );
    }

    #[tokio::test]
    async fn counts_no_outage_between_two_failures_as_confirming_either() {
        // A counted failure, then an outage, then another counted failure: the
        // outage must reset the count, or the second stops establishment.
        let store = Scripted::new([unavailable(), broken(), unavailable(), broken()]);
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert!(
            answer.is_ok(),
            "established once the store answers: {answer:?}"
        );
        assert_eq!(reported.len(), 4, "the outage reset the count");
    }

    #[tokio::test]
    async fn stops_at_spaces_without_a_meta_identity_in_a_sqlite_file() {
        let file = Migrated::new().await;
        let store = SqliteSpaceRepository::open(&file.path());
        establish_meta_space(&store, &Counted::default())
            .await
            .unwrap();
        store.close().await;
        sqlite_support::execute(&file.file, "DELETE FROM repository_state").await;
        let store = SqliteSpaceRepository::open(&file.path());
        let answer =
            keep_establishing(&store, &Counted::default(), &Recorded::default(), |_| {}).await;
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(
                    RepositoryError::BrokenStoredState(_)
                ))
            ),
            "an invariant failure: {answer:?}"
        );
        assert_eq!(
            store.load_meta_space_id().await,
            Ok(None),
            "no Meta identity was written"
        );
    }
}

/// Failures no wait cures (ST-10, `test/unit/database-startup.test.ts`):
/// unclassified failures and invariant failures alike, counted together, two
/// retries running stopping the retry and an outage between them resetting
/// the count. The first attempt, made as the host composes, is not one of
/// the retries, so each script below opens with an outage and its retries
/// follow.
mod given_failures_no_wait_cures {
    use super::*;

    #[tokio::test]
    async fn stops_at_an_unclassified_failure_once_a_second_retry_confirms_it() {
        let store = Scripted::new(
            [unavailable()]
                .into_iter()
                .chain((0..9).map(|_| unclassified())),
        );
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(RepositoryError::Unclassified(_)))
            ),
            "a defect fails the same way every time: {answer:?}"
        );
        assert_eq!(reported.len(), 3, "the outage, then two confirming retries");
        assert_eq!(clock.waits(), [5, 10], "a wait before each retry");
    }

    #[tokio::test]
    async fn stops_at_a_directory_where_the_sqlite_file_should_be() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("cube.db");
        std::fs::create_dir(&folder).unwrap();
        let store =
            SqliteSpaceRepository::open(&host::SqlitePath::from_variable(folder.to_str()).unwrap());
        let clock = Recorded::default();
        let mut reported = 0;
        let answer =
            keep_establishing(&store, &Counted::default(), &clock, |_| reported += 1).await;
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(RepositoryError::Unclassified(_)))
            ),
            "no wait makes a directory a database: {answer:?}"
        );
        assert_eq!(
            reported, 3,
            "the first attempt, then two retries in a row that confirm it"
        );
        assert_eq!(clock.waits(), [5, 10], "a wait before each retry");
    }

    #[tokio::test]
    async fn keeps_trying_through_one_unclassified_failure_the_next_attempt_does_not_repeat() {
        let store = Scripted::new([unavailable(), unclassified()]);
        let (reported, answer) = kept(&store, &Recorded::default()).await;
        assert_eq!(
            answer.unwrap().as_str(),
            FIRST_ID,
            "a one-off is not a verdict"
        );
        assert_eq!(reported.len(), 2, "the outage and the one-off");
    }

    #[tokio::test]
    async fn keeps_trying_through_one_invariant_failure_the_next_attempt_does_not_repeat() {
        let store = Scripted::new([unavailable(), broken()]);
        let (reported, answer) = kept(&store, &Recorded::default()).await;
        assert_eq!(
            answer.unwrap().as_str(),
            FIRST_ID,
            "a one-off is not a verdict"
        );
        assert_eq!(reported.len(), 2, "the outage and the one-off");
    }

    #[tokio::test]
    async fn counts_an_unclassified_and_an_invariant_failure_in_a_row_together() {
        let store = Scripted::new([unavailable(), unclassified(), broken()]);
        let (reported, answer) = kept(&store, &Recorded::default()).await;
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(
                    RepositoryError::BrokenStoredState(_)
                ))
            ),
            "each confirms the other: {answer:?}"
        );
        assert_eq!(reported.len(), 3, "stopped at the second in a row");

        let store = Scripted::new([unavailable(), broken(), unclassified()]);
        let (_, answer) = kept(&store, &Recorded::default()).await;
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(RepositoryError::Unclassified(_)))
            ),
            "in either order: {answer:?}"
        );
    }

    // `test/unit/database-startup.test.ts` › "counts invariant failures
    // consecutively, so an outage between them resets": the retries here are
    // broken, unavailable, broken, then success. A start-up that kept the
    // count across the outage would stop at the second broken retry.
    #[tokio::test]
    async fn counts_failures_consecutively_so_an_outage_between_them_resets() {
        for (what, second) in [("invariant", broken()), ("unclassified", unclassified())] {
            let store = Scripted::new([unavailable(), broken(), unavailable(), second]);
            let (reported, answer) = kept(&store, &Recorded::default()).await;
            assert_eq!(
                answer.map(|id| id.as_str().to_owned()),
                Ok(FIRST_ID.to_owned()),
                "an outage between an invariant and an {what} failure resets the count"
            );
            assert_eq!(reported.len(), 4, "every failure is reported");
        }
    }

    #[tokio::test]
    async fn stops_at_once_when_default_content_is_refused() {
        let store = Scripted::refusing([]);
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert!(
            matches!(answer, Err(EstablishError::DefaultContentInvalid(_))),
            "no attempt can cure the build: {answer:?}"
        );
        assert_eq!(reported.len(), 1, "one attempt, with no confirming retry");
        assert!(clock.waits().is_empty(), "no wait");

        let store = Scripted::refusing([unavailable()]);
        let clock = Recorded::default();
        let (reported, answer) = kept(&store, &clock).await;
        assert!(
            matches!(answer, Err(EstablishError::DefaultContentInvalid(_))),
            "met on a retry: {answer:?}"
        );
        assert_eq!(reported.len(), 2, "the outage, then the refusal");
        assert_eq!(clock.waits(), [5], "no wait after the refusal");
    }
}
