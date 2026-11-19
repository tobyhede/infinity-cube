//! Export: the stored aggregate written to an Aggregate directory in place
//! (ADR 0119, `src/export/export-aggregate.ts` and
//! `src/aggregate-directory/`), byte for byte as the TypeScript Export
//! writes it.
//!
//! Only the files Import reads are written or removed; a file whose bytes
//! already match is not touched; every other file is written to a temporary
//! name beside it and renamed over it; the directory and its Space
//! directories are never moved; and git, not InfinityCube, answers for a
//! write that fails part-way. The files are checked to read back as an
//! aggregate before any is written.

use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::path::{Path, PathBuf};

use bytes::Bytes;
use intake::assets::{asset_file_hash, is_asset_ref};
use intake::json::JsonValue;
use intake::{
    AGGREGATE_FILE_NAME, ASSETS_DIRECTORY_NAME, AggregateFiles, Refusals, SpaceId, SpaceSnapshot,
    Uuid, import_aggregate, space_directory_id,
};

use crate::assets::{AssetHash, StoredAsset};
use crate::directory::{EntryKind, Filesystem, discover, join};
use crate::document::{resource_file, space_file};
use crate::json_text::file_text;
use crate::repository::{AggregateLoad, LoadedAggregate, RepositoryError, SpaceRepository};

/// Why an Export wrote nothing, or stopped part-way.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum ExportError {
    /// The store holds no aggregate to write.
    #[error("the store holds no aggregate to write")]
    Uninitialized,
    /// The store could not be read.
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    /// The files would not read back as the aggregate they were written from;
    /// nothing was written.
    #[error("the written aggregate does not read back as a valid aggregate: {0}")]
    WouldNotReadBack(Refusals),
    /// The destination holds something Export will not write through or
    /// beside; nothing was written.
    #[error("{0}")]
    Destination(String),
    /// A file could not be read, written or removed; some files may be new
    /// and some old, which git restores.
    #[error("{path}: {source}")]
    Io {
        /// The file or directory.
        path: PathBuf,
        /// What failed.
        source: io::Error,
    },
}

fn io_error(path: &Path) -> impl FnOnce(io::Error) -> ExportError + '_ {
    move |source| ExportError::Io {
        path: path.to_path_buf(),
        source,
    }
}

/// An Export that wrote every file. A Space in `unrecorded` was written but
/// its revision could not be recorded, so it still reads as changed since
/// its last Export.
#[derive(Debug)]
#[must_use]
pub struct Exported {
    /// The aggregate written.
    pub aggregate: LoadedAggregate,
    /// Each Space whose Export could not be recorded, and why.
    pub unrecorded: Vec<(SpaceId, RepositoryError)>,
}

fn collect_refs(value: &JsonValue, found: &mut BTreeSet<String>) {
    match value {
        JsonValue::String(text) if is_asset_ref(text) => {
            found.insert(text["/assets/".len()..].to_owned());
        }
        JsonValue::Array(items) => items.iter().for_each(|item| collect_refs(item, found)),
        JsonValue::Object(object) => object
            .iter()
            .for_each(|(_, item)| collect_refs(item, found)),
        _ => {}
    }
}

/// Every asset hash a Resource's content or a placement's Map content
/// references, whatever its kind, once each, in code unit order.
pub(crate) fn referenced_asset_hashes<'a>(
    spaces: impl IntoIterator<Item = &'a SpaceSnapshot>,
) -> Vec<AssetHash> {
    let mut found = BTreeSet::new();
    for space in spaces {
        for map in space.document.maps.iter().flatten() {
            for (_, placement) in &map.positions {
                if let Some(content) = &placement.content {
                    collect_refs(content, &mut found);
                }
            }
        }
        for resource in &space.resources {
            collect_refs(&resource.content, &mut found);
        }
    }
    found
        .iter()
        .filter_map(|hash| AssetHash::parse(hash))
        .collect()
}

