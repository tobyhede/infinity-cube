//! The SQL repository's concurrency seam, over a scripted store: SQLite's
//! statements on a migrated temporary file, with the three locking
//! statements able to answer as a race would make a real database answer.
//! Each operation's order (which lock, in which mode, before which read) is
//! read off the probe's steps, and the branches only a race reaches are
//! driven by the script.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use http_conformance::META;
use intake::SpaceId;
use intake::Uuid;
use sqlx::sqlite::SqliteConnection;
use sqlx::{ConnectOptions as _, Sqlite, Transaction};

use super::codec::{ResourceRow, SpaceRow};
use super::{
    Access, IdStorage, LockMode, Probe, RevisionRow, SqlSpaceRepository, SqlStore, SqliteStore,
    Step,
};
use crate::assets::{AssetHash, StoredAsset};
use crate::repository::{
    AggregateLoad, CommitResult, LoadedSpace, ReplaceResult, RepositoryError, Revision,
    SpaceChange, SpaceCommit, SpaceConflict, SpaceRepository,
};
use crate::{IdSource, SqlitePath, TokioFilesystem, import_directory};

/// Ids counted up from one, as the conformance suite's are.
#[derive(Debug, Default)]
struct Counted(AtomicUsize);

impl IdSource for Counted {
    fn new_id(&self) -> Uuid {
        let next = self.0.fetch_add(1, Ordering::SeqCst) + 1;
        Uuid::parse(&format!("00000000-0000-4000-8000-{next:012x}")).unwrap()
    }
}

/// An aggregate lock, a row hold or a Space read the scripted store saw, in
/// order.
#[derive(Debug, Clone, PartialEq, Eq)]
enum RowEvent {
    Locked(LockMode),
    Held(String),
    Read(String),
}

thread_local! {
    // The aggregate locks, holds and Space reads on this thread: a `#[tokio::test]` runs its
    // spawned operations on its own one thread, and `SqlStore::space` has no
    // `self` to record into.
    static ROW_EVENTS: std::cell::RefCell<Vec<RowEvent>> =
        const { std::cell::RefCell::new(Vec::new()) };
}

fn row_event(event: RowEvent) {
    ROW_EVENTS.with_borrow_mut(|events| events.push(event));
}

/// SQLite's statements, with the locking ones scripted.
#[derive(Debug)]
struct Scripted {
    inner: SqliteStore,
    // How many more times the Meta row is found moved when relocked.
    relock_misses: AtomicUsize,
    // The revision the next row lock answers in place of the stored one.
    prior_revision: Mutex<Option<String>>,
    // Each aggregate lock taken, in order.
    locks: Mutex<Vec<LockMode>>,
}

impl SqlStore for Scripted {
    type Database = Sqlite;
    const SERIAL: bool = true;

