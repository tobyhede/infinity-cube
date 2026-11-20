//! An Aggregate directory's files, read as Import reads them
//! (`readAggregateFrom`): the root and `aggregate.json`, then every listing,
//! then every file, each stage reporting all of its faults and a stage that
//! refuses stopping the read. The files arrive as bytes by path; reading them
//! from a disk, and turning what a disk answers into [`Entry`] values, is the
//! host's.

use std::collections::{BTreeMap, HashSet};

use crate::aggregate::{SpaceAggregate, load_aggregate};
use crate::assets::{
    Asset, MAX_ASSET_BYTES, asset_file_extension, asset_file_hash, asset_hash_of,
    media_type_for_extension,
};
use crate::ids::{GraphId, MapId, SpaceId, Uuid};
use crate::json::{decode_text, parse};
use crate::model::{DraftSpaceFile, Graph, Map, MapKind, Resource, SpaceDocument, SpaceSnapshot};
use crate::refusal::{Refusal, Refusals, ShapeProblem};
use crate::schema::{
    DocumentRefusal, Ids, aggregate_file, document_refusal, resource_file, space_file,
};
use crate::shape::Issue;
use crate::text::compare_utf16;

/// The aggregate file's name, at the directory's root.
pub const AGGREGATE_FILE_NAME: &str = "aggregate.json";

/// The directory holding the stored assets' bytes.
pub const ASSETS_DIRECTORY_NAME: &str = "assets";

/// A Space directory's space file.
pub(crate) const SPACE_FILE_NAME: &str = "space.json";

/// A Space directory's directory of Resource files.
pub(crate) const RESOURCES_DIRECTORY_NAME: &str = "resources";

/// What the host found at one path of an Aggregate directory.
///
/// A directory is implied by the paths beneath it, and one the host cannot
/// open to list is [`Unlistable`](Entry::Unlistable), which Import refuses as
/// [`Refusal::Unreadable`] wherever it lists one. Where Import lists a
/// directory by name (`assets` and a Space directory's `resources`), a
/// [`File`](Entry::File) or [`Unreadable`](Entry::Unreadable) entry at that
/// path cannot be listed and is refused the same way, as the TypeScript
/// reader's `ENOTDIR` is. Any other file at the root but `aggregate.json` is
/// not read, readable or not.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum Entry {
    /// A file, and its bytes.
    File(Vec<u8>),
    /// A file that could not be read.
    Unreadable,
    /// A directory that could not be listed.
    Unlistable,
    /// A symbolic link, file or directory, which InfinityCube neither reads nor writes through.
    SymbolicLink,
}

/// An Aggregate directory's entries, by path relative to it with `/` between
/// segments; a directory is implied by the paths beneath it.
///
/// The path `.` names the directory itself, for a root that could not be listed.
///
/// # Examples
///
/// ```
/// use intake::{import_aggregate, AggregateFiles};
///
/// let mut files = AggregateFiles::new();
/// files.insert_file("aggregate.json", br#"{"version": 1, "metaSpaceId": "10000000-0000-4000-8000-000000000001"}"#);
/// files.insert_file(
///     "10000000-0000-4000-8000-000000000001/space.json",
///     br#"{"version": 1, "id": "10000000-0000-4000-8000-000000000001", "title": "Space"}"#,
/// );
/// let imported = import_aggregate(files, || unreachable!("every id is written down"));
/// assert!(imported.is_ok());
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AggregateFiles {
    entries: BTreeMap<String, Entry>,
}

impl AggregateFiles {
    /// No entries: a directory with nothing in it.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Record what is at `path`.
    pub fn insert(&mut self, path: impl Into<String>, entry: Entry) {
        self.entries.insert(path.into(), entry);
    }

    /// Record a file and its bytes.
    pub fn insert_file(&mut self, path: impl Into<String>, bytes: impl Into<Vec<u8>>) {
        self.insert(path, Entry::File(bytes.into()));
    }

    /// The entry at `path`.
    #[must_use]
    pub fn get(&self, path: &str) -> Option<&Entry> {
        self.entries.get(path)
    }

    fn take_bytes(&mut self, path: &str) -> Option<Vec<u8>> {
        match self.entries.get_mut(path) {
            Some(Entry::File(bytes)) => Some(std::mem::take(bytes)),
            _ => None,
        }
    }

    fn is_unreadable(&self, path: &str) -> bool {
        matches!(self.entries.get(path), Some(Entry::Unreadable))
    }

