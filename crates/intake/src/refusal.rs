//! Why intake refused, and where (ADR 0156).
//!
//! The two intakes must agree on a refusal's **kind** and **location** — its
//! file, the id of the entity holding the fault, the field at fault and, for an
//! Edge, its endpoints — never on the wording of its message.
//! `conformance/intake/README.md` writes the rules down; [`Refusal`] carries
//! the typed facts and answers each of those five keys.

use std::borrow::Cow;
use std::fmt;

use crate::directory::{
    AGGREGATE_FILE_NAME, ASSETS_DIRECTORY_NAME, RESOURCES_DIRECTORY_NAME, SPACE_FILE_NAME,
};
use crate::ids::{GraphId, MapId, ResourceId, SpaceId, Uuid};
use crate::json::JsonError;

macro_rules! refusal_kinds {
    ($($variant:ident => $name:literal,)*) => {
        /// The closed list of refusal kinds, named from the intake's error
        /// types, in the order `INTAKE_REFUSAL_KINDS` lists them.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        #[non_exhaustive]
        pub enum RefusalKind {
            $(
                #[doc = concat!("`", $name, "`.")]
                $variant,
            )*
        }

        impl RefusalKind {
            /// Every kind, in the closed list's order.
            pub const ALL: &'static [RefusalKind] = &[$(RefusalKind::$variant,)*];

            /// The kind's name, as the corpus and the TypeScript intake write it.
            #[must_use]
            pub fn as_str(self) -> &'static str {
                match self {
                    $(RefusalKind::$variant => $name,)*
                }
            }

            /// The kind a name names, if it is one of the closed list.
            #[must_use]
            pub fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(RefusalKind::$variant),)*
                    _ => None,
                }
            }
        }
    };
}

refusal_kinds! {
    AggregateFileMissing => "aggregate-file-missing",
    Unreadable => "unreadable",
    SymbolicLink => "symbolic-link",
    SpaceDirectoryName => "space-directory-name",
    SpaceIdMismatch => "space-id-mismatch",
    AssetRefused => "asset-refused",
    AssetFileName => "asset-file-name",
    DuplicateAsset => "duplicate-asset",
    InvalidJson => "invalid-json",
    InvalidShape => "invalid-shape",
    InvalidResourceFile => "invalid-resource-file",
    UnsupportedVersion => "unsupported-version",
    RetiredSpaceGraphs => "retired-space-graphs",
    DuplicateResourceId => "duplicate-resource-id",
    DuplicateGraphId => "duplicate-graph-id",
    DuplicateMapId => "duplicate-map-id",
    MapMemberMissingResource => "map-member-missing-resource",
    MapActiveGraphMissing => "map-active-graph-missing",
    MapActiveGraphOutsideMap => "map-active-graph-outside-map",
    GraphEdgeMissingResource => "graph-edge-missing-resource",
    GraphEdgeResourceOutsideMap => "graph-edge-resource-outside-map",
    UnresolvedDefaultMap => "unresolved-default-map",
    DuplicateGraphEdge => "duplicate-graph-edge",
    ReferenceTargetsSelf => "reference-targets-self",
    ReferenceTargetMissing => "reference-target-missing",
    ReferenceTargetNotTargetable => "reference-target-not-targetable",
    SpaceReferenceCycle => "space-reference-cycle",
    MapContentInvalid => "map-content-invalid",
    DuplicateSpaceId => "duplicate-space-id",
    MetaSpaceMissing => "meta-space-missing",
    SpaceReferenceMissing => "space-reference-missing",
    OrdinarySpaceUnreferenced => "ordinary-space-unreferenced",
    SpaceResourceMapMissing => "space-resource-map-missing",
    SpaceResourceGraphMissing => "space-resource-graph-missing",
    SpaceResourceGraphOutsideMap => "space-resource-graph-outside-map",
}

impl fmt::Display for RefusalKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// An Edge's endpoints, which are its identity within its Graph (ADR 0032).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct EdgeEnds {
    /// The Resource the Edge leaves.
    pub from: ResourceId,
    /// The Resource the Edge enters.
    pub to: ResourceId,
}

/// Which end of an Edge.
///
/// Exhaustive: an Edge has two ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EdgeEnd {
    /// `from`.
    From,
    /// `to`.
    To,
}

impl EdgeEnd {
    /// The end's field name.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::From => "from",
            Self::To => "to",
        }
    }
}