    async fn begin(&self, access: Access) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
        self.inner.begin(access).await
    }

    async fn lock_aggregate(
        &self,
        connection: &mut SqliteConnection,
        mode: LockMode,
    ) -> Result<(), sqlx::Error> {
        self.locks.lock().unwrap().push(mode);
        let locked = self.inner.lock_aggregate(connection, mode).await;
        if locked.is_ok() {
            row_event(RowEvent::Locked(mode));
        }
        locked
    }

    async fn relock_meta(
        &self,
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<bool, sqlx::Error> {
        let missed = self
            .relock_misses
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                left.checked_sub(1)
            })
            .is_ok();
        if missed {
            return Ok(false);
        }
        self.inner.relock_meta(connection, id).await
    }

    async fn lock_space(
        &self,
        connection: &mut SqliteConnection,
        id: &[u8],
        storage: IdStorage,
    ) -> Result<Option<Vec<u8>>, sqlx::Error> {
        let stored = self.inner.lock_space(connection, id, storage).await?;
        let scripted = self.prior_revision.lock().unwrap().take();
        Ok(scripted.map(String::into_bytes).or(stored))
    }

    async fn hold_space(
        &self,
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<(), sqlx::Error> {
        row_event(RowEvent::Held(id.to_owned()));
        self.inner.hold_space(connection, id).await
    }

    async fn space_revisions(
        connection: &mut SqliteConnection,
    ) -> Result<Vec<RevisionRow>, sqlx::Error> {
        SqliteStore::space_revisions(connection).await
    }

    async fn meta_space_id(
        connection: &mut SqliteConnection,
    ) -> Result<Option<String>, sqlx::Error> {
        SqliteStore::meta_space_id(connection).await
    }

    async fn spaces(connection: &mut SqliteConnection) -> Result<Vec<SpaceRow>, sqlx::Error> {
        SqliteStore::spaces(connection).await
    }

    async fn holds_spaces(connection: &mut SqliteConnection) -> Result<bool, sqlx::Error> {
        SqliteStore::holds_spaces(connection).await
    }

    async fn space(
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<Option<SpaceRow>, sqlx::Error> {
        row_event(RowEvent::Read(id.to_owned()));
        SqliteStore::space(connection, id).await
    }

    async fn resources(connection: &mut SqliteConnection) -> Result<Vec<ResourceRow>, sqlx::Error> {
        SqliteStore::resources(connection).await
    }

    async fn resources_of(
        connection: &mut SqliteConnection,
        space_id: &str,
    ) -> Result<Vec<ResourceRow>, sqlx::Error> {
        SqliteStore::resources_of(connection, space_id).await
    }

    async fn insert_space(
        connection: &mut SqliteConnection,
        row: &SpaceRow,
    ) -> Result<(), sqlx::Error> {
        SqliteStore::insert_space(connection, row).await
    }

    async fn update_space(
        connection: &mut SqliteConnection,
        row: &SpaceRow,
    ) -> Result<bool, sqlx::Error> {
        SqliteStore::update_space(connection, row).await
    }

    async fn delete_space(
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<bool, sqlx::Error> {
        SqliteStore::delete_space(connection, id).await
    }

    async fn delete_resources_except(
        connection: &mut SqliteConnection,
        space_id: &str,
        keep: &[&str],
    ) -> Result<(), sqlx::Error> {
        SqliteStore::delete_resources_except(connection, space_id, keep).await
    }

    async fn insert_resource(
        connection: &mut SqliteConnection,
        row: &ResourceRow,
    ) -> Result<(), sqlx::Error> {
        SqliteStore::insert_resource(connection, row).await
    }

    async fn upsert_resource(
        connection: &mut SqliteConnection,
        row: &ResourceRow,
    ) -> Result<String, sqlx::Error> {
        SqliteStore::upsert_resource(connection, row).await
    }

    async fn clear(connection: &mut SqliteConnection) -> Result<(), sqlx::Error> {
        SqliteStore::clear(connection).await
    }

    async fn insert_meta_space_id(
        connection: &mut SqliteConnection,
        id: &str,
    ) -> Result<(), sqlx::Error> {
        SqliteStore::insert_meta_space_id(connection, id).await
    }

    async fn set_exported_revision(
        connection: &mut SqliteConnection,
        id: &str,
        revision: &str,
    ) -> Result<bool, sqlx::Error> {
        SqliteStore::set_exported_revision(connection, id, revision).await
    }

    async fn insert_asset(
        connection: &mut SqliteConnection,
        asset: &StoredAsset,
    ) -> Result<bool, sqlx::Error> {
        SqliteStore::insert_asset(connection, asset).await
    }

    async fn asset(
        connection: &mut SqliteConnection,
        hash: &str,
    ) -> Result<Option<(String, Vec<u8>)>, sqlx::Error> {
        SqliteStore::asset(connection, hash).await
    }

    async fn tables(connection: &mut SqliteConnection) -> Result<Vec<String>, sqlx::Error> {
        SqliteStore::tables(connection).await
    }

    fn file_replaced(&self) -> Option<String> {
        self.inner.file_replaced()
    }

    fn classify(&self, error: &sqlx::Error) -> RepositoryError {
        self.inner.classify(error)
    }

    async fn close(&self) {
        self.inner.close().await;
    }
}

/// A migrated file in a temporary directory of its own.
struct File {
    _directory: tempfile::TempDir,
    path: SqlitePath,
}

async fn migrated() -> File {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("cube.db");
    let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&file)
        .create_if_missing(true)
        .connect()
        .await
        .unwrap();
    let migrations = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations-sql/sqlite");
    sqlx::migrate::Migrator::new(migrations)
        .await
        .unwrap()
        .run(&mut connection)
        .await
        .unwrap();
    sqlx::Connection::close(connection).await.unwrap();
    File {
        path: SqlitePath::from_variable(file.to_str()).unwrap(),
        _directory: directory,
    }
}

/// The scripted repository over `file`, holding the tracked fixture.
async fn seeded(file: &File) -> SqlSpaceRepository<Scripted> {
    let repository = SqlSpaceRepository::over(Scripted {
        inner: SqliteStore::at(&file.path, Duration::from_secs(5)),
        relock_misses: AtomicUsize::new(0),
        prior_revision: Mutex::new(None),
        locks: Mutex::new(Vec::new()),
    });
    import_directory(
        &repository,
        &TokioFilesystem,
        &http_conformance::fixture(),
        &Counted::default(),
    )
    .await
    .unwrap();
    repository.store().locks.lock().unwrap().clear();
    repository
}

/// Record every step an operation reaches into the answer.
fn recording<S>(repository: &SqlSpaceRepository<S>) -> Arc<Mutex<Vec<Step>>> {
    let steps = Arc::new(Mutex::new(Vec::new()));
    let into = Arc::clone(&steps);
    let probe: Probe = Arc::new(move |step| {
        into.lock().unwrap().push(step);
        Box::pin(async {})
    });
    repository.set_probe(Some(probe));
    steps
}

fn space(id: &str) -> SpaceId {
    SpaceId::parse(id).unwrap()
}

fn meta() -> SpaceId {
    space(META)
}

/// The Presentation Space, which has two Maps.
const PRESENTATION: &str = "00000000-0000-4000-8000-000000000060";

/// A commit renaming `loaded` to `title`, at the revision it was read at.
fn rename(loaded: &LoadedSpace, title: &str) -> SpaceCommit {
    let mut snapshot = loaded.snapshot.clone();
    title.clone_into(&mut snapshot.document.title);
    SpaceCommit {
        changes: vec![SpaceChange::Update {
            space_id: snapshot.id,
            snapshot,
            expected_revision: loaded.revision,
        }],
    }
}

/// A single update moving `loaded`'s default Map to its other Map, which
/// moves its snapshot boundary, so the fast path hands it on.
fn move_default_map(loaded: &LoadedSpace) -> SpaceCommit {
    let mut snapshot = loaded.snapshot.clone();
    let other = snapshot
        .document
        .maps
        .as_ref()
        .unwrap()
        .iter()
        .map(|map| map.id)
        .find(|id| Some(*id) != snapshot.document.default_map)
        .unwrap();
    snapshot.document.default_map = Some(other);
    SpaceCommit {
        changes: vec![SpaceChange::Update {
            space_id: snapshot.id,
            snapshot,
            expected_revision: loaded.revision,
        }],
    }
}

async fn loaded(repository: &impl SpaceRepository, id: &str) -> LoadedSpace {
    repository.load_space(space(id)).await.unwrap().unwrap()
}

mod statement_order {
    use super::*;

    #[tokio::test]
    async fn the_fast_path_takes_the_shared_lock_before_its_read_and_locks_the_row() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let before = loaded(&repository, PRESENTATION).await;
        let steps = recording(&repository);
        ROW_EVENTS.with_borrow_mut(Vec::clear);
        let answer = repository.commit(rename(&before, "Renamed")).await.unwrap();
        assert!(
            matches!(answer, CommitResult::Committed { .. }),
            "{answer:?}"
        );
        assert_eq!(
            ROW_EVENTS.with_borrow(|events| events.iter().take(3).cloned().collect::<Vec<_>>()),
            [
                RowEvent::Locked(LockMode::Shared),
                RowEvent::Held(PRESENTATION.to_owned()),
                RowEvent::Read(PRESENTATION.to_owned()),
            ],
            "the shared lock is granted, then the row is held, then the Space is read"
        );
        assert_eq!(
            *steps.lock().unwrap(),
            [
                Step::Locked(LockMode::Shared),
                Step::RowLock(space(PRESENTATION)),
                Step::ResourceReread(space(PRESENTATION)),
            ],
            "the shared lock, then the row lock, then the Resource re-read"
        );
        assert_eq!(
            *repository.store().locks.lock().unwrap(),
            [LockMode::Shared]
        );
    }

    #[tokio::test]
    async fn a_handed_on_update_ends_the_fast_path_before_taking_the_exclusive_lock() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let before = loaded(&repository, PRESENTATION).await;
        let steps = recording(&repository);
        let answer = repository.commit(move_default_map(&before)).await.unwrap();
        assert!(
            matches!(answer, CommitResult::Committed { .. }),
            "{answer:?}"
        );
        assert_eq!(
            *steps.lock().unwrap(),
            [
                Step::Locked(LockMode::Shared),
                Step::HandOff,
                Step::Locked(LockMode::Exclusive),
                Step::MetaRead,
                Step::CompleteRead,
                Step::RowLock(space(PRESENTATION)),
                Step::ResourceReread(space(PRESENTATION)),
            ],
            "the fast path ends before the exclusive lock is asked for"
        );
        assert_eq!(
            *repository.store().locks.lock().unwrap(),
            [LockMode::Shared, LockMode::Exclusive]
        );
    }

    #[tokio::test]
    async fn an_aggregate_commit_takes_the_exclusive_lock_before_the_meta_and_complete_reads() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let first = loaded(&repository, PRESENTATION).await;
        let second = loaded(&repository, "00000000-0000-4000-8000-000000000070").await;
        let steps = recording(&repository);
        let mut commit = rename(&first, "One");
        commit.changes.extend(rename(&second, "Two").changes);
        let answer = repository.commit(commit).await.unwrap();
        assert!(
            matches!(answer, CommitResult::Committed { .. }),
            "{answer:?}"
        );
        assert_eq!(
            steps.lock().unwrap()[..3],
            [
                Step::Locked(LockMode::Exclusive),
                Step::MetaRead,
                Step::CompleteRead
            ],
            "no fast path for two changes"
        );
        assert_eq!(
            *repository.store().locks.lock().unwrap(),
            [LockMode::Exclusive]
        );
    }

    #[tokio::test]
    async fn load_aggregate_and_both_lifecycle_doors_take_the_exclusive_lock() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let steps = recording(&repository);
        let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await.unwrap() else {
            panic!("the fixture is stored");
        };
        assert_eq!(
            *steps.lock().unwrap(),
            [
                Step::Locked(LockMode::Exclusive),
                Step::MetaRead,
                Step::CompleteRead
            ]
        );
        steps.lock().unwrap().clear();
        let input = crate::repository::AggregateInput {
            meta_space_id: aggregate.meta_space_id,
            spaces: aggregate
                .spaces
                .iter()
                .map(|space| space.snapshot.clone())
                .collect(),
        };
        let replaced = repository
            .replace_aggregate(input.clone(), Some(meta()))
            .await
            .unwrap();
        assert!(
            matches!(replaced, ReplaceResult::Replaced(_)),
            "{replaced:?}"
        );
        let recorded = steps.lock().unwrap().clone();
        assert_eq!(
            recorded[..2],
            [Step::Locked(LockMode::Exclusive), Step::MetaRead]
        );
        let row_locks = recorded
            .iter()
            .filter(|step| matches!(step, Step::RowLock(_)))
            .count();
        assert_eq!(row_locks, 4, "every stored row is relocked");
        let truncation = recorded
            .iter()
            .position(|step| *step == Step::Truncation)
            .unwrap();
        assert!(
            recorded[..truncation]
                .iter()
                .filter(|step| matches!(step, Step::RowLock(_)))
                .count()
                == 4,
            "every row is relocked before the truncation"
        );
        steps.lock().unwrap().clear();
        repository.initialize_aggregate(input).await.unwrap();
        assert_eq!(
            steps.lock().unwrap()[..2],
            [Step::Locked(LockMode::Exclusive), Step::MetaRead]
        );
    }

    #[tokio::test]
    async fn the_unlocked_operations_take_no_aggregate_lock() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        repository.list_spaces().await.unwrap();
        repository.load_space(meta()).await.unwrap();
        repository.load_meta_space_id().await.unwrap();
        repository
            .mark_exported(meta(), Revision::FIRST)
            .await
            .unwrap();
        let asset = StoredAsset {
            hash: AssetHash::of(b"bytes"),
            media_type: "text/plain".to_owned(),
            bytes: bytes::Bytes::from_static(b"bytes"),
        };
        repository.store_asset(asset.clone()).await.unwrap();
        repository.load_asset(&asset.hash).await.unwrap();
        assert_eq!(*repository.store().locks.lock().unwrap(), []);
    }
}

