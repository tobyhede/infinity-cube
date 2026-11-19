//! Import's order against a store: the assets are stored before the lifecycle
//! door runs (Storage ST-49), so a failed asset write leaves the store fresh
//! and the same Import can be tried again.

#![allow(
    clippy::unwrap_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use host::{
    AggregateInput, AggregateLoad, AssetHash, AssetStored, CommitResult, IdSource, ImportError,
    InitializeResult, LoadedSpace, MemorySpaceRepository, ReplaceResult, RepositoryError, Revision,
    SpaceCommit, SpaceRepository, SpaceSummary, StoredAsset, TokioFilesystem, import_directory,
};
use intake::{SpaceId, Uuid};

struct NoIds;

impl IdSource for NoIds {
    fn new_id(&self) -> Uuid {
        panic!("the fixture writes down every id")
    }
}

/// A memory store whose next `failures` asset writes fail.
#[derive(Default)]
struct FailingAssets {
    inner: MemorySpaceRepository,
    failures: AtomicUsize,
}

impl SpaceRepository for FailingAssets {
    async fn list_spaces(&self) -> Result<Vec<SpaceSummary>, RepositoryError> {
        self.inner.list_spaces().await
    }
    async fn load_space(&self, id: SpaceId) -> Result<Option<LoadedSpace>, RepositoryError> {
        self.inner.load_space(id).await
    }
    async fn load_aggregate(&self) -> Result<AggregateLoad, RepositoryError> {
        self.inner.load_aggregate().await
    }
    async fn commit(&self, request: SpaceCommit) -> Result<CommitResult, RepositoryError> {
        self.inner.commit(request).await
    }
    async fn store_asset(&self, asset: StoredAsset) -> Result<AssetStored, RepositoryError> {
        let failing = self
            .failures
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                left.checked_sub(1)
            })
            .is_ok();
        if failing {
            return Err(RepositoryError::Unavailable("the disk is full".to_owned()));
        }
        self.inner.store_asset(asset).await
    }
    async fn load_asset(&self, hash: &AssetHash) -> Result<Option<StoredAsset>, RepositoryError> {
        self.inner.load_asset(hash).await
    }
    async fn initialize_aggregate(
        &self,
        input: AggregateInput,
    ) -> Result<InitializeResult, RepositoryError> {
        self.inner.initialize_aggregate(input).await
    }
    async fn load_meta_space_id(&self) -> Result<Option<SpaceId>, RepositoryError> {
        self.inner.load_meta_space_id().await
    }
    async fn replace_aggregate(
        &self,
        input: AggregateInput,
        expected_meta_space_id: Option<SpaceId>,
    ) -> Result<ReplaceResult, RepositoryError> {
        self.inner
            .replace_aggregate(input, expected_meta_space_id)
            .await
    }
    async fn mark_exported(&self, id: SpaceId, revision: Revision) -> Result<(), RepositoryError> {
        self.inner.mark_exported(id, revision).await
    }
}

fn fixture() -> &'static Path {
    Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/app/fixture"
    ))
}

mod given_an_asset_write_that_fails {
    use super::*;

    #[tokio::test]
    async fn leaves_the_store_fresh_so_the_import_can_be_tried_again() {
        let store = FailingAssets {
            failures: AtomicUsize::new(1),
            ..FailingAssets::default()
        };
        let failed = import_directory(&store, &TokioFilesystem, fixture(), &NoIds).await;
        assert!(
            matches!(failed, Err(ImportError::Repository(_))),
            "the asset write's failure is answered: {failed:?}"
        );
        assert_eq!(
            store.load_meta_space_id().await.unwrap(),
            None,
            "no lifecycle door ran"
        );
        let retried = import_directory(&store, &TokioFilesystem, fixture(), &NoIds).await;
        assert!(retried.is_ok(), "the retry Imports: {retried:?}");
        assert!(
            store.load_meta_space_id().await.unwrap().is_some(),
            "the aggregate is stored"
        );
    }
}