/// What a schema found wrong with a value, as the Zod issue the TypeScript
/// intake raises there would say. One refusal is raised per issue.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum ShapeProblem {
    /// The value is not of the type required, or is absent where required.
    InvalidType {
        /// The type required.
        expected: &'static str,
        /// The type found; `undefined` for an absent value.
        received: &'static str,
    },
    /// The value is not the one literal allowed.
    InvalidLiteral {
        /// The literal allowed.
        expected: &'static str,
    },
    /// The value is none of the strings allowed.
    InvalidEnumValue {
        /// The strings allowed.
        options: &'static [&'static str],
    },
    /// An object's discriminator names none of the variants.
    InvalidUnionDiscriminator {
        /// The discriminator values allowed.
        options: &'static [&'static str],
    },
    /// The value matches none of a union's members.
    InvalidUnion,
    /// A strict object has keys its schema does not declare.
    UnrecognizedKeys(Vec<String>),
    /// A string is not a UUID.
    InvalidUuid,
    /// A string, number or array is below its minimum.
    TooSmall {
        /// What is measured: `string`, `number` or `array`.
        of: &'static str,
        /// The minimum, inclusive.
        minimum: f64,
    },
    /// A number must be greater than zero.
    NotPositive,
    /// A number is infinite.
    NotFinite,
    /// A refinement refused the value, in its own words.
    Custom(&'static str),
}

impl fmt::Display for ShapeProblem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidType {
                expected,
                received: "undefined",
            } => write!(f, "required: expected {expected}"),
            Self::InvalidType { expected, received } => {
                write!(f, "expected {expected}, received {received}")
            }
            Self::InvalidLiteral { expected } => write!(f, "must be {expected}"),
            Self::InvalidEnumValue { options } | Self::InvalidUnionDiscriminator { options } => {
                write!(f, "must be one of {}", options.join(", "))
            }
            Self::InvalidUnion => f.write_str("is not a JSON value"),
            Self::UnrecognizedKeys(keys) => write!(f, "unrecognized keys: {}", keys.join(", ")),
            Self::InvalidUuid => f.write_str("is not a UUID"),
            Self::TooSmall {
                of: "array",
                minimum,
            } => {
                write!(f, "must hold at least {minimum} items")
            }
            Self::TooSmall {
                of: "string",
                minimum,
            } => {
                write!(f, "must be at least {minimum} characters")
            }
            Self::TooSmall { minimum, .. } => write!(f, "must be at least {minimum}"),
            Self::NotPositive => f.write_str("must be greater than 0"),
            Self::NotFinite => f.write_str("must be finite"),
            Self::Custom(message) => f.write_str(message),
        }
    }
}

/// Why a Space Resource's selection does not resolve in the Space it shows.
///
/// Exhaustive on purpose: a host maps each problem to what its wire names,
/// and a new problem should fail its build until it does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionProblem {
    /// It selects a Map the Space does not have.
    MapMissing {
        /// The Map selected.
        map: MapId,
    },
    /// It selects a Graph the Space does not have.
    GraphMissing {
        /// The Graph selected.
        graph: GraphId,
    },
    /// It selects a Graph the Space has but its selected Map does not own.
    GraphOutsideMap {
        /// The Map selected.
        map: MapId,
        /// The Graph selected.
        graph: GraphId,
    },
}

fn optional_field(field: Option<&str>) -> String {
    field.map_or_else(String::new, |field| format!(" at {field}"))
}