/// Every file an aggregate and the stored assets it carries serialise to,
/// by path relative to the Aggregate directory.
pub(crate) fn aggregate_files(
    aggregate: &LoadedAggregate,
    assets: &[StoredAsset],
) -> BTreeMap<String, Bytes> {
    let mut files = BTreeMap::new();
    let aggregate_file: JsonValue = JsonValue::Object(
        [
            ("version".to_owned(), JsonValue::Number(1.0)),
            (
                "metaSpaceId".to_owned(),
                JsonValue::String(aggregate.meta_space_id.as_str().to_owned()),
            ),
        ]
        .into_iter()
        .collect(),
    );
    files.insert(
        AGGREGATE_FILE_NAME.to_owned(),
        Bytes::from(file_text(&aggregate_file)),
    );
    for space in &aggregate.spaces {
        let snapshot = &space.snapshot;
        files.insert(
            format!("{}/space.json", snapshot.id),
            Bytes::from(file_text(&space_file(snapshot))),
        );
        for resource in &snapshot.resources {
            files.insert(
                format!("{}/resources/{}.json", snapshot.id, resource.id),
                Bytes::from(file_text(&resource_file(resource))),
            );
        }
    }
    for asset in assets {
        files.insert(
            format!("{ASSETS_DIRECTORY_NAME}/{}", asset.file_name()),
            asset.bytes.clone(),
        );
    }
    files
}

fn asset_path_hash(path: &str) -> Option<&str> {
    path.strip_prefix("assets/").and_then(asset_file_hash)
}

/// Refuse to write through a symbolic link: the directory, any path given,
/// or any directory between them.
async fn reject_links<'a>(
    fs: &impl Filesystem,
    root: &Path,
    paths: impl IntoIterator<Item = &'a String>,
) -> Result<(), ExportError> {
    let mut checked: BTreeSet<PathBuf> = BTreeSet::from([root.to_path_buf()]);
    for path in paths {
        let mut current = join(root, path);
        while current != root && checked.insert(current.clone()) {
            match current.parent() {
                Some(parent) => current = parent.to_path_buf(),
                None => break,
            }
        }
    }
    for path in checked {
        if fs.kind(&path).await.map_err(io_error(&path))? == Some(EntryKind::SymbolicLink) {
            return Err(ExportError::Destination(format!(
                "Export destination contains a symbolic link: {}",
                path.display()
            )));
        }
    }
    Ok(())
}

async fn holds_bytes(fs: &impl Filesystem, path: &Path, bytes: &[u8]) -> Result<bool, ExportError> {
    match fs.read(path).await {
        Ok(held) => Ok(held == bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(io_error(path)(error)),
    }
}

/// Replace one file through a temporary file beside it, created exclusively
/// under a dot-prefixed name Import never reads.
async fn replace_file(fs: &impl Filesystem, path: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let directory = path.parent().unwrap_or(path);
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    for attempt in 0u32.. {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!(".{attempt}")
        };
        let temporary = directory.join(format!(".{name}{suffix}.export-write"));
        match fs.create_new(&temporary, bytes).await {
            Ok(()) => {
                return match fs.rename(&temporary, path).await {
                    Ok(()) => Ok(()),
                    Err(error) => {
                        let _ = fs.remove_file(&temporary).await;
                        Err(io_error(path)(error))
                    }
                };
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                let _ = fs.remove_file(&temporary).await;
                return Err(io_error(&temporary)(error));
            }
        }
    }
    Err(ExportError::Destination(format!(
        "no temporary name was free beside {}",
        path.display()
    )))
}

/// Remove `from` and each directory above it, short of `root`, while empty.
async fn remove_empty_directories(fs: &impl Filesystem, root: &Path, from: &Path) {
    let mut current = from.to_path_buf();
    while current != root && current.starts_with(root) {
        if fs.remove_dir(&current).await.is_err() {
            return;
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return,
        }
    }
}

/// Make `root` hold `files`, in place, removing each of `owned` that
/// `files` does not name.
async fn write_in_place(
    fs: &impl Filesystem,
    root: &Path,
    files: &BTreeMap<String, Bytes>,
    owned: &[String],
) -> Result<(), ExportError> {
    let mut obsolete: Vec<&String> = owned
        .iter()
        .filter(|path| !files.contains_key(*path))
        .collect();
    obsolete.sort_by(|left, right| intake::text::compare_utf16(left, right));
    reject_links(fs, root, files.keys().chain(obsolete.iter().copied())).await?;
    fs.create_dir_all(root).await.map_err(io_error(root))?;
    for (path, bytes) in files {
        let target = join(root, path);
        if holds_bytes(fs, &target, bytes).await? {
            continue;
        }
        if let Some(parent) = target.parent() {
            fs.create_dir_all(parent).await.map_err(io_error(parent))?;
        }
        replace_file(fs, &target, bytes).await?;
    }
    for path in obsolete {
        let target = join(root, path);
        match fs.remove_file(&target).await {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(io_error(&target)(error)),
        }
        if let Some(parent) = target.parent() {
            remove_empty_directories(fs, root, parent).await;
        }
    }
    Ok(())
}