    /// The names directly in `directory` (`""` for the root).
    fn list(&self, directory: &str) -> Listing<'_> {
        let prefix = if directory.is_empty() {
            String::new()
        } else {
            format!("{directory}/")
        };
        let mut listing = Listing {
            // A file where a directory is listed cannot be listed (ENOTDIR).
            unlistable: matches!(
                self.entries
                    .get(if directory.is_empty() { "." } else { directory }),
                Some(Entry::Unlistable | Entry::File(_) | Entry::Unreadable)
            ),
            ..Listing::default()
        };
        for (path, entry) in self.entries.range(prefix.clone()..) {
            let Some(rest) = path.strip_prefix(&prefix) else {
                break;
            };
            if rest.is_empty() || (directory.is_empty() && rest == ".") {
                continue;
            }
            match rest.split_once('/') {
                Some((name, _)) => {
                    if listing.directories.last() != Some(&name) {
                        listing.directories.push(name);
                    }
                }
                None => match entry {
                    Entry::File(_) | Entry::Unreadable => listing.files.push(rest),
                    Entry::Unlistable => listing.directories.push(rest),
                    Entry::SymbolicLink => listing.links.push(rest),
                },
            }
        }
        listing.directories.sort_unstable();
        listing.directories.dedup();
        listing
    }
}

impl FromIterator<(String, Vec<u8>)> for AggregateFiles {
    fn from_iter<I: IntoIterator<Item = (String, Vec<u8>)>>(files: I) -> Self {
        Self {
            entries: files
                .into_iter()
                .map(|(path, bytes)| (path, Entry::File(bytes)))
                .collect(),
        }
    }
}

#[derive(Debug, Default)]
struct Listing<'a> {
    files: Vec<&'a str>,
    directories: Vec<&'a str>,
    links: Vec<&'a str>,
    unlistable: bool,
}

/// What an Aggregate directory holds, read and identified but not yet
/// checked as an aggregate: the input [`load_aggregate`] takes, and the assets
/// `assets/` carries beside it.
#[derive(Debug, Clone, PartialEq)]
pub struct AggregateContents {
    /// The Meta Space `aggregate.json` names.
    pub meta_space_id: SpaceId,
    /// Each Space, ascending by its directory's name.
    pub spaces: Vec<SpaceSnapshot>,
    /// Each asset, in ordinal order of its file's name.
    pub assets: Vec<Asset>,
}

/// An Aggregate directory Imported: the aggregate intake accepted, and its assets.
#[derive(Debug, Clone, PartialEq)]
pub struct ImportedAggregate {
    /// The aggregate.
    pub aggregate: SpaceAggregate,
    /// The assets `assets/` carries.
    pub assets: Vec<Asset>,
}

/// The Space Id a directory name spells: a UUID in lower case, else `None`.
#[must_use]
pub fn space_directory_id(name: &str) -> Option<SpaceId> {
    SpaceId::parse(name).filter(|id| id.uuid().is_lower_case())
}

fn sort_utf16(names: &mut [impl AsRef<str>]) {
    names.sort_by(|left, right| compare_utf16(left.as_ref(), right.as_ref()));
}

fn join(directory: &str, name: &str) -> String {
    if directory.is_empty() {
        name.to_owned()
    } else {
        format!("{directory}/{name}")
    }
}

fn link_refusals(mut paths: Vec<String>) -> Vec<Refusal> {
    sort_utf16(&mut paths);
    paths
        .into_iter()
        .map(|path| Refusal::SymbolicLink { path })
        .collect()
}

/// One refusal per issue, each made by `refusal` from the file, the issue's
/// field and its problem.
fn issue_refusals(
    file: &str,
    issues: Vec<Issue>,
    refusal: impl Fn(String, Option<String>, ShapeProblem) -> Refusal,
) -> Vec<Refusal> {
    issues
        .into_iter()
        .map(|issue| refusal(file.to_owned(), issue.field, issue.problem))
        .collect()
}

fn shape_refusals(file: &str, issues: Vec<Issue>) -> Vec<Refusal> {
    issue_refusals(file, issues, |file, field, problem| Refusal::InvalidShape {
        file,
        field,
        problem,
    })
}

/// One Space directory found by listing.
struct ScannedSpace {
    name: String,
    /// `resources/*.json`, by path inside the directory, in ordinal order.
    resources: Vec<String>,
}

/// What lies beneath the root, found by listing alone.
struct Scanned {
    spaces: Vec<ScannedSpace>,
    /// Asset file names in `assets/`, in ordinal order.
    assets: Vec<String>,
}

fn is_asset_file(name: &str) -> bool {
    asset_file_hash(name).is_some()
}