mod races {
    use super::*;

    #[tokio::test]
    async fn a_revision_moved_under_the_row_lock_conflicts_with_the_space_read_afresh() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let before = loaded(&repository, PRESENTATION).await;
        *repository.store().prior_revision.lock().unwrap() = Some("7".to_owned());
        let answer = repository.commit(rename(&before, "Lost")).await.unwrap();
        assert_eq!(
            answer,
            CommitResult::Conflict(vec![SpaceConflict {
                space_id: space(PRESENTATION),
                current: Some(before.clone()),
            }]),
            "the Space as stored, read after the rollback"
        );
        assert_eq!(
            loaded(&repository, PRESENTATION).await,
            before,
            "nothing is written"
        );
    }

    #[tokio::test]
    async fn a_meta_row_moved_once_is_locked_again_and_answered() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        repository.store().relock_misses.store(1, Ordering::SeqCst);
        let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await.unwrap() else {
            panic!("the fixture is stored");
        };
        assert_eq!(aggregate.meta_space_id, meta());
    }

    #[tokio::test]
    async fn a_meta_row_moved_twice_is_unreachable() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        repository.store().relock_misses.store(2, Ordering::SeqCst);
        assert_eq!(
            repository.load_aggregate().await,
            Err(RepositoryError::Unavailable(
                "Repository state disappeared while locking it".to_owned()
            ))
        );
    }

    #[tokio::test]
    async fn a_replacement_meeting_a_moved_row_conflicts_with_the_identity_read_afresh() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await.unwrap() else {
            panic!("the fixture is stored");
        };
        let input = crate::repository::AggregateInput {
            meta_space_id: aggregate.meta_space_id,
            spaces: aggregate
                .spaces
                .iter()
                .map(|space| space.snapshot.clone())
                .collect(),
        };
        *repository.store().prior_revision.lock().unwrap() = Some("9".to_owned());
        assert_eq!(
            repository.replace_aggregate(input, Some(meta())).await,
            Ok(ReplaceResult::Conflict {
                current_meta_space_id: Some(meta())
            })
        );
        assert_eq!(
            repository.list_spaces().await.unwrap().len(),
            4,
            "nothing is replaced"
        );
    }
}

