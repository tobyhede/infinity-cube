//! `init`: a new aggregate written to a missing or empty directory, as
//! `initAggregate` in `src/run/run.ts` writes it (Storage ST-11, ST-70).
//!
//! The new aggregate is the new Space of `packages/graph/src/new-space.ts`:
//! `Resource 1`, an empty Markdown Resource, alone in `Map 1` with one empty
//! `Graph 1`, in a Space titled as the caller asks that is the Meta Space:
//! `New space` from `init`, the name a presenter gives from the desktop
//! application's New Space (Storage ST-131). It is
//! built as an aggregate's files, read through intake into a memory store and
//! written by Export, so the bytes on disk are Export's. The ids are minted
//! in the TypeScript generator's order: the Space, the Resource, the Map and
//! the Graph. `conformance/init/` holds both runtimes to the same files.

use std::io;
use std::path::Path;

use intake::json::JsonValue;
use intake::{AGGREGATE_FILE_NAME, AggregateFiles, Refusals, import_aggregate};

use crate::repository::AggregateInput;

use crate::directory::{Filesystem, holds_nothing};
use crate::export::{ExportError, export_aggregate};
use crate::import::{IdSource, ImportError, import_files};
use crate::json_text::compact;
use crate::memory::MemorySpaceRepository;

/// The asset an empty Markdown Resource's text is: the SHA-256 of no bytes,
/// as `newEmptyResourceDocument` names it.
const EMPTY_TEXT_URL: &str = "/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

/// The colour `nextGraphColor` gives a Map's first Graph.
const FIRST_GRAPH_COLOR: &str = "#1f77b4";

/// The Title `init` gives the new aggregate's Meta Space, as
/// `newSpace` in `packages/graph/src/new-space.ts` does.
pub const NEW_SPACE_TITLE: &str = "New space";

/// What `init` did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum Initialized {
    /// The new aggregate was written.
    Written,
    /// The directory holds something other than dot-entries; nothing was written.
    NotEmpty,
}

/// Why `init` could not write the new aggregate.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum InitError {
    /// The directory could not be listed.
    #[error("the directory could not be listed: {0}")]
    Io(#[from] io::Error),
    /// The new aggregate did not read in; a defect, never the directory's fault.
    #[error("the new aggregate did not read in: {0}")]
    Import(#[from] ImportError),
    /// Export failed to write it.
    #[error(transparent)]
    Export(#[from] ExportError),
}

/// The new aggregate's files, before Export formats them.
fn new_aggregate(title: &str, ids: &impl IdSource) -> AggregateFiles {
    let title = compact(&JsonValue::String(title.to_owned()));
    let space = ids.new_id();
    let resource = ids.new_id();
    let map = ids.new_id();
    let graph = ids.new_id();
    let mut files = AggregateFiles::new();
    files.insert_file(
        AGGREGATE_FILE_NAME,
        format!(r#"{{"version":1,"metaSpaceId":"{space}"}}"#),
    );
    files.insert_file(
        format!("{space}/space.json"),
        format!(
            r#"{{"version":1,"id":"{space}","title":{title},"maps":[{{"id":"{map}","title":"Map 1","kind":"positioned","positions":{{"{resource}":{{"x":0,"y":0}}}},"graphs":[{{"id":"{graph}","title":"Graph 1","color":"{FIRST_GRAPH_COLOR}","headShape":"arrow","edges":[]}}],"activeGraph":"{graph}"}}],"defaultMap":"{map}"}}"#
        ),
    );
    files.insert_file(
        format!("{space}/resources/{resource}.json"),
        format!(
            r#"{{"id":"{resource}","title":"Resource 1","kind":"markdown","content":{{"url":"{EMPTY_TEXT_URL}"}}}}"#
        ),
    );
    files
}

/// The new aggregate as the lifecycle doors take it: the Default Content a
/// store-backed host initializes an uninitialized store from
/// (`defaultContentAggregate`, ADR 0077), minting its ids in the same order.
pub(crate) fn default_content(ids: &impl IdSource) -> Result<AggregateInput, Refusals> {
    let imported = import_aggregate(new_aggregate(NEW_SPACE_TITLE, ids), || ids.new_id())?;
    let meta_space_id = imported.aggregate.meta_space_id();
    let spaces = imported
        .aggregate
        .into_spaces()
        .into_iter()
        .map(intake::Space::into_snapshot)
        .collect();
    Ok(AggregateInput {
        meta_space_id,
        spaces,
    })
}

/// Write a new aggregate to `directory`, its Meta Space titled `title`, if it
/// is missing or holds nothing but dot-entries, which it leaves as they are.
///
/// # Errors
///
/// [`InitError`]: the directory could not be listed, or Export failed part-way.
pub async fn init_directory<F: Filesystem, I: IdSource>(
    fs: &F,
    directory: &Path,
    title: &str,
    ids: &I,
) -> Result<Initialized, InitError> {
    if !holds_nothing(fs, directory).await? {
        return Ok(Initialized::NotEmpty);
    }
    let store = MemorySpaceRepository::new();
    import_files(&store, new_aggregate(title, ids), ids).await?;
    // The store is discarded, so a Space whose Export it failed to record
    // (`Exported::unrecorded`) changes nothing on disk.
    let _written = export_aggregate(&store, fs, directory).await?;
    Ok(Initialized::Written)
}