/// List each child directory, each Space directory's `resources/` and
/// `assets/`, every listing before any refusal.
fn scan_below_root(files: &AggregateFiles, root: &Listing<'_>) -> Result<Scanned, Refusals> {
    let mut names: Vec<&str> = root
        .directories
        .iter()
        .copied()
        .filter(|name| *name != ASSETS_DIRECTORY_NAME)
        .collect();
    sort_utf16(&mut names);
    let mut refusals = Vec::new();
    let mut spaces = Vec::new();
    for name in names {
        let inside = files.list(name);
        if inside.unlistable {
            refusals.push(Refusal::Unreadable {
                path: name.to_owned(),
            });
            continue;
        }
        if !inside.files.contains(&SPACE_FILE_NAME) && !inside.links.contains(&SPACE_FILE_NAME) {
            continue;
        }
        let links: Vec<String> = inside
            .links
            .iter()
            .filter(|entry| **entry == SPACE_FILE_NAME || **entry == RESOURCES_DIRECTORY_NAME)
            .map(|entry| join(name, entry))
            .collect();
        let resources_path = join(name, RESOURCES_DIRECTORY_NAME);
        if links.contains(&resources_path) {
            refusals.extend(link_refusals(links));
            continue;
        }
        let listed = files.list(&resources_path);
        let mut linked = links;
        if !listed.unlistable {
            linked.extend(
                listed
                    .links
                    .iter()
                    .filter(|entry| entry.ends_with(".json"))
                    .map(|entry| join(&resources_path, entry)),
            );
        }
        let faulted = !linked.is_empty() || listed.unlistable;
        refusals.extend(link_refusals(linked));
        if listed.unlistable {
            refusals.push(Refusal::Unreadable {
                path: resources_path,
            });
        }
        if faulted {
            continue;
        }
        let mut resources: Vec<String> = listed
            .files
            .iter()
            .filter(|file| file.ends_with(".json"))
            .map(|file| join(RESOURCES_DIRECTORY_NAME, file))
            .collect();
        sort_utf16(&mut resources);
        spaces.push(ScannedSpace {
            name: name.to_owned(),
            resources,
        });
    }
    let assets = files.list(ASSETS_DIRECTORY_NAME);
    if assets.unlistable {
        refusals.push(Refusal::Unreadable {
            path: ASSETS_DIRECTORY_NAME.to_owned(),
        });
    } else {
        refusals.extend(link_refusals(
            assets
                .links
                .iter()
                .filter(|name| is_asset_file(name))
                .map(|name| join(ASSETS_DIRECTORY_NAME, name))
                .collect(),
        ));
    }
    Refusals::check(refusals)?;
    let mut asset_names: Vec<&str> = assets
        .files
        .iter()
        .copied()
        .filter(|name| is_asset_file(name))
        .collect();
    sort_utf16(&mut asset_names);
    Ok(Scanned {
        spaces,
        assets: asset_names.into_iter().map(str::to_owned).collect(),
    })
}

/// A Space directory read cleanly, before Import mints the ids it left out.
struct SpaceRead {
    id: SpaceId,
    file: DraftSpaceFile,
    resources: Vec<Resource>,
}

/// The refusal a document earns before its shape is read, if any.
fn document_refusal_of(space: SpaceId, refusal: DocumentRefusal) -> Refusal {
    match refusal {
        DocumentRefusal::UnsupportedVersion(version) => {
            Refusal::UnsupportedVersion { space, version }
        }
        DocumentRefusal::RetiredSpaceGraphs => Refusal::RetiredSpaceGraphs { space },
    }
}