/// One refusal: its kind, and the typed facts that place it.
///
/// [`Refusal::kind`], [`Refusal::file`], [`Refusal::id`], [`Refusal::field`] and
/// [`Refusal::edge`] answer the five keys the conformance corpus compares.
/// Files are paths relative to the Aggregate directory with `/` between
/// segments; a Resource is located at `<space id>/resources/<resource id>.json`,
/// the file Export writes for it.
///
/// # Examples
///
/// ```
/// use intake::{Refusal, RefusalKind, SpaceId};
///
/// let space = SpaceId::parse("10000000-0000-4000-8000-000000000001").unwrap();
/// let refusal = Refusal::RetiredSpaceGraphs { space };
///
/// assert_eq!(refusal.kind(), RefusalKind::RetiredSpaceGraphs);
/// assert_eq!(refusal.kind().as_str(), "retired-space-graphs");
/// assert_eq!(refusal.file(), format!("{space}/space.json"));
/// assert_eq!(refusal.field().as_deref(), Some("graphs"));
/// assert_eq!(refusal.id(), None);
/// ```
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[non_exhaustive]
pub enum Refusal {
    /// The directory has no `aggregate.json`.
    #[error("aggregate.json: a canonical aggregate directory must contain aggregate.json")]
    AggregateFileMissing,
    /// A directory could not be listed, or a file could not be read.
    #[error("{path}: could not be read")]
    Unreadable {
        /// The directory or file, `.` for the Aggregate directory itself.
        path: String,
    },
    /// A path Import owns is a symbolic link.
    #[error("{path}: is a symbolic link, which InfinityCube neither reads nor writes through")]
    SymbolicLink {
        /// The link.
        path: String,
    },
    /// A child directory holding a `space.json` is not named for a Space Id in lower case.
    #[error("{directory}: a Space directory must be named for its Space UUID, in lower case")]
    SpaceDirectoryName {
        /// The directory's name.
        directory: String,
    },
    /// A `space.json` declares an `id` other than its directory's name.
    #[error("{space}/space.json: declares Space {declared} inside directory {space}")]
    SpaceIdMismatch {
        /// The Space its directory names.
        space: SpaceId,
        /// The id its `space.json` declares.
        declared: String,
    },
    /// A file in `assets/` is not an asset the host stores.
    #[error("assets/{name}: not an asset the host stores (over its size cap)")]
    AssetRefused {
        /// The file's name in `assets/`.
        name: String,
    },
    /// A file in `assets/` is named by a hash that is not its content's.
    #[error("assets/{name}: an asset file must be named for its content, {expected}")]
    AssetFileName {
        /// The file's name in `assets/`.
        name: String,
        /// The hash its content has.
        expected: String,
    },
    /// A file in `assets/` is named by a hash an earlier file is named by.
    #[error("assets/{name}: another file of one hash comes first; keep one")]
    DuplicateAsset {
        /// The file's name in `assets/`.
        name: String,
    },
    /// A file is not JSON.
    #[error("{file}: is not valid JSON — {error}")]
    InvalidJson {
        /// The file.
        file: String,
        /// Why.
        error: JsonError,
    },
    /// A document does not have the shape its schema requires.
    #[error("{file}{}: {problem}", optional_field(.field.as_deref()))]
    InvalidShape {
        /// The file.
        file: String,
        /// The schema's path to the fault, from the file's root.
        field: Option<String>,
        /// What the schema found.
        problem: ShapeProblem,
    },
    /// A Resource file's kind, envelope or content is refused.
    #[error("{file}{}: {problem}", optional_field(.field.as_deref()))]
    InvalidResourceFile {
        /// The file, by the name it has in the directory.
        file: String,
        /// The schema's path to the fault, from the file's root.
        field: Option<String>,
        /// What the schema found.
        problem: ShapeProblem,
    },
    /// A `space.json` declares a version this build does not read.
    #[error(
        "{space}/space.json: Space document version {version} is not supported; this build reads version 1"
    )]
    UnsupportedVersion {
        /// The Space directory.
        space: SpaceId,
        /// The version declared.
        version: f64,
    },
    /// A `space.json` carries a retired space-level `graphs` (ADR 0040).
    #[error(
        "{space}/space.json: carries a space-level graphs array, which is retired: a Map owns its Graphs"
    )]
    RetiredSpaceGraphs {
        /// The Space directory.
        space: SpaceId,
    },
    /// Two Resources share an id, in one Space or across two.
    #[error("{space}/resources/{resource}.json: duplicate resource id {resource}")]
    DuplicateResourceId {
        /// The Space holding the repeat (across Spaces, each after the first).
        space: SpaceId,
        /// The id repeated.
        resource: ResourceId,
    },
    /// Two Graphs of one Space share an id.
    #[error("{space}/space.json: duplicate graph id {graph}")]
    DuplicateGraphId {
        /// The Space.
        space: SpaceId,
        /// The id repeated.
        graph: GraphId,
    },
    /// Two Maps of one Space share an id.
    #[error("{space}/space.json: duplicate map id {map}")]
    DuplicateMapId {
        /// The Space.
        space: SpaceId,
        /// The id repeated.
        map: MapId,
    },
    /// A Map places a Resource the Space does not hold.
    #[error(
        "{space}/space.json: map {map} holds a position for resource {resource}, which the space does not hold"
    )]
    MapMemberMissingResource {
        /// The Space.
        space: SpaceId,
        /// The Map.
        map: MapId,
        /// The Resource placed.
        resource: ResourceId,
    },
    /// A Map opens active on a Graph no Map of the Space owns.
    #[error(
        "{space}/space.json: map {map} opens active on graph {graph}, which no map in the space owns"
    )]
    MapActiveGraphMissing {
        /// The Space.
        space: SpaceId,
        /// The Map.
        map: MapId,
        /// The Graph named.
        graph: GraphId,
    },
    /// A Map opens active on a Graph another Map owns.
    #[error("{space}/space.json: map {map} opens active on graph {graph}, which another map owns")]
    MapActiveGraphOutsideMap {
        /// The Space.
        space: SpaceId,
        /// The Map.
        map: MapId,
        /// The Graph named.
        graph: GraphId,
    },
    /// An Edge endpoint names a Resource the Space does not hold.
    #[error("{space}/space.json: graph {graph} edge {}→{} names a resource the space does not hold as its {}", .edge.from, .edge.to, .end.as_str())]
    GraphEdgeMissingResource {
        /// The Space.
        space: SpaceId,
        /// The Graph.
        graph: GraphId,
        /// The Edge.
        edge: EdgeEnds,
        /// The end at fault.
        end: EdgeEnd,
    },
    /// An Edge endpoint names a Resource its Graph's Map does not place.
    #[error("{space}/space.json: graph {graph} edge {}→{} names a resource outside its map as its {}", .edge.from, .edge.to, .end.as_str())]
    GraphEdgeResourceOutsideMap {
        /// The Space.
        space: SpaceId,
        /// The Graph.
        graph: GraphId,
        /// The Edge.
        edge: EdgeEnds,
        /// The end at fault.
        end: EdgeEnd,
    },
    /// `defaultMap` names no Map of the Space.
    #[error("{space}/space.json: defaultMap {map} does not name a declared Map")]
    UnresolvedDefaultMap {
        /// The Space.
        space: SpaceId,
        /// The Map named.
        map: MapId,
    },
    /// An Edge appears again in its Graph (ADR 0032).
    #[error("{space}/space.json: graph {graph} repeats edge {}→{}", .edge.from, .edge.to)]
    DuplicateGraphEdge {
        /// The Space.
        space: SpaceId,
        /// The Graph.
        graph: GraphId,
        /// The Edge repeated.
        edge: EdgeEnds,
    },
    /// A Resource reference names the Resource declaring it.
    #[error("{space}/resources/{resource}.json: resource {resource} references itself")]
    ReferenceTargetsSelf {
        /// The Space.
        space: SpaceId,
        /// The declaring Resource.
        resource: ResourceId,
    },
    /// A Resource reference names a Resource the Space does not hold.
    #[error("{space}/resources/{resource}.json: references missing resource {target}")]
    ReferenceTargetMissing {
        /// The Space.
        space: SpaceId,
        /// The declaring Resource.
        resource: ResourceId,
        /// The Resource named.
        target: ResourceId,
    },
    /// A Resource reference names a Resource whose kind may not be a Target.
    #[error(
        "{space}/resources/{resource}.json: references {target}, whose kind may not be a Target; referencing is a single hop"
    )]
    ReferenceTargetNotTargetable {
        /// The Space.
        space: SpaceId,
        /// The declaring Resource.
        resource: ResourceId,
        /// The Resource named.
        target: ResourceId,
    },
    /// A Space reference names the Space holding it, or closes a cycle across Spaces.
    #[error("{space}/resources/{resource}.json: closes a reference cycle through Space {target}")]
    SpaceReferenceCycle {
        /// The Space.
        space: SpaceId,
        /// The declaring Resource.
        resource: ResourceId,
        /// The Space referenced.
        target: SpaceId,
    },
    /// A placement keeps Map content its Resource's plugin refuses.
    #[error(
        "{space}/space.json: map {map} keeps Map content for resource {resource} that its plugin refuses: {problem}"
    )]
    MapContentInvalid {
        /// The Space.
        space: SpaceId,
        /// The Map.
        map: MapId,
        /// The Resource placed.
        resource: ResourceId,
        /// What the plugin's schema found.
        problem: String,
    },
    /// Two Spaces of one aggregate share an id.
    #[error("{space}/space.json: Space {space} is declared more than once")]
    DuplicateSpaceId {
        /// The id repeated.
        space: SpaceId,
    },
    /// `aggregate.json` names a Meta Space the aggregate does not hold.
    #[error("aggregate.json: names Meta Space {meta}, which the aggregate does not contain")]
    MetaSpaceMissing {
        /// The Meta Space named.
        meta: SpaceId,
    },
    /// A Space reference names a Space the aggregate does not hold.
    #[error(
        "{space}/resources/{resource}.json: references Space {target}, which the aggregate does not contain"
    )]
    SpaceReferenceMissing {
        /// The Space.
        space: SpaceId,
        /// The declaring Resource.
        resource: ResourceId,
        /// The Space named.
        target: SpaceId,
    },
    /// A Space other than the Meta Space has no Space Resource holding it.
    #[error(
        "{space}/space.json: Space {space} is not the Meta Space and no Space Resource points at it"
    )]
    OrdinarySpaceUnreferenced {
        /// The Space.
        space: SpaceId,
    },
    /// A Space Resource's selection does not resolve in the Space it shows.
    #[error(
        "{space}/resources/{resource}.json: selects {problem:?} in Space {target}, which does not resolve"
    )]
    SpaceResourceSelection {
        /// The Space.
        space: SpaceId,
        /// The Space Resource.
        resource: ResourceId,
        /// The Space it shows.
        target: SpaceId,
        /// What does not resolve.
        problem: SelectionProblem,
    },
}