/// An operation runs to completion when its caller stops waiting (Q16).
mod dropped_callers {
    use super::*;
    use tokio::sync::Notify;

    /// A probe that stops each operation at `at` until released, telling
    /// the test it got there.
    fn pausing<S>(
        repository: &SqlSpaceRepository<S>,
        at: fn(&Step) -> bool,
    ) -> (Arc<Notify>, Arc<Notify>) {
        let reached = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let (signal, wait) = (Arc::clone(&reached), Arc::clone(&release));
        let probe: Probe = Arc::new(move |step| {
            let (signal, wait) = (Arc::clone(&signal), Arc::clone(&wait));
            Box::pin(async move {
                if at(&step) {
                    signal.notify_one();
                    wait.notified().await;
                }
            })
        });
        repository.set_probe(Some(probe));
        (reached, release)
    }

    async fn dropped_at(at: fn(&Step) -> bool, commit: fn(&LoadedSpace) -> SpaceCommit) {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let before = loaded(&repository, PRESENTATION).await;
        let (reached, release) = pausing(&repository, at);
        {
            let caller = repository.commit(commit(&before));
            tokio::pin!(caller);
            tokio::select! {
                answer = &mut caller => panic!("answered before the pause: {answer:?}"),
                reached = tokio::time::timeout(Duration::from_secs(10), reached.notified()) => {
                    reached.expect("the operation reaches the pause");
                }
            }
            // The caller is dropped here, at the pause.
        }
        repository.set_probe(None);
        release.notify_one();
        let after = tokio::time::timeout(
            Duration::from_secs(10),
            repository.load_space(space(PRESENTATION)),
        )
        .await
        .expect("the next operation is not blocked")
        .unwrap()
        .unwrap();
        assert_eq!(
            after.revision,
            before.revision.next(),
            "the commit landed though its caller was gone"
        );
    }