/// Read one Space directory (`parseSingleSpace`), or every refusal it earns.
fn read_space(
    files: &mut AggregateFiles,
    scanned: &ScannedSpace,
) -> Result<SpaceRead, Vec<Refusal>> {
    let name = scanned.name.as_str();
    let Some(id) = space_directory_id(name) else {
        return Err(vec![Refusal::SpaceDirectoryName {
            directory: name.to_owned(),
        }]);
    };
    let space_path = join(name, SPACE_FILE_NAME);
    let resource_paths: Vec<String> = scanned
        .resources
        .iter()
        .map(|inside| join(name, inside))
        .collect();
    let space_json = files
        .take_bytes(&space_path)
        .map(|bytes| parse(&decode_text(&bytes)));
    let document = space_json.as_ref().and_then(|parsed| parsed.as_ref().ok());
    if let Some(refusal) = document_refusal(document) {
        return Err(vec![document_refusal_of(id, refusal)]);
    }
    let unreadable: Vec<Refusal> = std::iter::once(&space_path)
        .chain(&resource_paths)
        .filter(|path| files.is_unreadable(path))
        .map(|path| Refusal::Unreadable { path: path.clone() })
        .collect();
    if !unreadable.is_empty() {
        return Err(unreadable);
    }

    let mut refusals = Vec::new();
    let draft = match space_json {
        Some(Ok(json)) => match space_file(&json, Ids::MayBeMinted) {
            Ok(draft) => Some(draft),
            Err(issues) => {
                refusals.extend(shape_refusals(&space_path, issues));
                None
            }
        },
        Some(Err(error)) => {
            refusals.push(Refusal::InvalidJson {
                file: space_path.clone(),
                error,
            });
            None
        }
        None => None,
    };
    let mut resources = Vec::with_capacity(resource_paths.len());
    for path in &resource_paths {
        let bytes = files.take_bytes(path).unwrap_or_default();
        match parse(&decode_text(&bytes)) {
            Err(error) => refusals.push(Refusal::InvalidJson {
                file: path.clone(),
                error,
            }),
            Ok(json) => match resource_file(&json) {
                Ok(resource) => resources.push(resource),
                Err(issues) => {
                    refusals.extend(issue_refusals(path, issues, |file, field, problem| {
                        Refusal::InvalidResourceFile {
                            file,
                            field,
                            problem,
                        }
                    }));
                }
            },
        }
    }
    let Some(file) = draft.filter(|_| refusals.is_empty()) else {
        return Err(refusals);
    };
    if let Some(declared) = file.id
        && declared != id
    {
        return Err(vec![Refusal::SpaceIdMismatch {
            space: id,
            declared: declared.to_string(),
        }]);
    }
    Ok(SpaceRead {
        id,
        file,
        resources,
    })
}

/// Fill in the ids a space file left out: each Map's, then its Graphs', in order.
fn identify(read: SpaceRead, new_id: &mut impl FnMut() -> Uuid) -> SpaceSnapshot {
    let maps = read.file.maps.map(|maps| {
        maps.into_iter()
            .map(|draft| {
                let id = draft.id.unwrap_or_else(|| MapId::from(new_id()));
                let graphs = draft
                    .graphs
                    .into_iter()
                    .map(|graph| Graph {
                        id: graph.id.unwrap_or_else(|| GraphId::from(new_id())),
                        title: graph.title,
                        color: graph.color,
                        head_shape: graph.head_shape,
                        edges: graph.edges,
                    })
                    .collect();
                Map {
                    id,
                    title: draft.title,
                    kind: MapKind::Positioned,
                    positions: draft.positions,
                    graphs,
                    active_graph: draft.active_graph,
                }
            })
            .collect()
    });
    SpaceSnapshot {
        id: read.id,
        document: SpaceDocument {
            title: read.file.title,
            maps,
            default_map: read.file.default_map,
        },
        resources: read.resources,
    }
}

/// Admit the assets `assets/` carries: each under the size cap, named for its
/// content, one file to a hash.
fn read_assets(files: &mut AggregateFiles, names: &[String]) -> (Vec<Asset>, Vec<Refusal>) {
    let mut assets = Vec::new();
    let mut refusals = Vec::new();
    let mut unreadable = Vec::new();
    let mut hashes_seen: HashSet<&str> = HashSet::with_capacity(names.len());
    for name in names {
        let path = join(ASSETS_DIRECTORY_NAME, name);
        let stem = asset_file_hash(name).unwrap_or_default();
        if !hashes_seen.insert(stem) {
            refusals.push(Refusal::DuplicateAsset { name: name.clone() });
        }
        if files.is_unreadable(&path) {
            unreadable.push(Refusal::Unreadable { path });
            continue;
        }
        let bytes = files.take_bytes(&path).unwrap_or_default();
        if bytes.len() > MAX_ASSET_BYTES {
            refusals.push(Refusal::AssetRefused { name: name.clone() });
            continue;
        }
        let hash = asset_hash_of(&bytes);
        if hash != stem {
            refusals.push(Refusal::AssetFileName {
                name: name.clone(),
                expected: hash,
            });
            continue;
        }
        assets.push(Asset {
            hash,
            media_type: media_type_for_extension(asset_file_extension(name)),
            bytes,
        });
    }
    refusals.extend(unreadable);
    (assets, refusals)
}

