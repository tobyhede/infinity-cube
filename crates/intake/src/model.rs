//! The values intake reads: an aggregate's Spaces, each a snapshot of its
//! `space.json` and its Resources, as the TypeScript `SpaceSnapshot` holds them.
//!
//! What they keep is what Export writes back. Every optional member is kept
//! as absent or present, never filled in (an absent `activeGraph`, `defaultMap`,
//! `maps`, Edge `title` or placement `size` stays absent), arrays keep their
//! authored order, and a Resource's content and a placement's Map content are
//! kept whole as JSON, unread where no listed plugin reads them. Numbers are
//! the doubles JavaScript holds. Keys inside content keep the order the file
//! wrote them in, which is not always the order `JSON.parse` gives them (see
//! [`JsonValue`]): intake's answers do not depend on it, and a writer that
//! must list keys as JavaScript does orders them itself.

use crate::ids::{GraphId, Kind, MapId, ResourceId, SpaceId};
use crate::json::JsonValue;
use crate::plugins::{Plugin, plugin_for};

/// The one version of the space and aggregate documents this build reads.
pub const DOCUMENT_VERSION: f64 = 1.0;

/// A Resource (ADR 0128, ADR 0142): its envelope and the content its kind's
/// plugin parses, or, for a kind no listed plugin draws, carries whole.
#[derive(Debug, Clone, PartialEq)]
pub struct Resource {
    /// Its id.
    pub id: ResourceId,
    /// Its Title, normalized (ADR 0083): one or more lines, the first its name.
    pub title: String,
    /// Its kind.
    pub kind: Kind,
    /// Its content: a JSON object for every kind.
    pub content: JsonValue,
}

impl Resource {
    pub(crate) fn plugin(&self) -> &'static dyn Plugin {
        plugin_for(self.kind.as_str())
    }

    /// Whether no listed plugin draws its kind, so it is carried whole (ADR 0142).
    #[must_use]
    pub fn is_missing_kind(&self) -> bool {
        !crate::plugins::is_plugin_kind(self.kind.as_str())
    }

    /// The Resources its content references, in declared order.
    #[must_use]
    pub fn resource_references(&self) -> Vec<ResourceId> {
        self.plugin().resource_references(&self.content)
    }

    /// The Spaces its content references, in declared order.
    #[must_use]
    pub fn space_references(&self) -> Vec<SpaceId> {
        self.plugin().space_references(&self.content)
    }

    /// The Map and the Graph its content selects in the Space it references,
    /// when its plugin declares a selection (ADR 0068, `spaceSelection`).
    #[must_use]
    pub fn selection(&self) -> Option<(MapId, GraphId)> {
        self.plugin().selection(&self.content)
    }

    /// The Spaces whose lifetime it holds (ADR 0074).
    #[must_use]
    pub fn lifetime_space_references(&self) -> Vec<SpaceId> {
        if self.plugin().owns_referenced_spaces() {
            self.space_references()
        } else {
            Vec::new()
        }
    }
}

/// A Resource's size on a Map, no smaller than the Closed Size.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Size {
    /// Its width.
    pub width: f64,
    /// Its height.
    pub height: f64,
}

/// What a Map stores for one Resource: its origin, and optionally its size and
/// its plugin's Map content (ADR 0142).
#[derive(Debug, Clone, PartialEq)]
pub struct Placement {
    /// Its origin's x.
    pub x: f64,
    /// Its origin's y.
    pub y: f64,
    /// Its size, absent for the Closed Size.
    pub size: Option<Size>,
    /// Its plugin's Map content, absent for the plugin's default.
    pub content: Option<JsonValue>,
}

/// What a Graph's Edges draw at their heads (ADR 0105).
///
/// Exhaustive on purpose, as the schema's closed list is: Export writes each
/// value, and a new one should fail a host's build until it does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HeadShape {
    /// `arrow`.
    Arrow,
    /// `vee`.
    Vee,
    /// `dot`.
    Dot,
    /// `diamond`.
    Diamond,
}