/// Check the files read back through Import as an aggregate naming the same
/// Meta Space, minting nothing.
fn check_reads_back(
    files: &BTreeMap<String, Bytes>,
    kept: Vec<(String, Vec<u8>)>,
    meta_space_id: SpaceId,
) -> Result<(), ExportError> {
    let mut entries = AggregateFiles::new();
    for (path, bytes) in files {
        entries.insert_file(path.clone(), bytes.to_vec());
    }
    for (path, bytes) in kept {
        entries.insert_file(path, bytes);
    }
    let Some(nil) = Uuid::parse("00000000-0000-0000-0000-000000000000") else {
        return Err(ExportError::Destination(
            "the nil UUID did not parse".to_owned(),
        ));
    };
    let mut minted = false;
    let imported = import_aggregate(entries, || {
        minted = true;
        nil
    });
    if minted {
        return Err(ExportError::Destination(
            "canonical Export wrote an entity with no id".to_owned(),
        ));
    }
    match imported {
        Err(refusals) => Err(ExportError::WouldNotReadBack(refusals)),
        Ok(read) if read.aggregate.meta_space_id() != meta_space_id => {
            Err(ExportError::Destination(format!(
                "the exported aggregate names Meta Space {} rather than {meta_space_id}",
                read.aggregate.meta_space_id()
            )))
        }
        Ok(_) => Ok(()),
    }
}

/// Write the complete stored aggregate to `destination`, in place.
///
/// One read of the aggregate is the whole of what is written. Each stored
/// asset a Resource's content or a placement's Map content references is
/// written to `assets/`, under the name it already has there if it has one;
/// an asset no longer referenced has its file removed; a referenced asset
/// the store holds no bytes for (and the asset of zero bytes) keeps whatever
/// file it has. Then each Space's Export is recorded.
///
/// # Errors
///
/// [`ExportError`]: nothing written for an uninitialized store, a refused
/// read back or a destination holding a link or a misnamed Space directory;
/// part-written for an IO failure while writing.
pub async fn export_aggregate<R: SpaceRepository, F: Filesystem>(
    repository: &R,
    fs: &F,
    destination: &Path,
) -> Result<Exported, ExportError> {
    let AggregateLoad::Loaded(aggregate) = repository.load_aggregate().await? else {
        return Err(ExportError::Uninitialized);
    };
    let mut carried = Vec::new();
    let mut kept = BTreeSet::new();
    for hash in referenced_asset_hashes(aggregate.spaces.iter().map(|space| &space.snapshot)) {
        match repository.load_asset(&hash).await? {
            Some(asset) if !hash.is_empty_asset() => carried.push(asset),
            _ => {
                kept.insert(hash.as_str().to_owned());
            }
        }
    }

    let serialised = aggregate_files(&aggregate, &carried);
    reject_links(fs, destination, serialised.keys()).await?;
    let discovery = discover(fs, destination).await;
    let unreadable: Vec<&String> = discovery
        .space_directories
        .iter()
        .filter(|name| space_directory_id(name).is_none())
        .collect();
    if !unreadable.is_empty() {
        return Err(ExportError::Destination(format!(
            "Export destination holds a Space directory that is not named for its Space, so the export could not be read back: {}",
            unreadable
                .iter()
                .map(|name| name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    let scanned = discovery.files().map_err(ExportError::Destination)?;

    // An asset already in the directory keeps its name there.
    let mut files = BTreeMap::new();
    for (path, bytes) in serialised {
        let renamed = asset_path_hash(&path).and_then(|hash| {
            scanned
                .iter()
                .find(|existing| asset_path_hash(existing) == Some(hash))
                .cloned()
        });
        files.insert(renamed.unwrap_or(path), bytes);
    }
    reject_links(fs, destination, files.keys()).await?;

    let is_kept = |path: &str| asset_path_hash(path).is_some_and(|hash| kept.contains(hash));
    let mut kept_files = Vec::new();
    for path in scanned.iter().filter(|path| is_kept(path)) {
        let full = join(destination, path);
        kept_files.push((path.clone(), fs.read(&full).await.map_err(io_error(&full))?));
    }
    check_reads_back(&files, kept_files, aggregate.meta_space_id)?;

    let owned: Vec<String> = scanned.into_iter().filter(|path| !is_kept(path)).collect();
    write_in_place(fs, destination, &files, &owned).await?;

    let mut unrecorded = Vec::new();
    for space in &aggregate.spaces {
        if let Err(error) = repository
            .mark_exported(space.snapshot.id, space.revision)
            .await
        {
            unrecorded.push((space.snapshot.id, error));
        }
    }
    Ok(Exported {
        aggregate,
        unrecorded,
    })
}