/// Read an Aggregate directory's files into the input the aggregate intake
/// takes, beside the assets `assets/` carries (`readAggregateFrom`).
///
/// Ids a space file leaves out (a Map's or a Graph's) are minted by
/// `new_id`, Space directory by Space directory in ordinal order; a Space's
/// and a Resource's id are always written down.
///
/// # Errors
///
/// Returns the refusals of the first stage that refuses: a symbolic link at
/// the root or a missing, unreadable or malformed `aggregate.json`; then every
/// listing fault; then every Space directory's and asset's faults together.
pub fn read_aggregate(
    mut files: AggregateFiles,
    mut new_id: impl FnMut() -> Uuid,
) -> Result<AggregateContents, Refusals> {
    let root = files.list("");
    if root.unlistable {
        return Err(Refusals::from_one(Refusal::Unreadable {
            path: ".".to_owned(),
        }));
    }
    Refusals::check(link_refusals(
        root.links
            .iter()
            .filter(|name| {
                matches!(**name, AGGREGATE_FILE_NAME | ASSETS_DIRECTORY_NAME)
                    || space_directory_id(name).is_some()
            })
            .map(|name| (*name).to_owned())
            .collect(),
    ))?;
    if !root.files.contains(&AGGREGATE_FILE_NAME) {
        return Err(Refusals::from_one(Refusal::AggregateFileMissing));
    }
    if files.is_unreadable(AGGREGATE_FILE_NAME) {
        return Err(Refusals::from_one(Refusal::Unreadable {
            path: AGGREGATE_FILE_NAME.to_owned(),
        }));
    }
    let scanned = scan_below_root(&files, &root);
    let bytes = files.take_bytes(AGGREGATE_FILE_NAME).unwrap_or_default();
    let json = parse(&decode_text(&bytes)).map_err(|error| {
        Refusals::from_one(Refusal::InvalidJson {
            file: AGGREGATE_FILE_NAME.to_owned(),
            error,
        })
    })?;
    let meta_space_id = aggregate_file(&json).map_err(|issues| {
        Refusals::new(shape_refusals(AGGREGATE_FILE_NAME, issues)).unwrap_or_else(|| {
            Refusals::from_one(Refusal::InvalidShape {
                file: AGGREGATE_FILE_NAME.to_owned(),
                field: None,
                problem: ShapeProblem::Custom("is not an aggregate file"),
            })
        })
    })?;
    let scanned = scanned?;

    let mut refusals = Vec::new();
    let mut reads = Vec::new();
    for space in &scanned.spaces {
        match read_space(&mut files, space) {
            Ok(read) => reads.push(read),
            Err(refused) => refusals.extend(refused),
        }
    }
    let (assets, asset_refusals) = read_assets(&mut files, &scanned.assets);
    let spaces: Vec<SpaceSnapshot> = reads
        .into_iter()
        .map(|read| identify(read, &mut new_id))
        .collect();
    refusals.extend(asset_refusals);
    Refusals::check(refusals)?;
    Ok(AggregateContents {
        meta_space_id,
        spaces,
        assets,
    })
}

/// Import an Aggregate directory's files as `cube check` and a run do: read
/// them ([`read_aggregate`]), then run the aggregate intake over what they
/// hold ([`load_aggregate`]).
///
/// # Errors
///
/// Returns the refusals of the first stage that refuses, as the conformance
/// corpus's README orders the stages.
///
/// # Examples
///
/// ```
/// use intake::{AggregateFiles, RefusalKind, import_aggregate};
///
/// let meta = "10000000-0000-4000-8000-000000000001";
/// let mut files = AggregateFiles::new();
/// files.insert_file("aggregate.json", format!(r#"{{"version": 1, "metaSpaceId": "{meta}"}}"#));
/// files.insert_file(
///     format!("{meta}/space.json"),
///     format!(r#"{{"version": 1, "id": "{meta}", "title": "Space", "defaultMap": "00000000-0000-4000-8000-000000000a01"}}"#),
/// );
///
/// let refused = import_aggregate(files, || unreachable!("every id is written down")).unwrap_err();
/// let refusal = &refused.as_slice()[0];
/// assert_eq!(refusal.kind(), RefusalKind::UnresolvedDefaultMap, "the default Map names no Map");
/// assert_eq!(refusal.file(), format!("{meta}/space.json"), "it is located at the Space file");
/// assert_eq!(refusal.field().as_deref(), Some("defaultMap"), "it names the defaultMap field");
/// ```
pub fn import_aggregate(
    files: AggregateFiles,
    new_id: impl FnMut() -> Uuid,
) -> Result<ImportedAggregate, Refusals> {
    let contents = read_aggregate(files, new_id)?;
    Ok(ImportedAggregate {
        aggregate: load_aggregate(contents.meta_space_id, contents.spaces)?,
        assets: contents.assets,
    })
}