fn resource_file(space: SpaceId, resource: ResourceId) -> String {
    format!("{space}/{RESOURCES_DIRECTORY_NAME}/{resource}.json")
}

fn space_file(space: SpaceId) -> String {
    format!("{space}/{SPACE_FILE_NAME}")
}

impl Refusal {
    /// The refusal's kind.
    #[must_use]
    pub fn kind(&self) -> RefusalKind {
        match self {
            Self::AggregateFileMissing => RefusalKind::AggregateFileMissing,
            Self::Unreadable { .. } => RefusalKind::Unreadable,
            Self::SymbolicLink { .. } => RefusalKind::SymbolicLink,
            Self::SpaceDirectoryName { .. } => RefusalKind::SpaceDirectoryName,
            Self::SpaceIdMismatch { .. } => RefusalKind::SpaceIdMismatch,
            Self::AssetRefused { .. } => RefusalKind::AssetRefused,
            Self::AssetFileName { .. } => RefusalKind::AssetFileName,
            Self::DuplicateAsset { .. } => RefusalKind::DuplicateAsset,
            Self::InvalidJson { .. } => RefusalKind::InvalidJson,
            Self::InvalidShape { .. } => RefusalKind::InvalidShape,
            Self::InvalidResourceFile { .. } => RefusalKind::InvalidResourceFile,
            Self::UnsupportedVersion { .. } => RefusalKind::UnsupportedVersion,
            Self::RetiredSpaceGraphs { .. } => RefusalKind::RetiredSpaceGraphs,
            Self::DuplicateResourceId { .. } => RefusalKind::DuplicateResourceId,
            Self::DuplicateGraphId { .. } => RefusalKind::DuplicateGraphId,
            Self::DuplicateMapId { .. } => RefusalKind::DuplicateMapId,
            Self::MapMemberMissingResource { .. } => RefusalKind::MapMemberMissingResource,
            Self::MapActiveGraphMissing { .. } => RefusalKind::MapActiveGraphMissing,
            Self::MapActiveGraphOutsideMap { .. } => RefusalKind::MapActiveGraphOutsideMap,
            Self::GraphEdgeMissingResource { .. } => RefusalKind::GraphEdgeMissingResource,
            Self::GraphEdgeResourceOutsideMap { .. } => RefusalKind::GraphEdgeResourceOutsideMap,
            Self::UnresolvedDefaultMap { .. } => RefusalKind::UnresolvedDefaultMap,
            Self::DuplicateGraphEdge { .. } => RefusalKind::DuplicateGraphEdge,
            Self::ReferenceTargetsSelf { .. } => RefusalKind::ReferenceTargetsSelf,
            Self::ReferenceTargetMissing { .. } => RefusalKind::ReferenceTargetMissing,
            Self::ReferenceTargetNotTargetable { .. } => RefusalKind::ReferenceTargetNotTargetable,
            Self::SpaceReferenceCycle { .. } => RefusalKind::SpaceReferenceCycle,
            Self::MapContentInvalid { .. } => RefusalKind::MapContentInvalid,
            Self::DuplicateSpaceId { .. } => RefusalKind::DuplicateSpaceId,
            Self::MetaSpaceMissing { .. } => RefusalKind::MetaSpaceMissing,
            Self::SpaceReferenceMissing { .. } => RefusalKind::SpaceReferenceMissing,
            Self::OrdinarySpaceUnreferenced { .. } => RefusalKind::OrdinarySpaceUnreferenced,
            Self::SpaceResourceSelection { problem, .. } => match problem {
                SelectionProblem::MapMissing { .. } => RefusalKind::SpaceResourceMapMissing,
                SelectionProblem::GraphMissing { .. } => RefusalKind::SpaceResourceGraphMissing,
                SelectionProblem::GraphOutsideMap { .. } => {
                    RefusalKind::SpaceResourceGraphOutsideMap
                }
            },
        }
    }

