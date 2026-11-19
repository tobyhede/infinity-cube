//! The storage seam (`packages/aggregate/src/space-repository.ts` over
//! `packages/persistence/src/repository.ts`): what the HTTP application reads
//! and commits through, the aggregate lifecycle only the host and the CLI
//! reach, and the asset store beside them. Every store implements it, and
//! every store decides a commit by [`decide_commit`](crate::decide_commit).

use std::fmt;
use std::future::Future;

use intake::{Refusal, Refusals, SpaceId, SpaceSnapshot};

use crate::assets::{AssetHash, StoredAsset};

/// A Space's revision: 0 when stored, one more for each change committed to
/// it, never above 2⁶³ − 1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Revision(u64);

impl Revision {
    /// The revision every Space is stored at first.
    pub const FIRST: Self = Self(0);

    /// The highest revision a store keeps: 2⁶³ − 1.
    pub const CEILING: u64 = i64::MAX as u64;

    /// The revision `value` is, or `None` above the ceiling.
    #[must_use]
    pub fn new(value: u64) -> Option<Self> {
        (value <= Self::CEILING).then_some(Self(value))
    }

    /// The revision as a number.
    #[must_use]
    pub fn get(self) -> u64 {
        self.0
    }

    /// The revision after this one, held at the ceiling.
    #[must_use]
    pub fn next(self) -> Self {
        Self(self.0.saturating_add(1).min(Self::CEILING))
    }
}

impl fmt::Display for Revision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

/// A stored Space: its snapshot, its revision, and the revision last Exported.
#[derive(Debug, Clone, PartialEq)]
pub struct LoadedSpace {
    /// Its snapshot.
    pub snapshot: SpaceSnapshot,
    /// Its revision.
    pub revision: Revision,
    /// The revision a completed Export last wrote, if any.
    pub exported_revision: Option<Revision>,
}

/// One Space in the collection: its id and title.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceSummary {
    /// Its id.
    pub id: SpaceId,
    /// Its title.
    pub title: String,
}

/// A complete, Meta-rooted aggregate as stored.
#[derive(Debug, Clone, PartialEq)]
pub struct LoadedAggregate {
    /// The Meta Space.
    pub meta_space_id: SpaceId,
    /// Every Space, ascending by id.
    pub spaces: Vec<LoadedSpace>,
}

/// What reading the aggregate answers.
#[derive(Debug, Clone, PartialEq)]
pub enum AggregateLoad {
    /// Nothing is stored yet: no Spaces and no Meta identity.
    Uninitialized,
    /// The stored aggregate.
    Loaded(LoadedAggregate),
}

/// One change of a commit.
#[derive(Debug, Clone, PartialEq)]
pub enum SpaceChange {
    /// Create a Space no store holds.
    Create {
        /// The Space.
        space_id: SpaceId,
        /// Its snapshot.
        snapshot: SpaceSnapshot,
    },
    /// Replace a stored Space at the revision the caller read.
    Update {
        /// The Space.
        space_id: SpaceId,
        /// Its next snapshot.
        snapshot: SpaceSnapshot,
        /// The revision the caller read.
        expected_revision: Revision,
    },
    /// Delete a stored Space at the revision the caller read.
    Delete {
        /// The Space.
        space_id: SpaceId,
        /// The revision the caller read.
        expected_revision: Revision,
    },
}

impl SpaceChange {
    /// The Space the change names.
    #[must_use]
    pub fn space_id(&self) -> SpaceId {
        match self {
            Self::Create { space_id, .. }
            | Self::Update { space_id, .. }
            | Self::Delete { space_id, .. } => *space_id,
        }
    }

    /// The snapshot a create or update writes.
    #[must_use]
    pub fn snapshot(&self) -> Option<&SpaceSnapshot> {
        match self {
            Self::Create { snapshot, .. } | Self::Update { snapshot, .. } => Some(snapshot),
            Self::Delete { .. } => None,
        }
    }
}

/// A change set, judged and written as one.
#[derive(Debug, Clone, PartialEq)]
pub struct SpaceCommit {
    /// The changes, each naming a different Space.
    pub changes: Vec<SpaceChange>,
}

/// A Space a commit expected at another revision, and what is stored now.
#[derive(Debug, Clone, PartialEq)]
pub struct SpaceConflict {
    /// The Space.
    pub space_id: SpaceId,
    /// What is stored for it now; `None` for a Space no longer stored.
    pub current: Option<LoadedSpace>,
}

/// One refusal of a commit's candidate aggregate, as the HTTP refusal body
/// carries it (`SpaceAggregateError`).
#[derive(Debug, Clone, PartialEq)]
pub enum AggregateRefusal {
    /// A Space's own intake refused it: its position among the candidate
    /// Spaces, ascending by id, and every refusal.
    InvalidSpaceSnapshot {
        /// Its position, ascending by id.
        snapshot_index: usize,
        /// Its refusals.
        errors: Vec<Refusal>,
    },
    /// A Space id held twice.
    DuplicateSpaceId {
        /// The Space.
        space_id: SpaceId,
        /// Each position holding it.
        snapshot_indexes: Vec<usize>,
    },
    /// A Resource id held by more than one Space.
    DuplicateResourceId {
        /// The Resource.
        resource_id: intake::ResourceId,
        /// Each Space holding it, ascending by id.
        space_ids: Vec<SpaceId>,
    },
    /// Any other refusal of the whole aggregate.
    Aggregate(Refusal),
}

