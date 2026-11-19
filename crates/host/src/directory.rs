//! An Aggregate directory on disk: the small filesystem seam the host reads
//! and writes through, and the one discovery rule both Import and Export
//! follow (`scanAggregateFrom`, `packages/aggregate/src/aggregate-file.ts`).
//!
//! Importing reads `aggregate.json`; each child directory holding a
//! `space.json`, that file and its `resources/*.json`; and the files directly
//! in `assets/` named by a valid hash. Export owns exactly those files and
//! nothing else, so notes, a sibling aggregate and `.git` are never touched.

use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};

use intake::assets::asset_file_hash;
use intake::{
    AGGREGATE_FILE_NAME, ASSETS_DIRECTORY_NAME, AggregateFiles, Entry, space_directory_id,
};

/// What a directory entry is, read without following a symbolic link.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    /// A regular file.
    File,
    /// A directory.
    Directory,
    /// A symbolic link, which InfinityCube neither reads nor writes through.
    SymbolicLink,
    /// Anything else: a socket, a device, a pipe.
    Other,
}

/// The filesystem operations the host's Import and Export use, so a test can
/// stand between the host and the disk. [`TokioFilesystem`] is the real one.
pub trait Filesystem: Send + Sync + 'static {
    /// The entries directly in `directory`, by name, each read without
    /// following a link.
    fn list(
        &self,
        directory: &Path,
    ) -> impl Future<Output = io::Result<Vec<(String, EntryKind)>>> + Send;

    /// What is at `path`, without following a link; `None` when nothing is.
    fn kind(&self, path: &Path) -> impl Future<Output = io::Result<Option<EntryKind>>> + Send;

    /// A file's bytes.
    fn read(&self, path: &Path) -> impl Future<Output = io::Result<Vec<u8>>> + Send;

    /// Create `directory` and every missing directory above it.
    fn create_dir_all(&self, directory: &Path) -> impl Future<Output = io::Result<()>> + Send;

    /// Create a new file at `path` holding `bytes`, failing with
    /// [`io::ErrorKind::AlreadyExists`] if anything is there.
    fn create_new(&self, path: &Path, bytes: &[u8]) -> impl Future<Output = io::Result<()>> + Send;

    /// Rename `from` over `to`.
    fn rename(&self, from: &Path, to: &Path) -> impl Future<Output = io::Result<()>> + Send;

    /// Remove a file.
    fn remove_file(&self, path: &Path) -> impl Future<Output = io::Result<()>> + Send;

    /// Remove an empty directory.
    fn remove_dir(&self, path: &Path) -> impl Future<Output = io::Result<()>> + Send;
}

/// The real filesystem, through `tokio::fs`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TokioFilesystem;

fn kind_of(file_type: std::fs::FileType) -> EntryKind {
    if file_type.is_symlink() {
        EntryKind::SymbolicLink
    } else if file_type.is_dir() {
        EntryKind::Directory
    } else if file_type.is_file() {
        EntryKind::File
    } else {
        EntryKind::Other
    }
}

impl Filesystem for TokioFilesystem {
    async fn list(&self, directory: &Path) -> io::Result<Vec<(String, EntryKind)>> {
        let mut entries = tokio::fs::read_dir(directory).await?;
        let mut listed = Vec::new();
        while let Some(entry) = entries.next_entry().await? {
            // A name that is not UTF-8 is no name Import owns.
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            listed.push((name, kind_of(entry.file_type().await?)));
        }
        Ok(listed)
    }

    async fn kind(&self, path: &Path) -> io::Result<Option<EntryKind>> {
        match tokio::fs::symlink_metadata(path).await {
            Ok(metadata) => Ok(Some(kind_of(metadata.file_type()))),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    async fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        tokio::fs::read(path).await
    }

    async fn create_dir_all(&self, directory: &Path) -> io::Result<()> {
        tokio::fs::create_dir_all(directory).await
    }

    async fn create_new(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        use tokio::io::AsyncWriteExt as _;
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .await?;
        file.write_all(bytes).await?;
        file.flush().await?;
        file.sync_all().await
    }

    async fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        tokio::fs::rename(from, to).await
    }

    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        tokio::fs::remove_file(path).await
    }

    async fn remove_dir(&self, path: &Path) -> io::Result<()> {
        tokio::fs::remove_dir(path).await
    }
}

/// A directory joined with a relative path written with `/` between segments.
pub(crate) fn join(root: &Path, relative: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    path.extend(relative.split('/').filter(|segment| !segment.is_empty()));
    path
}

fn child(directory: &str, name: &str) -> String {
    if directory.is_empty() {
        name.to_owned()
    } else {
        format!("{directory}/{name}")
    }
}

/// What discovery found at a path Importing owns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Found {
    /// A file Importing reads.
    File,
    /// A symbolic link where Importing owns the path.
    Link,
    /// A directory that could not be listed.
    Unlistable,
}

/// The paths Importing owns in a directory, found by listing alone.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Discovery {
    /// Each owned path and what is there.
    pub(crate) entries: Vec<(String, Found)>,
    /// Each child directory holding a `space.json`, by name.
    pub(crate) space_directories: Vec<String>,
}

impl Discovery {
    /// The owned files, when nothing owned is a link or unlistable.
    pub(crate) fn files(&self) -> Result<Vec<String>, String> {
        let mut files = Vec::new();
        for (path, found) in &self.entries {
            match found {
                Found::File => files.push(path.clone()),
                Found::Link => return Err(format!("{path}: is a symbolic link")),
                Found::Unlistable => return Err(format!("{path}: could not be listed")),
            }
        }
        Ok(files)
    }
}