    /// The file the fault is in, relative to the Aggregate directory.
    #[must_use]
    pub fn file(&self) -> Cow<'_, str> {
        match self {
            Self::AggregateFileMissing | Self::MetaSpaceMissing { .. } => {
                Cow::Borrowed(AGGREGATE_FILE_NAME)
            }
            Self::Unreadable { path } | Self::SymbolicLink { path } => Cow::Borrowed(path),
            Self::SpaceDirectoryName { directory } => Cow::Borrowed(directory),
            Self::AssetRefused { name }
            | Self::AssetFileName { name, .. }
            | Self::DuplicateAsset { name } => {
                Cow::Owned(format!("{ASSETS_DIRECTORY_NAME}/{name}"))
            }
            Self::InvalidJson { file, .. }
            | Self::InvalidShape { file, .. }
            | Self::InvalidResourceFile { file, .. } => Cow::Borrowed(file),
            Self::SpaceIdMismatch { space, .. }
            | Self::UnsupportedVersion { space, .. }
            | Self::RetiredSpaceGraphs { space }
            | Self::DuplicateGraphId { space, .. }
            | Self::DuplicateMapId { space, .. }
            | Self::MapMemberMissingResource { space, .. }
            | Self::MapActiveGraphMissing { space, .. }
            | Self::MapActiveGraphOutsideMap { space, .. }
            | Self::GraphEdgeMissingResource { space, .. }
            | Self::GraphEdgeResourceOutsideMap { space, .. }
            | Self::UnresolvedDefaultMap { space, .. }
            | Self::DuplicateGraphEdge { space, .. }
            | Self::MapContentInvalid { space, .. }
            | Self::DuplicateSpaceId { space }
            | Self::OrdinarySpaceUnreferenced { space } => Cow::Owned(space_file(*space)),
            Self::DuplicateResourceId { space, resource }
            | Self::ReferenceTargetsSelf { space, resource }
            | Self::ReferenceTargetMissing {
                space, resource, ..
            }
            | Self::ReferenceTargetNotTargetable {
                space, resource, ..
            }
            | Self::SpaceReferenceCycle {
                space, resource, ..
            }
            | Self::SpaceReferenceMissing {
                space, resource, ..
            }
            | Self::SpaceResourceSelection {
                space, resource, ..
            } => Cow::Owned(resource_file(*space, *resource)),
        }
    }

    /// The id of the entity holding the fault, or the id repeated, when the rule names one.
    #[must_use]
    pub fn id(&self) -> Option<Uuid> {
        match self {
            Self::AggregateFileMissing
            | Self::Unreadable { .. }
            | Self::SymbolicLink { .. }
            | Self::SpaceDirectoryName { .. }
            | Self::SpaceIdMismatch { .. }
            | Self::AssetRefused { .. }
            | Self::AssetFileName { .. }
            | Self::DuplicateAsset { .. }
            | Self::InvalidJson { .. }
            | Self::InvalidShape { .. }
            | Self::InvalidResourceFile { .. }
            | Self::UnsupportedVersion { .. }
            | Self::RetiredSpaceGraphs { .. }
            | Self::MetaSpaceMissing { .. } => None,
            Self::DuplicateResourceId { resource, .. }
            | Self::ReferenceTargetsSelf { resource, .. }
            | Self::ReferenceTargetMissing { resource, .. }
            | Self::ReferenceTargetNotTargetable { resource, .. }
            | Self::SpaceReferenceCycle { resource, .. }
            | Self::SpaceReferenceMissing { resource, .. }
            | Self::SpaceResourceSelection { resource, .. } => Some(resource.uuid()),
            Self::DuplicateGraphId { graph, .. }
            | Self::GraphEdgeMissingResource { graph, .. }
            | Self::GraphEdgeResourceOutsideMap { graph, .. }
            | Self::DuplicateGraphEdge { graph, .. } => Some(graph.uuid()),
            Self::DuplicateMapId { map, .. }
            | Self::MapMemberMissingResource { map, .. }
            | Self::MapActiveGraphMissing { map, .. }
            | Self::MapActiveGraphOutsideMap { map, .. }
            | Self::MapContentInvalid { map, .. } => Some(map.uuid()),
            Self::UnresolvedDefaultMap { space, .. }
            | Self::DuplicateSpaceId { space }
            | Self::OrdinarySpaceUnreferenced { space } => Some(space.uuid()),
        }
    }

    /// The field at fault: relative to the entity [`Refusal::id`] names, or
    /// from the root of [`Refusal::file`] when there is no id.
    #[must_use]
    pub fn field(&self) -> Option<Cow<'_, str>> {
        match self {
            Self::SpaceIdMismatch { .. } => Some(Cow::Borrowed("id")),
            Self::InvalidShape { field, .. } | Self::InvalidResourceFile { field, .. } => {
                field.as_deref().map(Cow::Borrowed)
            }
            Self::UnsupportedVersion { .. } => Some(Cow::Borrowed("version")),
            Self::RetiredSpaceGraphs { .. } => Some(Cow::Borrowed("graphs")),
            Self::MapMemberMissingResource { resource, .. } => {
                Some(Cow::Owned(format!("positions.{resource}")))
            }
            Self::MapActiveGraphMissing { .. } | Self::MapActiveGraphOutsideMap { .. } => {
                Some(Cow::Borrowed("activeGraph"))
            }
            Self::GraphEdgeMissingResource { end, .. }
            | Self::GraphEdgeResourceOutsideMap { end, .. } => Some(Cow::Borrowed(end.as_str())),
            Self::UnresolvedDefaultMap { .. } => Some(Cow::Borrowed("defaultMap")),
            Self::MapContentInvalid { resource, .. } => {
                Some(Cow::Owned(format!("positions.{resource}.content")))
            }
            Self::MetaSpaceMissing { .. } => Some(Cow::Borrowed("metaSpaceId")),
            Self::AggregateFileMissing
            | Self::Unreadable { .. }
            | Self::SymbolicLink { .. }
            | Self::SpaceDirectoryName { .. }
            | Self::AssetRefused { .. }
            | Self::AssetFileName { .. }
            | Self::DuplicateAsset { .. }
            | Self::InvalidJson { .. }
            | Self::DuplicateResourceId { .. }
            | Self::DuplicateGraphId { .. }
            | Self::DuplicateMapId { .. }
            | Self::DuplicateGraphEdge { .. }
            | Self::ReferenceTargetsSelf { .. }
            | Self::ReferenceTargetMissing { .. }
            | Self::ReferenceTargetNotTargetable { .. }
            | Self::SpaceReferenceCycle { .. }
            | Self::DuplicateSpaceId { .. }
            | Self::SpaceReferenceMissing { .. }
            | Self::OrdinarySpaceUnreferenced { .. }
            | Self::SpaceResourceSelection { .. } => None,
        }
    }

    /// The Edge at fault, by its endpoints within the Graph [`Refusal::id`] names.
    #[must_use]
    pub fn edge(&self) -> Option<EdgeEnds> {
        match self {
            Self::GraphEdgeMissingResource { edge, .. }
            | Self::GraphEdgeResourceOutsideMap { edge, .. }
            | Self::DuplicateGraphEdge { edge, .. } => Some(*edge),
            Self::AggregateFileMissing
            | Self::Unreadable { .. }
            | Self::SymbolicLink { .. }
            | Self::SpaceDirectoryName { .. }
            | Self::SpaceIdMismatch { .. }
            | Self::AssetRefused { .. }
            | Self::AssetFileName { .. }
            | Self::DuplicateAsset { .. }
            | Self::InvalidJson { .. }
            | Self::InvalidShape { .. }
            | Self::InvalidResourceFile { .. }
            | Self::UnsupportedVersion { .. }
            | Self::RetiredSpaceGraphs { .. }
            | Self::DuplicateResourceId { .. }
            | Self::DuplicateGraphId { .. }
            | Self::DuplicateMapId { .. }
            | Self::MapMemberMissingResource { .. }
            | Self::MapActiveGraphMissing { .. }
            | Self::MapActiveGraphOutsideMap { .. }
            | Self::UnresolvedDefaultMap { .. }
            | Self::ReferenceTargetsSelf { .. }
            | Self::ReferenceTargetMissing { .. }
            | Self::ReferenceTargetNotTargetable { .. }
            | Self::SpaceReferenceCycle { .. }
            | Self::MapContentInvalid { .. }
            | Self::DuplicateSpaceId { .. }
            | Self::MetaSpaceMissing { .. }
            | Self::SpaceReferenceMissing { .. }
            | Self::OrdinarySpaceUnreferenced { .. }
            | Self::SpaceResourceSelection { .. } => None,
        }
    }
}

