//! The one SQL repository (Storage ST-3, `src/persistence/sql-space-repository.ts`):
//! every [`SpaceRepository`] method written once, over a database's own small
//! store of statements ([`SqlStore`]), deciding each commit by the same
//! [`decide_commit`] the memory store does. SQLite's statements are
//! [`SqliteStore`]; a second database adds a second store, not a second
//! repository.
//!
//! Every operation runs alone in the process (ST-127): one at a time, behind
//! one lock, inside one transaction, so overlapping Edits to one Space meet
//! as a stale revision and nothing waits on the database's own locks for
//! another operation of this process.

mod codec;
mod path;
mod sqlite;

use std::collections::BTreeMap;
use std::future::Future;

use intake::{SpaceId, SpaceSnapshot, load_aggregate};
use sqlx::{Database, Transaction};

use crate::assets::{AssetHash, StoredAsset};
use crate::commit::{
    CommitDecision, SingleSpaceDecision, decide_commit, decide_single_space, single_update_space,
};
use crate::repository::{
    AggregateInput, AggregateLoad, AssetStored, CommitResult, InitializeResult, LoadedAggregate,
    LoadedSpace, ReplaceResult, RepositoryError, Revision, SpaceCommit, SpaceRepository,
    SpaceSummary, authored,
};
use codec::{
    ResourceRow, SpaceRow, decode_space, decode_title, encode_revision, encode_space, same_document,
};

pub use path::{SqlitePath, SqlitePathError};
pub use sqlite::{ConnectionSettings, SqliteSpaceRepository, SqliteStore};

/// A connection of `S`'s database, as a transaction lends it.
type Connection<S> = <<S as SqlStore>::Database as Database>::Connection;

