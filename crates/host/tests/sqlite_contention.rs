//! How the Rust SQLite repository answers a lock another holder takes on the
//! live file (Storage ST-127, rust-sqlite-test-coverage 10): each answer, and
//! whether it waits out the busy timeout or answers at once, as Rust does
//! today, where ST-127 allows either.
//!
//! The holder is a connection of its own outside any repository, which
//! SQLite locks against exactly as it would another process's: the locks are
//! the file's, and a second repository in this process is such a holder too
//! (`SqliteSpaceRepository::open`). Every write opens with `BEGIN IMMEDIATE`,
//! so it asks for the write lock before it reads, and every lock a holder
//! can take keeps it waiting the busy timeout out; a read takes only a
//! shared lock, so only a holder committing (an exclusive lock) stops it.
//!
//! Each timing assertion sets a busy timeout of its own: a wait is at least
//! the timeout and under ten times it, and "without waiting" is under a
//! tenth of a timeout set long.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(
    unused_macros,
    unused_imports,
    reason = "this binary uses the table's support, not its cases"
)]
mod repository_contract;
#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use host::{
    AggregateInput, AggregateLoad, CommitResult, ReplaceResult, RepositoryError, SpaceRepository,
    SqliteSpaceRepository,
};
use http::Request;
use repository_contract::{
    OTHER_SPACE_ID, RESOURCE_ID, SPACE_ID, commit, id, retitled, seed, space, space_value, update,
};
use sqlite_support::{Migrated, connect, served};

/// The busy timeout a test that waits it out sets.
const SHORT: Duration = Duration::from_millis(200);
/// The busy timeout a test that must not wait sets: an answer under a tenth
/// of it did not wait.
const LONG: Duration = Duration::from_secs(10);

/// The lock a holder takes on the file and keeps, without writing, until it
/// is dropped.
#[derive(Debug, Clone, Copy)]
enum Lock {
    /// What a reader holds part-way through a transaction.
    Shared,
    /// What a writer holds before it commits.
    Reserved,
    /// What a writer holds while it commits.
    Exclusive,
}

/// A connection of its own holding `lock` on `file`.
async fn hold(file: &Path, lock: Lock) -> sqlx::SqliteConnection {
    let mut connection = connect(file).await;
    let begin = match lock {
        Lock::Shared => "BEGIN",
        Lock::Reserved => "BEGIN IMMEDIATE",
        Lock::Exclusive => "BEGIN EXCLUSIVE",
    };
    sqlx::raw_sql(begin).execute(&mut connection).await.unwrap();
    let _spaces: i64 = sqlx::query_scalar("SELECT count(*) FROM spaces")
        .fetch_one(&mut connection)
        .await
        .unwrap();
    connection
}

/// The operation run against a held lock.
#[derive(Debug, Clone, Copy)]
enum Operation {
    LoadSpace,
    Commit,
    ReplaceAggregate,
}

/// A file holding one Space, `SPACE_ID`, and a repository over it waiting
/// at most `busy_timeout`.
async fn seeded(busy_timeout: Duration) -> (Migrated, SqliteSpaceRepository) {
    let file = Migrated::new().await;
    let store = SqliteSpaceRepository::open_with_busy_timeout(&file.path(), busy_timeout);
    seed(&store, &[&space(SPACE_ID, "One", &[RESOURCE_ID])]).await;
    (file, store)
}

