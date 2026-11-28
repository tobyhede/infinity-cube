//! The in-process store (`packages/aggregate/src/memory-space-repository.ts`):
//! the whole aggregate held in memory for the life of the process, deciding
//! commits and the lifecycle by the same rules as every other store.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, MutexGuard, PoisonError};

use intake::{SpaceId, SpaceSnapshot, load_aggregate};

use crate::assets::{AssetHash, StoredAsset};
use crate::commit::{CommitDecision, decide_commit};
use crate::repository::{
    AggregateInput, AggregateLoad, AssetStored, CommitResult, InitializeResult, LoadedAggregate,
    LoadedSpace, ReplaceResult, RepositoryError, Revision, SpaceCommit, SpaceRepository,
    SpaceSummary, authored, checked_input,
};

#[derive(Debug, Default)]
struct State {
    spaces: BTreeMap<SpaceId, LoadedSpace>,
    meta_space_id: Option<SpaceId>,
    assets: HashMap<AssetHash, StoredAsset>,
}

impl State {
    fn aggregate(&self, meta_space_id: SpaceId) -> LoadedAggregate {
        LoadedAggregate {
            meta_space_id,
            spaces: self.spaces.values().cloned().collect(),
        }
    }

    fn install(&mut self, input: AggregateInput) -> LoadedAggregate {
        self.spaces = input
            .spaces
            .into_iter()
            .map(|snapshot| {
                (
                    snapshot.id,
                    LoadedSpace {
                        snapshot: in_id_order(snapshot),
                        revision: Revision::FIRST,
                        exported_revision: None,
                    },
                )
            })
            .collect();
        self.meta_space_id = Some(input.meta_space_id);
        self.aggregate(input.meta_space_id)
    }
}

/// `snapshot` with its Resources in ascending id order, the order every
/// store answers them in (Storage ST-21).
fn in_id_order(mut snapshot: SpaceSnapshot) -> SpaceSnapshot {
    snapshot.resources.sort_by_key(|resource| resource.id);
    snapshot
}

/// Why [`MemorySpaceRepository::holding`] refused the Spaces it was given.
#[cfg(any(test, feature = "test-support"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HoldingRefused {
    /// Two Spaces given share this id.
    DuplicateSpace(SpaceId),
    /// The Meta id given names no Space given.
    MetaNotHeld(SpaceId),
}

/// The in-process [`SpaceRepository`].
///
/// # Examples
///
/// ```
/// use host::{AggregateLoad, MemorySpaceRepository, SpaceRepository};
///
/// # tokio::runtime::Builder::new_current_thread().build().unwrap().block_on(async {
/// let store = MemorySpaceRepository::new();
/// assert_eq!(store.load_aggregate().await, Ok(AggregateLoad::Uninitialized));
/// # });
/// ```
#[derive(Debug, Default)]
pub struct MemorySpaceRepository {
    state: Mutex<State>,
}

impl MemorySpaceRepository {
    /// An uninitialized store: no Spaces, no Meta identity and no assets.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// A store holding `aggregate` as given, each Space at its own revision
    /// and exported revision, as the TypeScript memory backend is built from
    /// the Spaces it holds (`MemorySpaceBackend`). Its Resources are held in
    /// ascending id order (Storage ST-21). It runs no intake: it is how a
    /// test puts a Space at a revision no sequence of commits reaches, such
    /// as the ceiling, so it is for tests alone.
    ///
    /// # Errors
    ///
    /// [`HoldingRefused`] where two Spaces share an id, or the Meta id names
    /// no Space held.
    #[cfg(any(test, feature = "test-support"))]
    pub fn holding(aggregate: LoadedAggregate) -> Result<Self, HoldingRefused> {
        let mut spaces = BTreeMap::new();
        for mut space in aggregate.spaces {
            space.snapshot = in_id_order(space.snapshot);
            let id = space.snapshot.id;
            if spaces.insert(id, space).is_some() {
                return Err(HoldingRefused::DuplicateSpace(id));
            }
        }
        if !spaces.contains_key(&aggregate.meta_space_id) {
            return Err(HoldingRefused::MetaNotHeld(aggregate.meta_space_id));
        }
        Ok(Self {
            state: Mutex::new(State {
                spaces,
                meta_space_id: Some(aggregate.meta_space_id),
                assets: HashMap::new(),
            }),
        })
    }