/// What a database supplies the one SQL repository: how to open a
/// transaction, each statement the repository runs, and what a failure means.
/// Each statement runs on the connection of the transaction the repository
/// opened, and none decides anything.
pub(crate) trait SqlStore: Send + Sync + 'static {
    /// The `sqlx` database.
    type Database: Database;

    /// A transaction that only reads.
    fn begin_read(
        &self,
    ) -> impl Future<Output = Result<Transaction<'static, Self::Database>, sqlx::Error>> + Send;

    /// A transaction that writes, holding the database's write lock from its start.
    fn begin_write(
        &self,
    ) -> impl Future<Output = Result<Transaction<'static, Self::Database>, sqlx::Error>> + Send;

    /// The stored Meta identity, as text.
    fn meta_space_id(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Option<String>, sqlx::Error>> + Send;

    /// Every Space row, ascending by id.
    fn spaces(
        connection: &mut Connection<Self>,
    ) -> impl Future<Output = Result<Vec<SpaceRow>, sqlx::Error>> + Send;

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

    /// Insert a Space row, or overwrite the one with its id.
    fn write_space(
        connection: &mut Connection<Self>,
        row: &SpaceRow,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

    /// Delete a Space row and its Resource rows.
    fn delete_space(
        connection: &mut Connection<Self>,
        id: &str,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

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
    /// id, keeping when that row was created (`upsert`).
    fn upsert_resource(
        connection: &mut Connection<Self>,
        row: &ResourceRow,
    ) -> impl Future<Output = Result<(), sqlx::Error>> + Send;

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

    /// What a failure of this database means to a caller.
    fn classify(error: &sqlx::Error) -> RepositoryError;
}

/// The one SQL repository over the store of statements `S`.
///
/// A database's own repository is this over its store: SQLite's is
/// [`SqliteSpaceRepository`].
#[derive(Debug)]
pub struct SqlSpaceRepository<S> {
    store: S,
    // Held across each whole operation, so the process runs one at a time.
    serial: tokio::sync::Mutex<()>,
}

/// Why an operation failed: the database, rows that cannot be read, or rows
/// this build cannot write.
enum Failure {
    Database(sqlx::Error),
    Broken(String),
    Defect(String),
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

impl<S> SqlSpaceRepository<S> {
    pub(crate) fn over(store: S) -> Self {
        Self {
            store,
            serial: tokio::sync::Mutex::new(()),
        }
    }

    pub(crate) fn store(&self) -> &S {
        &self.store
    }

    /// Run `operation` alone in the process, naming a database failure by
    /// [`SqlStore::classify`].
    async fn alone<T>(
        &self,
        operation: impl Future<Output = Outcome<T>>,
    ) -> Result<T, RepositoryError>
    where
        S: SqlStore,
    {
        let _alone = self.serial.lock().await;
        operation.await.map_err(|failure| match failure {
            Failure::Database(error) => S::classify(&error),
            Failure::Broken(message) => RepositoryError::BrokenStoredState(message),
            Failure::Defect(message) => RepositoryError::Unclassified(message),
        })
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

/// The stored Meta identity, or `None` for a store that holds no Space:
/// stored Spaces with no Meta identity are broken.
async fn established_meta_space_id<S: SqlStore>(
    connection: &mut Connection<S>,
) -> Outcome<Option<SpaceId>> {
    let meta_space_id = stored_meta_space_id::<S>(connection).await?;
    if meta_space_id.is_none() && !S::spaces(connection).await?.is_empty() {
        return Err(broken("stored Spaces exist without a Meta Space"));
    }
    Ok(meta_space_id)
}

/// The stored aggregate, checked by intake (`#authoritativeAggregate`).
async fn authoritative<S: SqlStore>(
    connection: &mut Connection<S>,
    meta_space_id: SpaceId,
) -> Outcome<LoadedAggregate> {
    let spaces = every_space::<S>(connection).await?;
    load_aggregate(meta_space_id, spaces.iter().map(|space| &space.snapshot))
        .map_err(|_| broken("the stored aggregate violates Meta invariants"))?;
    Ok(LoadedAggregate {
        meta_space_id,
        spaces,
    })
}

/// Write `space` into a store that holds none of its rows.
async fn insert<S: SqlStore>(connection: &mut Connection<S>, space: &LoadedSpace) -> Outcome<()> {
    let (row, resources) = encode_space(space).map_err(Failure::Defect)?;
    S::write_space(connection, &row).await?;
    for resource in &resources {
        S::insert_resource(connection, resource).await?;
    }
    Ok(())
}

/// Remove `deleted` and write `written` as a commit leaves them, writing
/// the rows `#writeUpdate` writes: each written Space's row, and only the
/// Resource rows it adds or changes, judged against its rows as stored;
/// the Resources a written Space drops are deleted first, every written
/// Space's before any is written, so a Resource one Space releases and
/// another takes is never held twice. The commit was decided against
/// these rows inside this transaction, so a Resource a written Space
/// does not hold is held by no Space but one it was released from.
async fn write_changes<S: SqlStore>(
    connection: &mut Connection<S>,
    deleted: &[SpaceId],
    written: &[LoadedSpace],
) -> Outcome<()> {
    for id in deleted {
        S::delete_space(connection, id.as_str()).await?;
    }
    let encoded = written
        .iter()
        .map(encode_space)
        .collect::<Result<Vec<_>, String>>()
        .map_err(Failure::Defect)?;
    for (row, resources) in &encoded {
        let keep: Vec<&str> = resources
            .iter()
            .map(|resource| resource.id.as_str())
            .collect();
        S::delete_resources_except(connection, &row.id, &keep).await?;
    }
    for (row, resources) in &encoded {
        S::write_space(connection, row).await?;
        let stored: BTreeMap<String, String> = S::resources_of(connection, &row.id)
            .await?
            .into_iter()
            .map(|resource| (resource.id, resource.document))
            .collect();
        for resource in resources {
            let unchanged = stored
                .get(&resource.id)
                .is_some_and(|document| same_document(document, &resource.document));
            if !unchanged {
                S::upsert_resource(connection, resource).await?;
            }
        }
    }
    Ok(())
}

/// Empty the store and write `input` as the whole aggregate.
async fn install<S: SqlStore>(
    connection: &mut Connection<S>,
    input: AggregateInput,
) -> Outcome<LoadedAggregate> {
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
        insert::<S>(connection, space).await?;
    }
    S::insert_meta_space_id(connection, input.meta_space_id.as_str()).await?;
    authoritative::<S>(connection, input.meta_space_id).await
}

impl<S: SqlStore> SpaceRepository for SqlSpaceRepository<S> {
    async fn list_spaces(&self) -> Result<Vec<SpaceSummary>, RepositoryError> {
        self.alone(async {
            let mut transaction = self.store.begin_read().await?;
            let rows = S::spaces(&mut transaction).await?;
            transaction.commit().await?;
            rows.iter()
                .map(|row| {
                    let id = SpaceId::parse(&row.id)
                        .ok_or_else(|| broken(format!("stored Space {} has no UUID", row.id)))?;
                    let title = decode_title(row).map_err(Failure::Broken)?;
                    Ok(SpaceSummary { id, title })
                })
                .collect()
        })
        .await
    }

    async fn load_space(&self, id: SpaceId) -> Result<Option<LoadedSpace>, RepositoryError> {
        self.alone(async {
            let mut transaction = self.store.begin_read().await?;
            let loaded = one_space::<S>(&mut transaction, id).await;
            transaction.commit().await?;
            loaded
        })
        .await
    }

    async fn load_aggregate(&self) -> Result<AggregateLoad, RepositoryError> {
        self.alone(async {
            let mut transaction = self.store.begin_read().await?;
            let loaded = match established_meta_space_id::<S>(&mut transaction).await? {
                Some(meta_space_id) => AggregateLoad::Loaded(
                    authoritative::<S>(&mut transaction, meta_space_id).await?,
                ),
                None => AggregateLoad::Uninitialized,
            };
            transaction.commit().await?;
            Ok(loaded)
        })
        .await
    }

    async fn commit(&self, request: SpaceCommit) -> Result<CommitResult, RepositoryError> {
        self.alone(async {
            let mut transaction = self.store.begin_write().await?;
            let meta_space_id = stored_meta_space_id::<S>(&mut transaction).await?;
            // A single update is decided against its own Space first, reading
            // no other (`#commitTopologyPreservingUpdate`), so another stored
            // Space that cannot be read does not fail it.
            if let Some(space_id) = single_update_space(&request) {
                let current = one_space::<S>(&mut transaction, space_id).await?;
                match decide_single_space(&request, meta_space_id, current.as_ref()) {
                    SingleSpaceDecision::Answer(result) => {
                        transaction.rollback().await?;
                        return Ok(result);
                    }
                    SingleSpaceDecision::Write { result, written } => {
                        write_changes::<S>(&mut transaction, &[], &[written]).await?;
                        transaction.commit().await?;
                        return Ok(result);
                    }
                    SingleSpaceDecision::Aggregate => {}
                }
            }
            let stored = every_space::<S>(&mut transaction).await?;
            match decide_commit(&request, meta_space_id, stored.iter()) {
                CommitDecision::Answer(result) => {
                    transaction.rollback().await?;
                    Ok(result)
                }
                CommitDecision::Write {
                    result,
                    written,
                    deleted,
                } => {
                    write_changes::<S>(&mut transaction, &deleted, &written).await?;
                    transaction.commit().await?;
                    Ok(result)
                }
            }
        })
        .await
    }

    async fn store_asset(&self, asset: StoredAsset) -> Result<AssetStored, RepositoryError> {
        if asset.hash.is_empty_asset() {
            return Ok(AssetStored::Existing);
        }
        self.alone(async {
            let mut transaction = self.store.begin_write().await?;
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
        let held = self
            .alone(async {
                let mut transaction = self.store.begin_read().await?;
                let row = S::asset(&mut transaction, hash.as_str()).await?;
                transaction.commit().await?;
                Ok(row.map(|(media_type, bytes)| StoredAsset {
                    hash: hash.clone(),
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
        if let Err(refusals) = load_aggregate(input.meta_space_id, &input.spaces) {
            return Ok(InitializeResult::AggregateRefused(refusals));
        }
        self.alone(async {
            let mut transaction = self.store.begin_write().await?;
            let Some(meta_space_id) = established_meta_space_id::<S>(&mut transaction).await?
            else {
                let installed = install::<S>(&mut transaction, input).await?;
                transaction.commit().await?;
                return Ok(InitializeResult::Initialized(installed));
            };
            let existing = authoritative::<S>(&mut transaction, meta_space_id).await?;
            transaction.rollback().await?;
            let held: Vec<&SpaceSnapshot> = existing
                .spaces
                .iter()
                .map(|space| &space.snapshot)
                .collect();
            let given: Vec<&SpaceSnapshot> = input.spaces.iter().collect();
            Ok(
                if authored(meta_space_id, &held) == authored(input.meta_space_id, &given) {
                    InitializeResult::Existing(existing)
                } else {
                    InitializeResult::AlreadyInitialized(existing)
                },
            )
        })
        .await
    }

    async fn load_meta_space_id(&self) -> Result<Option<SpaceId>, RepositoryError> {
        self.alone(async {
            let mut transaction = self.store.begin_read().await?;
            let meta_space_id = stored_meta_space_id::<S>(&mut transaction).await?;
            transaction.commit().await?;
            Ok(meta_space_id)
        })
        .await
    }

    async fn replace_aggregate(
        &self,
        input: AggregateInput,
        expected_meta_space_id: Option<SpaceId>,
    ) -> Result<ReplaceResult, RepositoryError> {
        if let Err(refusals) = load_aggregate(input.meta_space_id, &input.spaces) {
            return Ok(ReplaceResult::AggregateRefused(refusals));
        }
        self.alone(async {
            let mut transaction = self.store.begin_write().await?;
            let meta_space_id = stored_meta_space_id::<S>(&mut transaction).await?;
            // Rows are counted, not read: replacement replaces stored state
            // whether or not it parses (ADR 0094).
            let stored = S::spaces(&mut transaction).await?;
            let answer = if meta_space_id.is_none() && stored.is_empty() {
                ReplaceResult::Uninitialized
            } else if meta_space_id != expected_meta_space_id {
                ReplaceResult::Conflict {
                    current_meta_space_id: meta_space_id,
                }
            } else {
                let installed = install::<S>(&mut transaction, input).await?;
                transaction.commit().await?;
                return Ok(ReplaceResult::Replaced(installed));
            };
            transaction.rollback().await?;
            Ok(answer)
        })
        .await
    }

    async fn mark_exported(&self, id: SpaceId, revision: Revision) -> Result<(), RepositoryError> {
        let held = self
            .alone(async {
                let mut transaction = self.store.begin_write().await?;
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
