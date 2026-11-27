//! The repository contract's table (`repository_contract`) run against the
//! memory store (rust-sqlite-test-coverage 04). The memory store keeps
//! nothing past its own lifetime and has no rows to write past, so the
//! cases needing a fresh host over what it kept, a stored state no write
//! produces, its row writes, or rows recreated before a row lock say they
//! were skipped.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod repository_contract;

use std::sync::Arc;

use host::MemorySpaceRepository;
use intake::{SpaceId, SpaceSnapshot};
use repository_contract::{BrokenState, Harness, Unprovided, repository_cases};

const NOTHING_KEPT: Unprovided =
    Unprovided("the memory store keeps nothing for a fresh host to read");
const NO_RAW_STATE: Unprovided =
    Unprovided("the memory store holds no stored form to write past its codec");
const NO_ROWS: Unprovided = Unprovided("the memory store writes no rows");
const NO_ROW_LOCK: Unprovided =
    Unprovided("the memory store has no rows and no row lock for a commit to meet them under");

struct Memory {
    store: Arc<MemorySpaceRepository>,
}

impl Harness for Memory {
    type Store = MemorySpaceRepository;

    async fn open() -> Self {
        Self {
            store: Arc::new(MemorySpaceRepository::new()),
        }
    }

    fn store(&self) -> &Arc<Self::Store> {
        &self.store
    }

    async fn reopen(&mut self) -> Result<(), Unprovided> {
        Err(NOTHING_KEPT)
    }

    async fn arrange_broken_state(
        &mut self,
        _state: BrokenState,
        _space: SpaceId,
        _other: SpaceId,
    ) -> Result<SpaceId, Unprovided> {
        Err(NO_RAW_STATE)
    }

    async fn remove_meta_identity(&mut self) -> Result<(), Unprovided> {
        Err(NO_RAW_STATE)
    }

    async fn write_raw_revision(
        &mut self,
        _space: SpaceId,
        _revision: &str,
        _exported: Option<Option<&str>>,
    ) -> Result<(), Unprovided> {
        Err(NO_RAW_STATE)
    }

    async fn take_resource_writes(&mut self) -> Result<Vec<String>, Unprovided> {
        Err(NO_ROWS)
    }

    async fn recreate_before_row_lock(
        &mut self,
        _snapshot: SpaceSnapshot,
    ) -> Result<(), Unprovided> {
        Err(NO_ROW_LOCK)
    }

    async fn close(self) {}
}

repository_cases!(super::Memory);
