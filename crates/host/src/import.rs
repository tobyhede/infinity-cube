//! Import: an Aggregate directory read through intake into a fresh store
//! (`src/import/import-aggregate.ts`, as `cube check` and a run start).

use std::io;
use std::path::Path;

use intake::{Refusals, Uuid, import_aggregate};

use crate::assets::{AssetHash, StoredAsset};
use crate::directory::{Filesystem, holds_nothing, read_files};
use crate::repository::{AggregateInput, InitializeResult, RepositoryError, SpaceRepository};

/// A source of new ids (ADR 0109): the ids a hand-authored directory leaves
/// out, and those a working read's initialization mints.
pub trait IdSource: Send + Sync + 'static {
    /// A new id.
    fn new_id(&self) -> Uuid;
}

impl<T: IdSource> IdSource for std::sync::Arc<T> {
    fn new_id(&self) -> Uuid {
        self.as_ref().new_id()
    }
}

/// Random version 4 UUIDs, for the binaries; tests pass deterministic ones.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RandomIds;

impl IdSource for RandomIds {
    fn new_id(&self) -> Uuid {
        Uuid::from_u128(uuid::Uuid::new_v4().as_u128())
    }
}

/// Why a directory was not Imported.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum ImportError {
    /// The directory is missing or holds nothing but dot-entries: there is no
    /// aggregate to run, and `init` makes one.
    #[error("the directory holds no aggregate")]
    Empty,
    /// Intake refused the directory, every refusal of the first stage that refused.
    #[error("the directory is not an aggregate intake accepts: {0}")]
    Refused(Refusals),
    /// The directory could not be listed.
    #[error("the directory could not be listed: {0}")]
    Io(#[from] io::Error),
    /// The store failed.
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    /// The store already held an aggregate; Import fills only a fresh one.
    #[error("the store already holds an aggregate")]
    NotFresh,
}

/// Import `directory` into the fresh `repository`: its aggregate through the
/// first lifecycle door, and each asset `assets/` carries into the asset store.
///
/// # Errors
///
/// [`ImportError`]: an empty directory, intake's refusals, a directory that
/// could not be listed, a failing store or one that was not fresh.
pub async fn import_directory<R: SpaceRepository, F: Filesystem, I: IdSource>(
    repository: &R,
    fs: &F,
    directory: &Path,
    ids: &I,
) -> Result<(), ImportError> {
    if holds_nothing(fs, directory).await? {
        return Err(ImportError::Empty);
    }
    let files = read_files(fs, directory).await;
    let imported = import_aggregate(files, || ids.new_id()).map_err(ImportError::Refused)?;
    let meta_space_id = imported.aggregate.meta_space_id();
    let spaces = imported
        .aggregate
        .into_spaces()
        .into_iter()
        .map(intake::Space::into_snapshot)
        .collect();
    // The assets are stored before the lifecycle door runs (ST-49), so a
    // failed asset write leaves the store fresh and the Import can be retried.
    for asset in imported.assets {
        let Some(hash) = AssetHash::parse(&asset.hash) else {
            continue;
        };
        repository
            .store_asset(StoredAsset {
                hash,
                media_type: asset.media_type.to_owned(),
                bytes: asset.bytes.into(),
            })
            .await?;
    }
    match repository
        .initialize_aggregate(AggregateInput {
            meta_space_id,
            spaces,
        })
        .await?
    {
        InitializeResult::Initialized(_) => {}
        InitializeResult::AggregateRefused(refusals) => return Err(ImportError::Refused(refusals)),
        _ => return Err(ImportError::NotFresh),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_random_ids {
        use super::*;

        #[test]
        fn mints_new_lower_case_version_4_uuids() {
            let id = RandomIds.new_id();
            assert!(id.is_lower_case(), "{id} is lower case");
            assert_eq!(id.as_str().get(14..15), Some("4"), "{id} is version 4");
            assert_ne!(RandomIds.new_id(), id, "each id is new");
        }
    }
}