/// Why a commit's candidate aggregate was refused: every refusal as intake
/// locates it (ADR 0156), and the same refusals grouped as the wire carries them.
#[derive(Debug, Clone, PartialEq)]
pub struct CommitRefusal {
    /// Each refusal, located.
    pub refusals: Vec<Refusal>,
    /// The refusals as the wire groups them.
    pub errors: Vec<AggregateRefusal>,
}

/// What a store answers a commit.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum CommitResult {
    /// Every change landed.
    Committed {
        /// Each created or updated Space and its revision now, in change order.
        revisions: Vec<(SpaceId, Revision)>,
        /// Each deleted Space, in change order.
        deleted_space_ids: Vec<SpaceId>,
    },
    /// A change expected a revision other than the stored one.
    Conflict(Vec<SpaceConflict>),
    /// The candidate aggregate failed intake.
    AggregateRefused(CommitRefusal),
    /// The store will not judge the change set.
    Rejected {
        /// Why, in words.
        message: String,
    },
}

/// What reading or writing a store failed with, by what a caller does about it.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum RepositoryError {
    /// Stored state no aggregate can be read from: a defect no retry cures.
    #[error("stored repository state is not usable: {0}")]
    BrokenStoredState(String),
    /// The store did not answer, or answered "not now": temporary.
    #[error("the store is unavailable: {0}")]
    Unavailable(String),
    /// A failure neither of those: a defect, or one nobody anticipated.
    #[error("the store failed: {0}")]
    Unclassified(String),
}

/// Whether storing an asset wrote it, or found it already stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetStored {
    /// Its bytes were stored now.
    Stored,
    /// Its bytes were already stored; the first stored media type stands.
    Existing,
}

/// A complete, Meta-rooted input to the aggregate lifecycle.
#[derive(Debug, Clone, PartialEq)]
pub struct AggregateInput {
    /// The Meta Space.
    pub meta_space_id: SpaceId,
    /// Every Space.
    pub spaces: Vec<SpaceSnapshot>,
}

/// What establishing first state answers.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum InitializeResult {
    /// The store was empty and now holds the input.
    Initialized(LoadedAggregate),
    /// The store already held the same aggregate.
    Existing(LoadedAggregate),
    /// The store already held another aggregate, which is kept.
    AlreadyInitialized(LoadedAggregate),
    /// The input failed intake.
    AggregateRefused(Refusals),
}

/// What replacing the stored aggregate answers.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum ReplaceResult {
    /// The store now holds the input.
    Replaced(LoadedAggregate),
    /// Nothing is stored to replace.
    Uninitialized,
    /// Another Meta identity is stored than the caller expected.
    Conflict {
        /// The Meta identity stored, `None` for Spaces stored with none.
        current_meta_space_id: Option<SpaceId>,
    },
    /// The input failed intake.
    AggregateRefused(Refusals),
}

/// A store of one aggregate and its assets.
///
/// Two lifecycle doors and no mode parameter on either (ADR 0078):
/// [`initialize_aggregate`](Self::initialize_aggregate) establishes first
/// state and leaves an initialized store as it is, and
/// [`replace_aggregate`](Self::replace_aggregate) destroys and rewrites,
/// given the Meta identity it expects to replace. Neither touches an asset.
pub trait SpaceRepository: Send + Sync + 'static {
    /// Every Space's id and title.
    fn list_spaces(
        &self,
    ) -> impl Future<Output = Result<Vec<SpaceSummary>, RepositoryError>> + Send;

    /// The Space with this id, as stored.
    fn load_space(
        &self,
        id: SpaceId,
    ) -> impl Future<Output = Result<Option<LoadedSpace>, RepositoryError>> + Send;

    /// The whole stored aggregate, checked by intake.
    fn load_aggregate(&self)
    -> impl Future<Output = Result<AggregateLoad, RepositoryError>> + Send;

    /// Decide a change set by [`decide_commit`](crate::decide_commit) and
    /// write it if it lands.
    fn commit(
        &self,
        request: SpaceCommit,
    ) -> impl Future<Output = Result<CommitResult, RepositoryError>> + Send;

    /// Store an asset by its content.
    fn store_asset(
        &self,
        asset: StoredAsset,
    ) -> impl Future<Output = Result<AssetStored, RepositoryError>> + Send;

    /// The asset stored under `hash`; the asset of zero bytes is always held.
    fn load_asset(
        &self,
        hash: &AssetHash,
    ) -> impl Future<Output = Result<Option<StoredAsset>, RepositoryError>> + Send;

    /// Establish first state.
    fn initialize_aggregate(
        &self,
        input: AggregateInput,
    ) -> impl Future<Output = Result<InitializeResult, RepositoryError>> + Send;

    /// The stored Meta identity, read without checking the aggregate around it.
    fn load_meta_space_id(
        &self,
    ) -> impl Future<Output = Result<Option<SpaceId>, RepositoryError>> + Send;

    /// Replace whatever is stored with `input`.
    fn replace_aggregate(
        &self,
        input: AggregateInput,
        expected_meta_space_id: Option<SpaceId>,
    ) -> impl Future<Output = Result<ReplaceResult, RepositoryError>> + Send;

    /// Record the revision a completed Export wrote for a Space.
    fn mark_exported(
        &self,
        id: SpaceId,
        revision: Revision,
    ) -> impl Future<Output = Result<(), RepositoryError>> + Send;
}