    fn state(&self) -> MutexGuard<'_, State> {
        // No code holding the lock can panic part-way through a change, so a
        // poisoned lock still guards consistent state.
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl SpaceRepository for MemorySpaceRepository {
    async fn list_spaces(&self) -> Result<Vec<SpaceSummary>, RepositoryError> {
        Ok(self
            .state()
            .spaces
            .values()
            .map(|space| SpaceSummary {
                id: space.snapshot.id,
                title: space.snapshot.document.title.clone(),
            })
            .collect())
    }

    async fn load_space(&self, id: SpaceId) -> Result<Option<LoadedSpace>, RepositoryError> {
        Ok(self.state().spaces.get(&id).cloned())
    }

    async fn load_aggregate(&self) -> Result<AggregateLoad, RepositoryError> {
        let state = self.state();
        let Some(meta_space_id) = state.meta_space_id else {
            return if state.spaces.is_empty() {
                Ok(AggregateLoad::Uninitialized)
            } else {
                Err(RepositoryError::BrokenStoredState(
                    "stored Spaces exist without a Meta Space".to_owned(),
                ))
            };
        };
        let aggregate = state.aggregate(meta_space_id);
        drop(state);
        load_aggregate(
            meta_space_id,
            aggregate.spaces.iter().map(|space| &space.snapshot),
        )
        .map_err(|_| {
            RepositoryError::BrokenStoredState(
                "the stored aggregate violates Meta invariants".to_owned(),
            )
        })?;
        Ok(AggregateLoad::Loaded(aggregate))
    }

    async fn commit(&self, request: SpaceCommit) -> Result<CommitResult, RepositoryError> {
        let mut state = self.state();
        match decide_commit(&request, state.meta_space_id, state.spaces.values()) {
            CommitDecision::Answer(result) => Ok(result),
            CommitDecision::Fail(failure) => Err(failure),
            CommitDecision::Write {
                result,
                written,
                deleted,
            } => {
                for id in &deleted {
                    state.spaces.remove(id);
                }
                for mut space in written {
                    space.snapshot = in_id_order(space.snapshot);
                    state.spaces.insert(space.snapshot.id, space);
                }
                Ok(result)
            }
        }
    }

    async fn store_asset(&self, asset: StoredAsset) -> Result<AssetStored, RepositoryError> {
        if asset.hash.is_empty_asset() {
            return Ok(AssetStored::Existing);
        }
        let mut state = self.state();
        if state.assets.contains_key(&asset.hash) {
            return Ok(AssetStored::Existing);
        }
        state.assets.insert(asset.hash.clone(), asset);
        Ok(AssetStored::Stored)
    }

    async fn load_asset(&self, hash: &AssetHash) -> Result<Option<StoredAsset>, RepositoryError> {
        let held = self.state().assets.get(hash).cloned();
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
        let mut state = self.state();
        if state.meta_space_id.is_none() && state.spaces.is_empty() {
            return Ok(InitializeResult::Initialized(state.install(input)));
        }
        let Some(meta_space_id) = state.meta_space_id else {
            return Err(RepositoryError::BrokenStoredState(
                "stored Spaces exist without a Meta Space".to_owned(),
            ));
        };
        let existing = state.aggregate(meta_space_id);
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
    }

    async fn load_meta_space_id(&self) -> Result<Option<SpaceId>, RepositoryError> {
        Ok(self.state().meta_space_id)
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
        let mut state = self.state();
        if state.meta_space_id.is_none() && state.spaces.is_empty() {
            return Ok(ReplaceResult::Uninitialized);
        }
        if state.meta_space_id != expected_meta_space_id {
            return Ok(ReplaceResult::Conflict {
                current_meta_space_id: state.meta_space_id,
            });
        }
        Ok(ReplaceResult::Replaced(state.install(input)))
    }

    async fn mark_exported(&self, id: SpaceId, revision: Revision) -> Result<(), RepositoryError> {
        match self.state().spaces.get_mut(&id) {
            Some(space) => {
                space.exported_revision = Some(revision);
                Ok(())
            }
            None => Err(RepositoryError::Unclassified(format!(
                "Space {id} does not exist"
            ))),
        }
    }
}

#[cfg(test)]
mod tests;