/// Run `operation` on `store`, answering whether it succeeded or failed as
/// unreachable, and how long it took.
async fn timed(
    store: &SqliteSpaceRepository,
    operation: Operation,
) -> (Result<(), String>, Duration) {
    let first = space(SPACE_ID, "One", &[RESOURCE_ID]);
    let started = Instant::now();
    let answer = match operation {
        Operation::LoadSpace => store.load_space(id(SPACE_ID)).await.map(|loaded| {
            assert!(loaded.is_some(), "the Space is there");
        }),
        Operation::Commit => store
            .commit(commit(vec![update(&retitled(&first, "Never stored"), 0)]))
            .await
            .map(|answer| {
                assert!(
                    matches!(answer, CommitResult::Committed { .. }),
                    "{answer:?}"
                );
            }),
        Operation::ReplaceAggregate => store
            .replace_aggregate(
                AggregateInput {
                    meta_space_id: id(OTHER_SPACE_ID),
                    spaces: vec![space(OTHER_SPACE_ID, "Replacement", &[])],
                },
                Some(id(SPACE_ID)),
            )
            .await
            .map(|answer| {
                assert!(matches!(answer, ReplaceResult::Replaced(_)), "{answer:?}");
            }),
    };
    let elapsed = started.elapsed();
    let answer = answer.map_err(|error| match error {
        RepositoryError::Unavailable(message) => message,
        other => panic!("{operation:?} against a lock fails unreachable, not {other:?}"),
    });
    (answer, elapsed)
}

async fn serves_beside(lock: Lock) {
    let (file, store) = seeded(LONG).await;
    let held = hold(&file.file, lock).await;
    let (answer, elapsed) = timed(&store, Operation::LoadSpace).await;
    assert_eq!(answer, Ok(()), "load_space beside a {lock:?} lock");
    assert!(
        elapsed < LONG / 10,
        "load_space beside a {lock:?} lock answers without waiting: {elapsed:?}"
    );
    drop(held);
}

// Case: serves loadSpace beside a * lock without waiting
#[tokio::test]
async fn serves_load_space_beside_a_shared_lock_without_waiting() {
    serves_beside(Lock::Shared).await;
}

// Case: serves loadSpace beside a * lock without waiting
#[tokio::test]
async fn serves_load_space_beside_a_reserved_lock_without_waiting() {
    serves_beside(Lock::Reserved).await;
}

/// `operation` against `lock` waits the busy timeout out and fails as
/// unreachable; let go, the file holds what it held and takes a write.
async fn fails_after_the_busy_timeout(operation: Operation, lock: Lock) {
    let (file, store) = seeded(SHORT).await;
    let before = store.load_aggregate().await.unwrap();
    let held = hold(&file.file, lock).await;

    let (answer, elapsed) = timed(&store, operation).await;
    assert!(
        answer.is_err(),
        "{operation:?} against a {lock:?} lock fails"
    );
    assert!(
        elapsed >= SHORT && elapsed < SHORT * 10,
        "{operation:?} against a {lock:?} lock waits the busy timeout out: {elapsed:?}"
    );

    drop(held);
    assert_eq!(
        store.load_aggregate().await.unwrap(),
        before,
        "nothing of it was written"
    );
    let (answer, _) = timed(&store, Operation::Commit).await;
    assert_eq!(
        answer,
        Ok(()),
        "no lock is left behind: the next write lands"
    );
}

// Case: fails * against a * lock as * BUSY, leaving the file unchanged and unlocked
#[tokio::test]
async fn fails_a_commit_against_a_shared_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::Commit, Lock::Shared).await;
}

// Case: fails * against a * lock as * BUSY, leaving the file unchanged and unlocked
#[tokio::test]
async fn fails_a_replacement_against_a_shared_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::ReplaceAggregate, Lock::Shared).await;
}

// Case: fails * against a * lock as * BUSY, leaving the file unchanged and unlocked
/// The TypeScript writer fails here at once, its transaction deferred
/// (`test/integration/sqlite-contention.test.ts` › `fails commit against a
/// reserved lock as immediate BUSY, leaving the file unchanged and
/// unlocked`); the Rust writer opens with `BEGIN IMMEDIATE`, so it waits for
/// the write lock and fails only once the busy timeout has run out. A
/// deferred `BEGIN` fails this test, answering at once.
#[tokio::test]
async fn fails_a_commit_against_a_reserved_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::Commit, Lock::Reserved).await;
}

// Case: fails * against a * lock as * BUSY, leaving the file unchanged and unlocked
#[tokio::test]
async fn fails_a_replacement_against_a_reserved_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::ReplaceAggregate, Lock::Reserved).await;
}