/// Every refusal intake gave, in the order it found them; never empty.
///
/// The order carries no meaning: the corpus compares refusals as a multiset.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[error("intake refused: {}", summary(.0))]
pub struct Refusals(Vec<Refusal>);

fn summary(refusals: &[Refusal]) -> String {
    refusals
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join("; ")
}

impl Refusals {
    /// The refusals, or `None` when there are none.
    #[must_use]
    pub fn new(refusals: Vec<Refusal>) -> Option<Self> {
        (!refusals.is_empty()).then_some(Self(refusals))
    }

    /// One refusal alone.
    #[must_use]
    pub fn from_one(refusal: Refusal) -> Self {
        Self(vec![refusal])
    }

    /// Each refusal.
    #[must_use]
    pub fn as_slice(&self) -> &[Refusal] {
        &self.0
    }

    /// The refusals, owned.
    #[must_use]
    pub fn into_vec(self) -> Vec<Refusal> {
        self.0
    }

    /// Fail with `refusals` when there are any.
    pub(crate) fn check(refusals: Vec<Refusal>) -> Result<(), Self> {
        Self::new(refusals).map_or(Ok(()), Err)
    }
}

impl IntoIterator for Refusals {
    type Item = Refusal;
    type IntoIter = std::vec::IntoIter<Refusal>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_every_kind_once_in_the_closed_lists_order() {
        let names: Vec<_> = RefusalKind::ALL.iter().map(|kind| kind.as_str()).collect();
        assert_eq!(names.len(), 35, "the closed list has 35 kinds");
        assert_eq!(names.first(), Some(&"aggregate-file-missing"), "first kind");
        assert_eq!(
            names.last(),
            Some(&"space-resource-graph-outside-map"),
            "last kind"
        );
        for kind in RefusalKind::ALL {
            assert_eq!(
                RefusalKind::from_name(kind.as_str()),
                Some(*kind),
                "{kind} round-trips"
            );
        }
    }

    #[test]
    fn locates_an_edge_fault_by_graph_end_and_endpoints() {
        let space = SpaceId::parse("10000000-0000-4000-8000-000000000001").unwrap();
        let graph = GraphId::parse("00000000-0000-4000-8000-000000000b01").unwrap();
        let from = ResourceId::parse("00000000-0000-4000-8000-000000000101").unwrap();
        let to = ResourceId::parse("00000000-0000-4000-8000-00000000dead").unwrap();
        let refusal = Refusal::GraphEdgeMissingResource {
            space,
            graph,
            edge: EdgeEnds { from, to },
            end: EdgeEnd::To,
        };
        assert_eq!(
            refusal.kind(),
            RefusalKind::GraphEdgeMissingResource,
            "kind"
        );
        assert_eq!(
            refusal.file(),
            "10000000-0000-4000-8000-000000000001/space.json",
            "file"
        );
        assert_eq!(
            refusal.id(),
            Some(graph.uuid()),
            "the Graph holds the fault"
        );
        assert_eq!(refusal.field().as_deref(), Some("to"), "the end at fault");
        assert_eq!(
            refusal.edge(),
            Some(EdgeEnds { from, to }),
            "the Edge by its endpoints"
        );
    }
}
