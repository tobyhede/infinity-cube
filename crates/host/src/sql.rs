//! The one SQL repository (Storage ST-3, `src/persistence/sql-space-repository.ts`):
//! every [`SpaceRepository`] method written once, over a database's own small
//! store of statements ([`SqlStore`]), deciding each commit by the same
//! [`decide_commit`] the memory store does. SQLite's statements are
//! [`SqliteStore`]; a second database adds a second store, not a second
//! repository.
//!
//! The repository runs the TypeScript PostgreSQL protocol (ADR 0177): an
//! aggregate lock taken first in every locking transaction, exclusive for an
//! aggregate commit, `load_aggregate` and both lifecycle doors and shared for
//! the single-Space fast path; the fast path and the aggregate decision in
//! separate transactions; a Space's revision re-read under its row lock; the
//! Meta row relocked, once more if a replacement moved it. A store whose
//! database has one writer, SQLite, also runs its operations one at a time in
//! the process ([`SqlStore::SERIAL`], ST-127), and its aggregate lock is the
//! write lock its transaction already holds.
//!
//! Each operation runs in a task of its own, which owns its connection, so a
//! caller that stops waiting (a request whose client went away) stops only
//! the wait, never an operation part-way between its two transactions.

mod codec;
mod database_url;
mod path;
mod postgres;
mod sqlite;
#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::future::Future;
use std::sync::Arc;

use intake::{SpaceId, SpaceSnapshot, load_aggregate};
use sqlx::{Database, Transaction};

use crate::assets::{AssetHash, StoredAsset};
use crate::commit::{
    CommitDecision, SingleSpaceDecision, decide_commit, decide_single_space, request_refusal,
    single_update_space,
};
use crate::repository::{
    AggregateInput, AggregateLoad, AssetStored, CommitResult, InitializeResult, LoadedAggregate,
    LoadedSpace, ReplaceResult, RepositoryError, Revision, SpaceChange, SpaceCommit, SpaceConflict,
    SpaceRepository, SpaceSummary, authored, checked_input,
};
use codec::{
    ResourceRow, SpaceRow, decode_revision, decode_space, decode_title, encode_revision,
    encode_space, same_document,
};

pub use database_url::{DATABASE_URL, DatabaseUrl, DatabaseUrlError, nearest_env_file};
pub use path::{SqlitePath, SqlitePathError};
pub use postgres::{
    AGGREGATE_LOCK_KEY, PoolSettings, PostgresSpaceRepository, PostgresStore, PostgresUrlError,
    classify as classify_postgres, connect_options as postgres_connect_options,
};
pub use sqlite::{ConnectionSettings, SqliteSpaceRepository, SqliteStore};

/// A connection of `S`'s database, as a transaction lends it.
type Connection<S> = <<S as SqlStore>::Database as Database>::Connection;

/// How a transaction begins, which the store maps to its database's own
/// `BEGIN`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Access {
    /// Reads of more than one statement taking no aggregate lock, which see
    /// one snapshot.
    Read,
    /// A write taking no aggregate lock.
    Write,
    /// A transaction that takes the aggregate lock, and writes if `writes`.
    Locked {
        /// Whether it may write.
        writes: bool,
    },
}

/// The mode an operation holds the aggregate lock in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockMode {
    /// Held by fast paths together, waiting for and waited on by an
    /// exclusive holder.
    Shared,
    /// Held alone.
    Exclusive,
}

/// A point an operation reaches, at which a test may pause or observe it
/// ([`SqlSpaceRepository::set_probe`], behind the `test-support` feature).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// The aggregate lock was taken in this mode.
    Locked(LockMode),
    /// About to read the Meta identity under the exclusive lock.
    MetaRead,
    /// About to read every stored Space.
    CompleteRead,
    /// About to take this Space's row lock.
    RowLock(SpaceId),
    /// Holding this Space's row lock, about to read its Resource rows again.
    ResourceReread(SpaceId),
    /// Read this Space's row in a read of one Space, about to read its
    /// Resource rows.
    SpaceRead(SpaceId),
    /// About to empty the store for an initialization or a replacement.
    Truncation,
    /// The fast path's transaction has ended, and the aggregate decision's
    /// has not begun.
    HandOff,
}

/// What a test runs at each [`Step`]; the operation waits for its answer.
#[cfg(any(test, feature = "test-support"))]
pub type Probe =
    Arc<dyn Fn(Step) -> std::pin::Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;