// Case: fails * against a * lock as * BUSY, leaving the file unchanged and unlocked
#[tokio::test]
async fn fails_a_commit_against_an_exclusive_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::Commit, Lock::Exclusive).await;
}

/// Not a port: the TypeScript matrix leaves this pair out.
#[tokio::test]
async fn fails_a_replacement_against_an_exclusive_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::ReplaceAggregate, Lock::Exclusive).await;
}

// Case: fails * against a * lock as * BUSY, leaving the file unchanged and unlocked
#[tokio::test]
async fn fails_load_space_against_an_exclusive_lock_after_the_busy_timeout() {
    fails_after_the_busy_timeout(Operation::LoadSpace, Lock::Exclusive).await;
}

// Case: recovers on the same runtime when its first read meets an exclusive lock
/// The repository's first statement meets the lock, so the file is opened
/// for the first time under it; let go, the next read answers.
#[tokio::test]
async fn recovers_when_its_first_read_meets_an_exclusive_lock() {
    let (file, store) = seeded(SHORT).await;
    let expected = store.list_spaces().await.unwrap();
    store.close().await;
    let store = SqliteSpaceRepository::open_with_busy_timeout(&file.path(), SHORT);
    let held = hold(&file.file, Lock::Exclusive).await;

    let read = store.list_spaces().await;
    assert!(
        matches!(read, Err(RepositoryError::Unavailable(_))),
        "the first read fails unreachable: {read:?}"
    );

    drop(held);
    assert_eq!(store.list_spaces().await, Ok(expected));
}

// Case: answers HTTP as retryable 503 persistence-unavailable inside the client timeout, never 409
/// A commit and a read against a holder committing each answer 503
/// `persistence-unavailable` once the busy timeout has run out, never 409;
/// let go, the same commit lands. The browser answers a 503
/// `persistence-unavailable` as a retryable failure
/// (`packages/http/test/http-backend.test.ts` › `maps %s to retryable %s`)
/// and retries only when asked (`packages/persistence/test/session.test.ts`
/// › `stops on retryable failure and retries the latest working snapshot
/// explicitly`); the Rust host's longest wait is its five-second default
/// busy timeout (`sql/sqlite.rs`'s `pins_the_default_busy_timeout`).
#[tokio::test]
async fn answers_http_as_503_persistence_unavailable_never_409() {
    let (file, store) = seeded(SHORT).await;
    let store = Arc::new(store);
    let body = serde_json::json!({
        "changes": [{
            "kind": "update",
            "spaceId": SPACE_ID,
            "snapshot": space_value(SPACE_ID, "Never stored", &[RESOURCE_ID]),
            "expectedRevision": "0",
        }],
    })
    .to_string();
    let post = || {
        Request::post("/api/spaces")
            .header("content-type", "application/json")
            .body(http_body_util::Full::new(Bytes::from(body.clone())))
            .unwrap()
    };
    let get = || {
        Request::get(format!("/api/spaces/{SPACE_ID}"))
            .body(http_body_util::Full::new(Bytes::new()))
            .unwrap()
    };
    let held = hold(&file.file, Lock::Exclusive).await;

    for (what, request) in [("POST", post()), ("GET", get())] {
        let started = Instant::now();
        let answer = served(&store, request).await;
        let elapsed = started.elapsed();
        assert_eq!(
            answer,
            (503, "persistence-unavailable".to_owned()),
            "{what} against a holder committing"
        );
        assert!(
            elapsed >= SHORT && elapsed < SHORT * 10,
            "{what} answers once the busy timeout has run out: {elapsed:?}"
        );
    }

    drop(held);
    assert_eq!(served(&store, post()).await.0, 200, "the same commit lands");
    let loaded = store.load_space(id(SPACE_ID)).await.unwrap().unwrap();
    assert_eq!(loaded.snapshot.document.title, "Never stored");
    assert_eq!(loaded.revision, repository_contract::revision(1));
    assert!(matches!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(_))
    ));
}