    #[tokio::test]
    async fn at_the_fast_paths_row_lock() {
        dropped_at(
            |step| matches!(step, Step::RowLock(_)),
            |space| rename(space, "Landed"),
        )
        .await;
    }

    #[tokio::test]
    async fn at_the_hand_off() {
        dropped_at(|step| *step == Step::HandOff, move_default_map).await;
    }

    #[tokio::test]
    async fn at_the_meta_read() {
        dropped_at(|step| *step == Step::MetaRead, move_default_map).await;
    }

    #[tokio::test]
    async fn at_the_resource_reread() {
        dropped_at(
            |step| matches!(step, Step::ResourceReread(_)),
            |space| rename(space, "Landed"),
        )
        .await;
    }

    #[tokio::test]
    async fn at_the_complete_read() {
        dropped_at(|step| *step == Step::CompleteRead, move_default_map).await;
    }

    #[tokio::test]
    async fn at_the_replacements_truncation() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await.unwrap() else {
            panic!("the fixture is stored");
        };
        let spaces = aggregate
            .spaces
            .iter()
            .map(|stored| {
                let mut snapshot = stored.snapshot.clone();
                if snapshot.id == space(PRESENTATION) {
                    "Replaced".clone_into(&mut snapshot.document.title);
                }
                snapshot
            })
            .collect();
        let input = crate::repository::AggregateInput {
            meta_space_id: aggregate.meta_space_id,
            spaces,
        };
        let (reached, release) = pausing(&repository, |step| *step == Step::Truncation);
        {
            let caller = repository.replace_aggregate(input, Some(meta()));
            tokio::pin!(caller);
            tokio::select! {
                answer = &mut caller => panic!("answered before the pause: {answer:?}"),
                reached = tokio::time::timeout(Duration::from_secs(10), reached.notified()) => {
                    reached.expect("the operation reaches the pause");
                }
            }
            // The caller is dropped here, at the pause.
        }
        repository.set_probe(None);
        release.notify_one();
        let after = tokio::time::timeout(
            Duration::from_secs(10),
            repository.load_space(space(PRESENTATION)),
        )
        .await
        .expect("the next operation is not blocked")
        .unwrap()
        .unwrap();
        assert_eq!(
            after.snapshot.document.title, "Replaced",
            "the replacement landed though its caller was gone"
        );
        assert_eq!(
            repository.list_spaces().await.unwrap().len(),
            4,
            "the replacement is whole"
        );
    }
}

