//! The InfinityCube host: serves an Aggregate directory.
//!
//! The Rust half of ADR 0155: the same HTTP contract the TypeScript host
//! serves, unchanged on the wire, over a store behind one trait.
//!
//! - [`SpaceRepository`] is the storage seam, and [`MemorySpaceRepository`]
//!   the store a run serves from. Its commits are decided by the pure
//!   [`decide_commit`], with no IO and no async.
//! - [`import_directory`] and [`export_aggregate`] read and write an
//!   Aggregate directory through the small [`Filesystem`] seam; Export works
//!   in place and writes the bytes the TypeScript Export writes.
//! - [`Application`] answers one `http::Request` at a time with an
//!   `http::Response` of bytes, with no listener: the Space API, the asset
//!   store, product addresses and the [`Shell`] of built files the caller
//!   hands in.
//! - [`Run`] composes them: Import, serve, and Export once Edits have been
//!   quiet, with the directory, the id source and the clock required by its
//!   builder (ADR 0109).
//!
//! # Example
//!
//! ```no_run
//! use std::collections::BTreeMap;
//!
//! use host::{RandomIds, Run, RunStopped, Shell, TokioClock};
//!
//! # async fn example() -> Result<(), host::ImportError> {
//! let shell = Shell::new("<!doctype html>", BTreeMap::new());
//! let run = Run::builder()
//!     .directory("talk")
//!     .ids(RandomIds)
//!     .clock(TokioClock)
//!     .start(shell)
//!     .await?;
//! let request = http::Request::get("/api/spaces").body(String::new()).unwrap_or_default();
//! let response = run.application().handle(request).await;
//! assert_eq!(response.status(), 200);
//! assert!(matches!(run.stop().await, RunStopped::Stopped));
//! # Ok(())
//! # }
//! ```
//!
//! A run cannot start without its clock, or its ids, or its directory:
//!
//! ```compile_fail
//! use std::collections::BTreeMap;
//!
//! # async fn example() {
//! let shell = host::Shell::new("<!doctype html>", BTreeMap::new());
//! let _ = host::Run::builder()
//!     .directory("talk")
//!     .ids(host::RandomIds)
//!     .start(shell)
//!     .await;
//! # }
//! ```

// The root `Cargo.toml`'s lint table, which every member inherits, sets the
// rest; these are this crate's additions.
#![deny(missing_docs, missing_debug_implementations)]
#![cfg_attr(not(test), deny(clippy::indexing_slicing))]

mod assets;
mod built_application;
mod commit;
mod directory;
mod document;
mod export;
mod http;
mod import;
mod json_text;
mod memory;
mod product;
mod repository;
mod run;
mod shell;
mod uri;
mod wire;

pub use assets::{
    AssetHash, EMPTY_ASSET_HASH, MAX_ASSET_BYTES, StoredAsset, normalize_media_type,
    served_media_type,
};
pub use built_application::{BuiltApplicationDirectory, BuiltApplicationError};
pub use commit::{CommitDecision, decide_commit};
pub use directory::{EntryKind, Filesystem, TokioFilesystem};
pub use export::{ExportError, Exported, absent_assets, export_aggregate};
pub use http::{Application, MAX_COMMIT_BODY_BYTES};
pub use import::{IdSource, ImportError, RandomIds, import_directory};
pub use memory::MemorySpaceRepository;
pub use repository::{
    AggregateInput, AggregateLoad, AggregateRefusal, AssetStored, CommitRefusal, CommitResult,
    InitializeResult, LoadedAggregate, LoadedSpace, ReplaceResult, RepositoryError, Revision,
    SpaceChange, SpaceCommit, SpaceConflict, SpaceRepository, SpaceSummary,
};
pub use run::{
    Clock, RUN_QUIET_PERIOD, Run, RunApplication, RunBuilder, RunEvent, RunStopped, TokioClock,
    Unset,
};
pub use shell::{BuiltFiles, Shell};
pub use wire::{DecodeError, decode_commit};