/// What a database supplies the one SQL repository: how to open a
/// transaction, each statement the repository runs, and what a failure means.
/// Each statement runs on the connection of the transaction the repository
/// opened, and none decides anything.
pub(crate) trait SqlStore: Send + Sync + 'static {
    /// The `sqlx` database.
    type Database: Database;

    /// Whether the repository runs this store's operations one at a time in
    /// the process.
    const SERIAL: bool;

    /// A transaction begun as `access` asks.
    fn begin(
        &self,
        access: Access,
    ) -> impl Future<Output = Result<Transaction<'static, Self::Database>, sqlx::Error>> + Send;

    /// Take the aggregate lock in `mode` for the rest of the transaction, as
    /// its first statement.
    fn lock_aggregate(
        &self,
        connection: &mut Connection<Self>,
        mode: LockMode,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Lock the Meta identity's row if it still names `id`, answering
    /// whether it does.
    fn relock_meta(
        &self,
        connection: &mut Connection<Self>,
        id: &str,
    ) -> impl Future<Output = Result<bool, sqlx::Error>> + Send;

    /// Lock one Space's row, answering the revision it carried when the lock
    /// was granted, or `None` when there is no such row.
    fn lock_space(
        &self,
        connection: &mut Connection<Self>,
        id: &str,
    ) -> impl Future<Output = Result<Option<String>, sqlx::Error>> + Send;

    /// Every Space row's id and revision, ascending by id, reading no
    /// document.
    fn space_revisions(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Vec<(String, String)>, sqlx::Error>> + Send;

    /// The stored Meta identity, as text.
    fn meta_space_id(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Option<String>, sqlx::Error>> + Send;

    /// Every Space row, ascending by id.
    fn spaces(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Vec<SpaceRow>, sqlx::Error>> + Send;

    /// Whether any Space row is stored, reading no document.
    fn holds_spaces(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<bool, sqlx::Error>> + Send;

    /// The Space row with this id.
    fn space(
        connection: &mut Connection<Self>,
        id: &str,
    ) -> impl Future<Output = Result<Option<SpaceRow>, sqlx::Error>> + Send;

    /// Every Resource row, ascending by id.
    fn resources(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Vec<ResourceRow>, sqlx::Error>> + Send;

    /// The Resource rows of one Space, ascending by id.
    fn resources_of(
        connection: &mut Connection<Self>,
        space_id: &str,
    ) -> impl Future<Output = Result<Vec<ResourceRow>, sqlx::Error>> + Send;

    /// Insert a Space row, failing on a row already holding its id.
    fn insert_space(
        connection: &mut Connection<Self>,
        row: &SpaceRow,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Overwrite the document and revision of the Space row with its id,
    /// keeping its exported revision, answering whether there was one.
    fn update_space(
        connection: &mut Connection<Self>,
        row: &SpaceRow,
    ) -> impl Future<Output = Result<bool, sqlx::Error>> + Send;

    /// Delete a Space row and its Resource rows, answering whether a Space
    /// row was removed.
    fn delete_space(
        connection: &mut Connection<Self>,
        id: &str,
    ) -> impl Future<Output = Result<bool, sqlx::Error>> + Send;

    /// Delete every Resource row of one Space whose id `keep` does not name
    /// (`deleteExcept`).
    fn delete_resources_except(
        connection: &mut Connection<Self>,
        space_id: &str,
        keep: &[&str],
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Insert a Resource row.
    fn insert_resource(
        connection: &mut Connection<Self>,
        row: &ResourceRow,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Insert a Resource row, or overwrite the document of the one with its
    /// id, keeping when that row was created and which Space owns it
    /// (`upsert`), answering the id of the Space that owns the row now.
    fn upsert_resource(
        connection: &mut Connection<Self>,
        row: &ResourceRow,
    ) -> impl Future<Output = Result<String, sqlx::Error>> + Send;

    /// Delete the Meta identity, every Resource row and every Space row.
    fn clear(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Store the Meta identity.
    fn insert_meta_space_id(
        connection: &mut Connection<Self>,
        id: &str,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Set one Space's exported revision, answering whether a row held it.
    fn set_exported_revision(
        connection: &mut Connection<Self>,
        id: &str,
        revision: &str,
    ) -> impl Future<Output = Result<bool, sqlx::Error>> + Send;

    /// Insert an asset unless its hash is stored, answering whether it was inserted.
    fn insert_asset(
        connection: &mut Connection<Self>,
        asset: &StoredAsset,
    ) -> impl Future<Output = Result<bool, sqlx::Error>> + Send;

    /// The media type and bytes stored under a hash.
    fn asset(
        connection: &mut Connection<Self>,
        hash: &str,
    ) -> impl Future<Output = Result<Option<(String, Vec<u8>)>, sqlx::Error>> + Send;

    /// The name of every table the database holds.
    fn tables(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Vec<String>, sqlx::Error>> + Send;

    /// Why the database is no longer the one first opened, if it is not: its
    /// file was replaced or deleted. Asked before each operation, which then
    /// reads and writes nothing.
    fn file_replaced(&self) -> Option<String>;

    /// What a failure of this database means to a caller.
    fn classify(&self, error: &sqlx::Error) -> RepositoryError;

    /// Close every connection, once those lent out are returned.
    fn close(&self) -> impl Future<Output = ()> + Send;
}

/// The tables a migrated database holds, every one of which each operation
/// needs: a database missing any is broken stored state, however few it
/// reads (ST-7).
const TABLES: [&str; 4] = ["spaces", "resources", "repository_state", "assets"];

/// The one SQL repository over the store of statements `S`.
///
/// A database's own repository is this over its store: SQLite's is
/// [`SqliteSpaceRepository`].
#[derive(Debug)]
pub struct SqlSpaceRepository<S> {
    shared: Arc<Shared<S>>,
    // Each operation holds it while it runs: shared, or exclusive for a
    // store that runs one at a time. `close` takes it exclusively, so it
    // waits for every operation under way.
    gate: Arc<tokio::sync::RwLock<()>>,
}

/// What an operation's task owns of its repository.
struct Shared<S> {
    store: S,
    #[cfg(any(test, feature = "test-support"))]
    probe: std::sync::Mutex<Option<Probe>>,
}

impl<S: std::fmt::Debug> std::fmt::Debug for Shared<S> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Shared")
            .field("store", &self.store)
            .finish_non_exhaustive()
    }
}

/// Why an operation failed: the database, rows that cannot be read, or an
/// answer decided before the database was asked.
enum Failure {
    Database(sqlx::Error),
    Broken(String),
    Answered(RepositoryError),
}

impl From<sqlx::Error> for Failure {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

type Outcome<T> = Result<T, Failure>;

fn broken(message: impl Into<String>) -> Failure {
    Failure::Broken(message.into())
}

/// Why a decided commit's write did not land: a row it met that a writer
/// outside the decision changed.
enum Landing {
    /// Refused in these words.
    Refused(String),
    /// This Space's row did not carry the revision the commit expected once
    /// its row lock was granted.
    Stale(SpaceId),
}

impl<S> SqlSpaceRepository<S> {
    pub(crate) fn over(store: S) -> Self {
        Self {
            shared: Arc::new(Shared {
                store,
                #[cfg(any(test, feature = "test-support"))]
                probe: std::sync::Mutex::new(None),
            }),
            gate: Arc::new(tokio::sync::RwLock::new(())),
        }
    }

    pub(crate) fn store(&self) -> &S {
        &self.shared.store
    }

    /// Run `read` alone, holding the gate exclusively.
    pub(crate) async fn alone<T>(&self, read: impl Future<Output = T>) -> T {
        let _alone = self.gate.write().await;
        read.await
    }

    /// Run `step` at every [`Step`] each later operation reaches, or nothing
    /// when `None`.
    #[cfg(any(test, feature = "test-support"))]
    pub fn set_probe(&self, probe: Option<Probe>) {
        *self
            .shared
            .probe
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = probe;
    }
}

impl<S> SqlSpaceRepository<S> {
    /// Close the database once every operation under way has finished.
    pub(crate) async fn close_store(&self)
    where
        S: SqlStore,
    {
        let _alone = self.gate.write().await;
        self.shared.store.close().await;
    }

    /// Run `operation` in a task of its own, holding the gate as the store
    /// asks, and name a failure by [`SqlStore::classify`]. Dropping the
    /// returned future stops only the wait for its answer.
    async fn run<T, F, Fut>(&self, operation: F) -> Result<T, RepositoryError>
    where
        S: SqlStore,
        T: Send + 'static,
        F: FnOnce(Arc<Shared<S>>) -> Fut + Send + 'static,
        Fut: Future<Output = Outcome<T>> + Send + 'static,
    {
        let shared = Arc::clone(&self.shared);
        let gate = Arc::clone(&self.gate);
        let task = tokio::spawn(async move {
            let _held: Box<dyn Send> = if S::SERIAL {
                Box::new(gate.write_owned().await)
            } else {
                Box::new(gate.read_owned().await)
            };
            let naming = Arc::clone(&shared);
            operation(shared)
                .await
                .map_err(|failure| naming.name(failure))
        });
        task.await.unwrap_or_else(|stopped| {
            Err(RepositoryError::Unclassified(format!(
                "the operation stopped: {stopped}"
            )))
        })
    }
}

impl<S: SqlStore> Shared<S> {
    fn name(&self, failure: Failure) -> RepositoryError {
        match failure {
            Failure::Database(error) => self.store.classify(&error),
            Failure::Broken(message) => RepositoryError::BrokenStoredState(message),
            Failure::Answered(error) => error,
        }
    }

    /// Wait for the test's probe at `step`, if it set one.
    async fn reached(&self, step: Step) {
        #[cfg(any(test, feature = "test-support"))]
        {
            let probe = self
                .probe
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone();
            if let Some(probe) = probe {
                probe(step).await;
            }
        }
        #[cfg(not(any(test, feature = "test-support")))]
        let _ = step;
    }

    /// A transaction begun as `access` asks, over the file first opened,
    /// holding every table.
    async fn begin(&self, access: Access) -> Outcome<Transaction<'static, S::Database>> {
        if let Some(reason) = self.store.file_replaced() {
            return Err(Failure::Answered(RepositoryError::Unavailable(reason)));
        }
        let mut transaction = self.store.begin(access).await?;
        every_table::<S>(&mut transaction).await?;
        Ok(transaction)
    }

    /// A transaction holding the aggregate lock in `mode`, taken as its first
    /// statement.
    async fn begin_locked(
        &self,
        mode: LockMode,
        writes: bool,
    ) -> Outcome<Transaction<'static, S::Database>> {
        if let Some(reason) = self.store.file_replaced() {
            return Err(Failure::Answered(RepositoryError::Unavailable(reason)));
        }
        let mut transaction = self.store.begin(Access::Locked { writes }).await?;
        self.store.lock_aggregate(&mut transaction, mode).await?;
        self.reached(Step::Locked(mode)).await;
        every_table::<S>(&mut transaction).await?;
        Ok(transaction)
    }

    /// The stored Meta identity, its row locked (`#lockMetaIdentity`): read
    /// again once if a replacement moved it between the read and the lock,
    /// answering the identity the second read locks, and Unreachable if it
    /// moved again.
    async fn lock_meta_identity(&self, connection: &mut Connection<S>) -> Outcome<Option<SpaceId>> {
        self.reached(Step::MetaRead).await;
        for _ in 0..2 {
            let Some(meta_space_id) = stored_meta_space_id::<S>(connection).await? else {
                return Ok(None);
            };
            if self
                .store
                .relock_meta(connection, meta_space_id.as_str())
                .await?
            {
                return Ok(Some(meta_space_id));
            }
        }
        Err(Failure::Answered(RepositoryError::Unavailable(
            "Repository state disappeared while locking it".to_owned(),
        )))
    }

    /// Every stored Space, decoded, ascending by id.
    async fn every_space(&self, connection: &mut Connection<S>) -> Outcome<Vec<LoadedSpace>> {
        self.reached(Step::CompleteRead).await;
        every_space::<S>(connection).await
    }

    /// The stored aggregate, checked by intake (`#authoritativeAggregate`).
    async fn authoritative(
        &self,
        connection: &mut Connection<S>,
        meta_space_id: SpaceId,
    ) -> Outcome<LoadedAggregate> {
        let spaces = self.every_space(connection).await?;
        load_aggregate(meta_space_id, spaces.iter().map(|space| &space.snapshot))
            .map_err(|_| broken("the stored aggregate violates Meta invariants"))?;
        Ok(LoadedAggregate {
            meta_space_id,
            spaces,
        })
    }

    /// One Space read afresh in a transaction of its own, as a conflict
    /// answers it once the commit's transaction has rolled back.
    async fn read_space(&self, id: SpaceId) -> Outcome<Option<LoadedSpace>> {
        let mut transaction = self.begin(Access::Read).await?;
        let Some(row) = S::space(&mut transaction, id.as_str()).await? else {
            transaction.commit().await?;
            return Ok(None);
        };
        self.reached(Step::SpaceRead(id)).await;
        let resources = S::resources_of(&mut transaction, id.as_str()).await?;
        transaction.commit().await?;
        let owned: Vec<&ResourceRow> = resources.iter().collect();
        decode_space(&row, &owned)
            .map(Some)
            .map_err(Failure::Broken)
    }

    /// The Meta identity read afresh in a transaction of its own.
    async fn read_meta_space_id(&self) -> Outcome<Option<SpaceId>> {
        let mut transaction = self.begin(Access::Read).await?;
        let meta_space_id = stored_meta_space_id::<S>(&mut transaction).await;
        transaction.commit().await?;
        meta_space_id
    }

    /// Empty the store and write `input` as the whole aggregate.
    async fn install(
        &self,
        connection: &mut Connection<S>,
        input: AggregateInput,
    ) -> Outcome<LoadedAggregate> {
        self.reached(Step::Truncation).await;
        S::clear(connection).await?;
        let mut spaces: Vec<LoadedSpace> = input
            .spaces
            .into_iter()
            .map(|snapshot| LoadedSpace {
                snapshot,
                revision: Revision::FIRST,
                exported_revision: None,
            })
            .collect();
        spaces.sort_by_key(|space| space.snapshot.id);
        for space in &spaces {
            let (row, resources) = encode_space(space);
            S::insert_space(connection, &row).await?;
            for resource in &resources {
                S::insert_resource(connection, resource).await?;
            }
        }
        S::insert_meta_space_id(connection, input.meta_space_id.as_str()).await?;
        self.authoritative(connection, input.meta_space_id).await
    }

    /// Remove `deleted` and write `written` as a commit leaves them: every
    /// deleted Space first; then each updated Space's row locked, failing
    /// the commit as stale unless it carries the revision the commit
    /// expected; then the Resources each updated Space drops, every one's
    /// before any is written, so a Resource one Space releases and another
    /// takes is never held twice; then each Space in the order `written`
    /// holds them, a created one inserted with every Resource row it holds
    /// and an updated one's row written with only the Resource rows it adds
    /// or changes, judged against its rows read again under the row lock. A
    /// deleted or updated Space with no row fails the commit, and a Resource
    /// row a created or updated Space meets owned by another Space refuses
    /// it.
    async fn write_changes(
        &self,
        connection: &mut Connection<S>,
        request: &SpaceCommit,
        deleted: &[SpaceId],
        written: &[LoadedSpace],
    ) -> Outcome<Result<(), Landing>> {
        for id in deleted {
            if !S::delete_space(connection, id.as_str()).await? {
                return Err(vanished(format!("Space {id} disappeared during commit")));
            }
        }
        let mut expected: BTreeMap<SpaceId, Revision> = BTreeMap::new();
        let mut created: Vec<SpaceId> = Vec::new();
        for change in &request.changes {
            match change {
                SpaceChange::Create { .. } => created.push(change.space_id()),
                SpaceChange::Update {
                    space_id,
                    expected_revision,
                    ..
                } => {
                    expected.insert(*space_id, *expected_revision);
                }
                SpaceChange::Delete { .. } => {}
            }
        }
        let encoded: Vec<_> = written
            .iter()
            .map(|space| {
                let id = space.snapshot.id;
                (id, created.contains(&id), encode_space(space))
            })
            .collect();
        for (id, _, _) in encoded.iter().filter(|(_, created, _)| !created) {
            self.reached(Step::RowLock(*id)).await;
            let prior = self.store.lock_space(connection, id.as_str()).await?;
            let prior = match prior {
                None => None,
                Some(text) => Some(decode_revision(&text).ok_or_else(|| {
                    broken(format!(
                        "stored Space {id} has a revision that is not canonical"
                    ))
                })?),
            };
            if prior.is_none() || prior != expected.get(id).copied() {
                return Ok(Err(Landing::Stale(*id)));
            }
        }
        for (_, _, (row, resources)) in encoded.iter().filter(|(_, created, _)| !created) {
            let keep: Vec<&str> = resources
                .iter()
                .map(|resource| resource.id.as_str())
                .collect();
            S::delete_resources_except(connection, &row.id, &keep).await?;
        }
        for (id, created, (row, resources)) in &encoded {
            let written = if *created {
                write_created::<S>(connection, row, resources).await?
            } else {
                self.write_updated(connection, *id, row, resources).await?
            };
            if let Err(refused) = written {
                return Ok(Err(refused));
            }
        }
        Ok(Ok(()))
    }

    /// Write an updated Space's row and the Resource rows it adds or
    /// changes, judged against its Resource rows read again under its row
    /// lock, refusing a Resource row another Space owns.
    async fn write_updated(
        &self,
        connection: &mut Connection<S>,
        id: SpaceId,
        row: &SpaceRow,
        resources: &[ResourceRow],
    ) -> Outcome<Result<(), Landing>> {
        if !S::update_space(connection, row).await? {
            return Err(vanished(format!(
                "Space {} disappeared under its row lock",
                row.id
            )));
        }
        self.reached(Step::ResourceReread(id)).await;
        let stored: BTreeMap<String, String> = S::resources_of(connection, &row.id)
            .await?
            .into_iter()
            .map(|resource| (resource.id, resource.document))
            .collect();
        for resource in resources {
            let unchanged = stored
                .get(&resource.id)
                .is_some_and(|document| same_document(document, &resource.document));
            if unchanged {
                continue;
            }
            let owner = S::upsert_resource(connection, resource).await?;
            if owner != row.id {
                return Ok(Err(Landing::Refused(format!(
                    "Resource {} belongs to space {owner}, not {}",
                    resource.id, row.id
                ))));
            }
        }
        Ok(Ok(()))
    }

    /// Write a decided commit's changes and end `transaction`: committed with
    /// `result` answered, or rolled back with the refusal the write met, or
    /// with a conflict carrying the stale Space read afresh after the
    /// rollback (`StaleSpaceRevisionError`).
    async fn land(
        &self,
        mut transaction: Transaction<'static, S::Database>,
        request: &SpaceCommit,
        deleted: &[SpaceId],
        written: &[LoadedSpace],
        result: CommitResult,
    ) -> Outcome<CommitResult> {
        match self
            .write_changes(&mut transaction, request, deleted, written)
            .await?
        {
            Ok(()) => {
                transaction.commit().await?;
                Ok(result)
            }
            Err(Landing::Refused(message)) => {
                transaction.rollback().await?;
                Ok(CommitResult::Rejected { message })
            }
            Err(Landing::Stale(space_id)) => {
                transaction.rollback().await?;
                let current = self.read_space(space_id).await?;
                Ok(CommitResult::Conflict(vec![SpaceConflict {
                    space_id,
                    current,
                }]))
            }
        }
    }

    /// `commit`'s fast path (`#commitTopologyPreservingUpdate`): a single
    /// update decided against its own Space under the shared aggregate lock,
    /// in a transaction of its own, answering `None` to hand the commit to
    /// the aggregate decision having written nothing.
    async fn fast_path(
        &self,
        request: &SpaceCommit,
        space_id: SpaceId,
    ) -> Outcome<Option<CommitResult>> {
        let mut transaction = self.begin_locked(LockMode::Shared, true).await?;
        let current = one_space::<S>(&mut transaction, space_id).await?;
        let meta_space_id = stored_meta_space_id::<S>(&mut transaction).await?;
        match decide_single_space(request, meta_space_id, current.as_ref()) {
            SingleSpaceDecision::Answer(result) => {
                transaction.rollback().await?;
                Ok(Some(result))
            }
            SingleSpaceDecision::Fail(failure) => {
                transaction.rollback().await?;
                Err(Failure::Answered(failure))
            }
            SingleSpaceDecision::Aggregate => {
                transaction.rollback().await?;
                Ok(None)
            }
            SingleSpaceDecision::Write { result, written } => self
                .land(transaction, request, &[], &[written], result)
                .await
                .map(Some),
        }
    }

    /// `commit`'s complete decision, under the exclusive aggregate lock.
    async fn aggregate_commit(&self, request: &SpaceCommit) -> Outcome<CommitResult> {
        let mut transaction = self.begin_locked(LockMode::Exclusive, true).await?;
        let meta_space_id = self.lock_meta_identity(&mut transaction).await?;
        let stored = self.every_space(&mut transaction).await?;
        match decide_commit(request, meta_space_id, stored.iter()) {
            CommitDecision::Answer(result) => {
                transaction.rollback().await?;
                Ok(result)
            }
            CommitDecision::Fail(failure) => {
                transaction.rollback().await?;
                Err(Failure::Answered(failure))
            }
            CommitDecision::Write {
                result,
                written,
                deleted,
            } => {
                self.land(transaction, request, &deleted, &written, result)
                    .await
            }
        }
    }

    async fn commit(&self, request: SpaceCommit) -> Outcome<CommitResult> {
        // A single update is decided against its own Space first, reading no
        // other (`#commitTopologyPreservingUpdate`), so another stored Space
        // that cannot be read does not fail it.
        if let Some(space_id) = single_update_space(&request) {
            if let Some(answer) = self.fast_path(&request, space_id).await? {
                return Ok(answer);
            }
            self.reached(Step::HandOff).await;
        }
        self.aggregate_commit(&request).await
    }

    async fn load_aggregate(&self) -> Outcome<AggregateLoad> {
        let mut transaction = self.begin_locked(LockMode::Exclusive, false).await?;
        let loaded = match self.lock_meta_identity(&mut transaction).await? {
            Some(meta_space_id) => {
                AggregateLoad::Loaded(self.authoritative(&mut transaction, meta_space_id).await?)
            }
            None if S::holds_spaces(&mut transaction).await? => {
                return Err(broken("stored Spaces exist without a Meta Space"));
            }
            None => AggregateLoad::Uninitialized,
        };
        transaction.commit().await?;
        Ok(loaded)
    }

    async fn initialize(&self, input: AggregateInput) -> Outcome<InitializeResult> {
        let attempt = async {
            let mut transaction = self.begin_locked(LockMode::Exclusive, true).await?;
            if let Some(meta_space_id) = self.lock_meta_identity(&mut transaction).await? {
                let existing = self.authoritative(&mut transaction, meta_space_id).await?;
                transaction.rollback().await?;
                return Ok(classify_initialized(&input, existing));
            }
            if S::holds_spaces(&mut transaction).await? {
                return Err(broken("stored Spaces exist without a Meta Space"));
            }
            let installed = self.install(&mut transaction, input.clone()).await?;
            transaction.commit().await?;
            Ok(InitializeResult::Initialized(installed))
        };
        match attempt.await {
            // State a writer outside the aggregate lock established collided
            // with this one; it is read after the rollback and classified.
            Err(Failure::Database(error)) if unique_violation(&error) => {
                match self.load_aggregate().await? {
                    AggregateLoad::Uninitialized => Err(Failure::Database(error)),
                    AggregateLoad::Loaded(existing) => Ok(classify_initialized(&input, existing)),
                }
            }
            answered => answered,
        }
    }

    async fn replace(
        &self,
        input: AggregateInput,
        expected_meta_space_id: Option<SpaceId>,
    ) -> Outcome<ReplaceResult> {
        let mut transaction = self.begin_locked(LockMode::Exclusive, true).await?;
        let meta_space_id = self.lock_meta_identity(&mut transaction).await?;
        // No document is read: replacement replaces stored state whether or
        // not it can be read (ADR 0094). In id order, so two replacements
        // take the row locks below in the same order.
        let rows = S::space_revisions(&mut transaction).await?;
        if meta_space_id.is_none() && rows.is_empty() {
            transaction.rollback().await?;
            return Ok(ReplaceResult::Uninitialized);
        }
        if meta_space_id != expected_meta_space_id {
            transaction.rollback().await?;
            return Ok(ReplaceResult::Conflict {
                current_meta_space_id: meta_space_id,
            });
        }
        for (id, revision) in &rows {
            if let Some(space_id) = SpaceId::parse(id) {
                self.reached(Step::RowLock(space_id)).await;
            }
            let current = self.store.lock_space(&mut transaction, id).await?;
            if current.as_ref() != Some(revision) {
                transaction.rollback().await?;
                return Ok(ReplaceResult::Conflict {
                    current_meta_space_id: self.read_meta_space_id().await?,
                });
            }
        }
        let installed = self.install(&mut transaction, input).await?;
        transaction.commit().await?;
        Ok(ReplaceResult::Replaced(installed))
    }
}

/// Whether `error` is a unique or primary-key violation.
fn unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .is_some_and(|database| database.is_unique_violation())
}

/// What initialization answers when an aggregate is already stored: the
/// same authored meaning as `input`, or a different one.
fn classify_initialized(input: &AggregateInput, existing: LoadedAggregate) -> InitializeResult {
    let held: Vec<&SpaceSnapshot> = existing
        .spaces
        .iter()
        .map(|space| &space.snapshot)
        .collect();
    let given: Vec<&SpaceSnapshot> = input.spaces.iter().collect();
    if authored(existing.meta_space_id, &held) == authored(input.meta_space_id, &given) {
        InitializeResult::Existing(existing)
    } else {
        InitializeResult::AlreadyInitialized(existing)
    }
}

/// Fail as broken stored state unless the database holds every table.
async fn every_table<S: SqlStore>(connection: &mut Connection<S>) -> Outcome<()> {
    let held = S::tables(connection).await?;
    let missing: Vec<&str> = TABLES
        .into_iter()
        .filter(|table| !held.iter().any(|name| name == table))
        .collect();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(broken(format!(
            "the database is missing the table {}",
            missing.join(", ")
        )))
    }
}

/// Every stored Space, decoded, ascending by id.
async fn every_space<S: SqlStore>(connection: &mut Connection<S>) -> Outcome<Vec<LoadedSpace>> {
    let spaces = S::spaces(connection).await?;
    let resources = S::resources(connection).await?;
    let mut by_space: BTreeMap<&str, Vec<&ResourceRow>> = BTreeMap::new();
    for resource in &resources {
        by_space
            .entry(&resource.space_id)
            .or_default()
            .push(resource);
    }
    spaces
        .iter()
        .map(|row| {
            let owned = by_space.get(row.id.as_str()).map_or(&[][..], Vec::as_slice);
            decode_space(row, owned).map_err(Failure::Broken)
        })
        .collect()
}

/// The stored Space with this id, decoded.
async fn one_space<S: SqlStore>(
    connection: &mut Connection<S>,
    id: SpaceId,
) -> Outcome<Option<LoadedSpace>> {
    let Some(row) = S::space(connection, id.as_str()).await? else {
        return Ok(None);
    };
    let resources = S::resources_of(connection, id.as_str()).await?;
    let owned: Vec<&ResourceRow> = resources.iter().collect();
    decode_space(&row, &owned)
        .map(Some)
        .map_err(Failure::Broken)
}

async fn stored_meta_space_id<S: SqlStore>(
    connection: &mut Connection<S>,
) -> Outcome<Option<SpaceId>> {
    match S::meta_space_id(connection).await? {
        None => Ok(None),
        Some(text) => SpaceId::parse(&text)
            .map(Some)
            .ok_or_else(|| broken("the stored Meta identity is not a UUID")),
    }
}

/// A failure naming a row a writer outside the decision removed.
fn vanished(message: String) -> Failure {
    Failure::Answered(RepositoryError::Unclassified(message))
}

/// Insert a created Space's row and every Resource row it holds, refusing
/// a Resource whose id a row already holds.
async fn write_created<S: SqlStore>(
    connection: &mut Connection<S>,
    row: &SpaceRow,
    resources: &[ResourceRow],
) -> Outcome<Result<(), Landing>> {
    S::insert_space(connection, row).await?;
    for resource in resources {
        match S::insert_resource(connection, resource).await {
            Ok(()) => {}
            Err(error) if unique_violation(&error) => {
                return Ok(Err(Landing::Refused(format!(
                    "Resource {} already belongs to another space",
                    resource.id
                ))));
            }
            Err(error) => return Err(error.into()),
        }
    }
    Ok(Ok(()))
}

impl<S: SqlStore> SpaceRepository for SqlSpaceRepository<S> {
    async fn list_spaces(&self) -> Result<Vec<SpaceSummary>, RepositoryError> {
        self.run(|shared| async move {
            let mut transaction = shared.begin(Access::Read).await?;
            let rows = S::spaces(&mut transaction).await?;
            transaction.commit().await?;
            rows.iter()
                .map(|row| {
                    let id = SpaceId::parse(&row.id)
                        .ok_or_else(|| broken(format!("stored Space {} has no UUID", row.id)))?;
                    // A document with no title it can read is listed by
                    // the Space's id (ST-7).
                    let title = decode_title(row).unwrap_or_else(|| row.id.clone());
                    Ok(SpaceSummary { id, title })
                })
                .collect()
        })
        .await
    }

    async fn load_space(&self, id: SpaceId) -> Result<Option<LoadedSpace>, RepositoryError> {
        self.run(move |shared| async move { shared.read_space(id).await })
            .await
    }

    async fn load_aggregate(&self) -> Result<AggregateLoad, RepositoryError> {
        self.run(|shared| async move { shared.load_aggregate().await })
            .await
    }

    async fn commit(&self, request: SpaceCommit) -> Result<CommitResult, RepositoryError> {
        if let Some(refusal) = request_refusal(&request) {
            return Ok(refusal);
        }
        self.run(move |shared| async move { shared.commit(request).await })
            .await
    }

    async fn store_asset(&self, asset: StoredAsset) -> Result<AssetStored, RepositoryError> {
        if asset.hash.is_empty_asset() {
            return Ok(AssetStored::Existing);
        }
        self.run(move |shared| async move {
            let mut transaction = shared.begin(Access::Write).await?;
            let inserted = S::insert_asset(&mut transaction, &asset).await?;
            transaction.commit().await?;
            Ok(if inserted {
                AssetStored::Stored
            } else {
                AssetStored::Existing
            })
        })
        .await
    }

    async fn load_asset(&self, hash: &AssetHash) -> Result<Option<StoredAsset>, RepositoryError> {
        let asked = hash.clone();
        let held = self
            .run(move |shared| async move {
                let mut transaction = shared.begin(Access::Read).await?;
                let row = S::asset(&mut transaction, asked.as_str()).await?;
                transaction.commit().await?;
                Ok(row.map(|(media_type, bytes)| StoredAsset {
                    hash: asked,
                    media_type,
                    bytes: bytes.into(),
                }))
            })
            .await?;
        Ok(held.or_else(|| hash.is_empty_asset().then(StoredAsset::empty)))
    }

    async fn initialize_aggregate(
        &self,
        input: AggregateInput,
    ) -> Result<InitializeResult, RepositoryError> {
        let input = match checked_input(&input) {
            Ok(input) => input,
            Err(refusals) => return Ok(InitializeResult::AggregateRefused(refusals)),
        };
        self.run(move |shared| async move { shared.initialize(input).await })
            .await
    }

    async fn load_meta_space_id(&self) -> Result<Option<SpaceId>, RepositoryError> {
        self.run(|shared| async move { shared.read_meta_space_id().await })
            .await
    }

    async fn replace_aggregate(
        &self,
        input: AggregateInput,
        expected_meta_space_id: Option<SpaceId>,
    ) -> Result<ReplaceResult, RepositoryError> {
        let input = match checked_input(&input) {
            Ok(input) => input,
            Err(refusals) => return Ok(ReplaceResult::AggregateRefused(refusals)),
        };
        self.run(move |shared| async move { shared.replace(input, expected_meta_space_id).await })
            .await
    }

    async fn mark_exported(&self, id: SpaceId, revision: Revision) -> Result<(), RepositoryError> {
        let held = self
            .run(move |shared| async move {
                let mut transaction = shared.begin(Access::Write).await?;
                let held = S::set_exported_revision(
                    &mut transaction,
                    id.as_str(),
                    &encode_revision(revision),
                )
                .await?;
                transaction.commit().await?;
                Ok(held)
            })
            .await?;
        if held {
            Ok(())
        } else {
            Err(RepositoryError::Unclassified(format!(
                "Space {id} does not exist"
            )))
        }
    }
}