/// Closing waits for every operation under way, including one spawned that
/// has not started yet.
mod closing {
    use super::*;
    use std::future::Future as _;
    use std::task::Poll;

    #[tokio::test]
    async fn waits_for_an_operation_spawned_but_not_yet_started() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let before = loaded(&repository, PRESENTATION).await;
        {
            let caller = repository.commit(rename(&before, "Landed"));
            tokio::pin!(caller);
            // One poll spawns the operation; on this test's one thread the
            // spawned task cannot start before the caller is dropped.
            std::future::poll_fn(|context| {
                assert!(
                    caller.as_mut().poll(context).is_pending(),
                    "the commit waits for its task"
                );
                Poll::Ready(())
            })
            .await;
        }
        tokio::time::timeout(Duration::from_secs(10), repository.close_store())
            .await
            .expect("closing finishes");
        let reopened =
            SqlSpaceRepository::over(SqliteStore::at(&file.path, Duration::from_secs(5)));
        let after = loaded(&reopened, PRESENTATION).await;
        assert_eq!(
            after.revision,
            before.revision.next(),
            "the commit landed before the store closed"
        );
    }
}

/// SQLite's row lock finds its row by the primary key's index, byte for
/// byte, in the id's own storage class.
mod sqlite_row_lock {
    use super::super::sqlite::{LOCK_BLOB_SPACE, LOCK_TEXT_SPACE};
    use super::*;
    use sqlx::Row as _;