async fn list_or(
    fs: &impl Filesystem,
    root: &Path,
    relative: &str,
    discovery: &mut Discovery,
) -> Option<Vec<(String, EntryKind)>> {
    match fs.list(&join(root, relative)).await {
        Ok(entries) => Some(entries),
        Err(_) => {
            let path = if relative.is_empty() { "." } else { relative };
            discovery.entries.push((path.to_owned(), Found::Unlistable));
            None
        }
    }
}

/// Discover what Importing owns under `root`. A root that does not exist
/// holds nothing.
pub(crate) async fn discover(fs: &impl Filesystem, root: &Path) -> Discovery {
    let mut discovery = Discovery::default();
    if matches!(fs.kind(root).await, Ok(None)) {
        return discovery;
    }
    let Some(listed) = list_or(fs, root, "", &mut discovery).await else {
        return discovery;
    };
    let mut directories = Vec::new();
    // `assets/` is listed whenever it is there and not a link, so a file of
    // that name cannot be listed, as `scanAggregateFrom` finds.
    let mut assets_entry = false;
    for (name, kind) in listed {
        let owned_name = name == AGGREGATE_FILE_NAME
            || name == ASSETS_DIRECTORY_NAME
            || space_directory_id(&name).is_some();
        match kind {
            EntryKind::SymbolicLink if owned_name => discovery.entries.push((name, Found::Link)),
            EntryKind::File if name == AGGREGATE_FILE_NAME => {
                discovery.entries.push((name, Found::File));
            }
            _ if name == ASSETS_DIRECTORY_NAME => assets_entry = true,
            EntryKind::Directory => directories.push(name),
            _ => {}
        }
    }
    directories.sort_by(|left, right| intake::text::compare_utf16(left, right));
    for name in directories {
        let Some(inside) = list_or(fs, root, &name, &mut discovery).await else {
            continue;
        };
        let space_file = inside.iter().find(|(entry, _)| entry == "space.json");
        let Some((_, space_kind)) = space_file else {
            continue;
        };
        if !matches!(space_kind, EntryKind::File | EntryKind::SymbolicLink) {
            continue;
        }
        discovery.space_directories.push(name.clone());
        let found = if *space_kind == EntryKind::SymbolicLink {
            Found::Link
        } else {
            Found::File
        };
        discovery.entries.push((child(&name, "space.json"), found));
        let resources = child(&name, "resources");
        match inside.iter().find(|(entry, _)| entry == "resources") {
            Some((_, EntryKind::SymbolicLink)) => discovery.entries.push((resources, Found::Link)),
            // A file named `resources` cannot be listed.
            Some(_) => {
                let Some(files) = list_or(fs, root, &resources, &mut discovery).await else {
                    continue;
                };
                let mut owned: Vec<(String, Found)> = files
                    .into_iter()
                    .filter(|(file, _)| file.ends_with(".json"))
                    .filter_map(|(file, kind)| match kind {
                        EntryKind::File => Some((child(&resources, &file), Found::File)),
                        EntryKind::SymbolicLink => Some((child(&resources, &file), Found::Link)),
                        _ => None,
                    })
                    .collect();
                owned.sort_by(|(left, _), (right, _)| intake::text::compare_utf16(left, right));
                discovery.entries.extend(owned);
            }
            None => {}
        }
    }
    if assets_entry
        && let Some(files) = list_or(fs, root, ASSETS_DIRECTORY_NAME, &mut discovery).await
    {
        let mut owned: Vec<(String, Found)> = files
            .into_iter()
            .filter(|(name, _)| asset_file_hash(name).is_some())
            .filter_map(|(name, kind)| match kind {
                EntryKind::File => Some((child(ASSETS_DIRECTORY_NAME, &name), Found::File)),
                EntryKind::SymbolicLink => Some((child(ASSETS_DIRECTORY_NAME, &name), Found::Link)),
                _ => None,
            })
            .collect();
        owned.sort_by(|(left, _), (right, _)| intake::text::compare_utf16(left, right));
        discovery.entries.extend(owned);
    }
    discovery
}

/// Read what Importing reads under `root` into the entries intake takes:
/// each owned file's bytes, or why it could not be read, each owned link and
/// each directory that could not be listed.
pub(crate) async fn read_files(fs: &impl Filesystem, root: &Path) -> AggregateFiles {
    let discovery = discover(fs, root).await;
    let mut files = AggregateFiles::new();
    for (path, found) in discovery.entries {
        let entry = match found {
            Found::File => match fs.read(&join(root, &path)).await {
                Ok(bytes) => Entry::File(bytes),
                Err(_) => Entry::Unreadable,
            },
            Found::Link => Entry::SymbolicLink,
            Found::Unlistable => Entry::Unlistable,
        };
        files.insert(path, entry);
    }
    files
}

/// Whether `root` is missing or holds nothing but dot-entries, so it holds
/// no aggregate to run and `init` may write one there.
///
/// # Errors
///
/// Returns the failure to list a directory that exists.
pub(crate) async fn holds_nothing(fs: &impl Filesystem, root: &Path) -> io::Result<bool> {
    match fs.list(root).await {
        Ok(entries) => Ok(entries.iter().all(|(name, _)| name.starts_with('.'))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}