impl HeadShape {
    pub(crate) const NAMES: &'static [&'static str] = &["arrow", "vee", "dot", "diamond"];

    pub(crate) fn from_index(index: usize) -> Option<Self> {
        [Self::Arrow, Self::Vee, Self::Dot, Self::Diamond]
            .get(index)
            .copied()
    }

    /// The name the space file writes.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Arrow => "arrow",
            Self::Vee => "vee",
            Self::Dot => "dot",
            Self::Diamond => "diamond",
        }
    }
}

/// One Edge: a directed connection whose identity is its endpoints (ADR 0032).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Edge {
    /// The Resource it leaves.
    pub from: ResourceId,
    /// The Resource it enters.
    pub to: ResourceId,
    /// Its Title: one line, trimmed.
    pub title: Option<String>,
    /// Whether its Title is hidden; stored only as `true`, beside a Title (ADR 0104).
    pub title_hidden: bool,
}

/// A Graph, owned by one Map (ADR 0040).
#[derive(Debug, Clone, PartialEq)]
pub struct Graph {
    /// Its id, unique across its Space.
    pub id: GraphId,
    /// Its title.
    pub title: String,
    /// Its CSS colour, when it has one.
    pub color: Option<String>,
    /// Its head shape, when it has one.
    pub head_shape: Option<HeadShape>,
    /// Its Edges, in authored order.
    pub edges: Vec<Edge>,
}

/// The kind of a Map; every Map is authored and positioned (ADR 0079).
///
/// Exhaustive on purpose, as [`HeadShape`] is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MapKind {
    /// `positioned`.
    Positioned,
}

impl MapKind {
    /// The name the space file writes.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        "positioned"
    }
}

/// A Map: a position for each Resource it holds, and the Graphs it owns.
#[derive(Debug, Clone, PartialEq)]
pub struct Map {
    /// Its id.
    pub id: MapId,
    /// Its title.
    pub title: String,
    /// Its kind.
    pub kind: MapKind,
    /// Its placements, each Resource once, in the order the file wrote them.
    pub positions: Vec<(ResourceId, Placement)>,
    /// Its Graphs, at least one, in authored order.
    pub graphs: Vec<Graph>,
    /// The Graph it opens active on, when it names one; otherwise its first.
    pub active_graph: Option<GraphId>,
}

/// A Space's `space.json` less its id and version.
#[derive(Debug, Clone, PartialEq)]
pub struct SpaceDocument {
    /// Its title.
    pub title: String,
    /// Its Maps, absent for a Space with no structure yet.
    pub maps: Option<Vec<Map>>,
    /// The Map it opens in, when it names one.
    pub default_map: Option<MapId>,
}

/// A complete, fully identified snapshot of one Space.
#[derive(Debug, Clone, PartialEq)]
pub struct SpaceSnapshot {
    /// Its id.
    pub id: SpaceId,
    /// Its document.
    pub document: SpaceDocument,
    /// Its Resources, in the order they were read.
    pub resources: Vec<Resource>,
}

/// A space file as read, before Import fills in the ids it may leave out.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DraftSpaceFile {
    pub(crate) id: Option<SpaceId>,
    pub(crate) title: String,
    pub(crate) maps: Option<Vec<DraftMap>>,
    pub(crate) default_map: Option<MapId>,
}

/// A Map as read, its id and its Graphs' perhaps left out.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DraftMap {
    pub(crate) id: Option<MapId>,
    pub(crate) title: String,
    pub(crate) positions: Vec<(ResourceId, Placement)>,
    pub(crate) graphs: Vec<DraftGraph>,
    pub(crate) active_graph: Option<GraphId>,
}

/// A Graph as read, its id perhaps left out.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DraftGraph {
    pub(crate) id: Option<GraphId>,
    pub(crate) title: String,
    pub(crate) color: Option<String>,
    pub(crate) head_shape: Option<HeadShape>,
    pub(crate) edges: Vec<Edge>,
}