    async fn connection(file: &File) -> SqliteConnection {
        sqlx::sqlite::SqliteConnectOptions::new()
            .filename(file.path.as_path())
            .connect()
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn searches_the_primary_key_rather_than_scanning_every_space() {
        let file = migrated().await;
        let mut connection = connection(&file).await;
        for statement in [LOCK_TEXT_SPACE, LOCK_BLOB_SPACE] {
            // The statement is this crate's own constant, not input.
            let plan = sqlx::query(sqlx::AssertSqlSafe(format!(
                "EXPLAIN QUERY PLAN {statement}"
            )))
            .bind(META.as_bytes())
            .fetch_all(&mut connection)
            .await
            .unwrap()
            .iter()
            .map(|row| row.get::<String, _>("detail"))
            .collect::<Vec<_>>();
            assert!(
                plan.iter().all(|detail| !detail.starts_with("SCAN")),
                "{statement} scans: {plan:?}"
            );
            assert!(
                plan.iter()
                    .any(|detail| detail.contains("USING") && detail.contains("INDEX")),
                "{statement} uses no index: {plan:?}"
            );
        }
    }

    #[tokio::test]
    async fn finds_an_id_only_in_its_own_storage_class_and_its_own_case() {
        let file = migrated().await;
        let store = SqliteStore::at(&file.path, Duration::from_secs(5));
        let mut connection = connection(&file).await;
        sqlx::query(
            "INSERT INTO spaces (document, id, revision, updated_at) VALUES \
             ('{}', 'abc', '1', 'now'), ('{}', CAST('xyz' AS BLOB), '2', 'now'), \
             ('{}', 'dup', '3', 'now'), ('{}', CAST('dup' AS BLOB), '4', 'now')",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        for (id, storage, expected) in [
            (&b"abc"[..], IdStorage::Text, Some(b"1".to_vec())),
            (b"abc", IdStorage::Blob, None),
            (b"ABC", IdStorage::Text, None),
            (b"xyz", IdStorage::Blob, Some(b"2".to_vec())),
            (b"xyz", IdStorage::Text, None),
            (b"XYZ", IdStorage::Blob, None),
            (b"dup", IdStorage::Text, Some(b"3".to_vec())),
            (b"dup", IdStorage::Blob, Some(b"4".to_vec())),
        ] {
            assert_eq!(
                store
                    .lock_space(&mut connection, id, storage)
                    .await
                    .unwrap(),
                expected,
                "{} stored as {storage:?}",
                String::from_utf8_lossy(id)
            );
        }
        store.close().await;
    }

    // A TEXT id and a BLOB id with the same bytes are two rows; replacement
    // replaces stored state whether or not it can be read (ADR 0094), so it
    // locks each row by its own storage class rather than meeting the
    // other's revision and conflicting with no writer about.
    #[tokio::test]
    async fn a_replacement_locks_a_text_id_and_a_blob_id_with_the_same_bytes_apart() {
        let file = migrated().await;
        let repository = seeded(&file).await;
        let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await.unwrap() else {
            panic!("the fixture is stored");
        };
        let input = crate::repository::AggregateInput {
            meta_space_id: aggregate.meta_space_id,
            spaces: aggregate
                .spaces
                .iter()
                .map(|space| space.snapshot.clone())
                .collect(),
        };
        let mut connection = connection(&file).await;
        sqlx::query(
            "INSERT INTO spaces (document, id, revision, updated_at) \
             VALUES ('{}', CAST($1 AS BLOB), '7', 'now')",
        )
        .bind(PRESENTATION)
        .execute(&mut connection)
        .await
        .unwrap();
        sqlx::Connection::close(connection).await.unwrap();
        assert!(
            matches!(
                repository.replace_aggregate(input, Some(meta())).await,
                Ok(ReplaceResult::Replaced(_))
            ),
            "both rows are locked and replaced"
        );
        assert_eq!(
            repository.list_spaces().await.unwrap().len(),
            4,
            "the BLOB row is replaced with the rest"
        );
    }
}
