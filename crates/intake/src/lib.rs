//! The InfinityCube intake: reads and validates an Aggregate directory.
//!
//! The Rust half of ADR 0156: the one intake of the Rust runtime, held to the
//! TypeScript intake (`loadSpace`, `loadSpaceAggregate` and the directory
//! reader) by the conformance corpus in `conformance/intake/`. The two agree
//! on the **kind** of each refusal and **where** it is — the file, the id, the
//! field and, for an Edge, its endpoints — not on the words of its message.
//!
//! It is pure: no IO and no async. The host lists and reads a directory into
//! [`AggregateFiles`], bytes by path, and intake answers.
//!
//! - [`import_aggregate`] runs the whole of Import's intake, as `cube check`
//!   does; [`read_aggregate`] is its first half, the directory reader, and
//!   [`load_aggregate`] its second, the aggregate intake, which a commit's
//!   candidate aggregate goes through too.
//! - [`load_space`] is one Space's intake.
//! - A refusal is a [`Refusal`]; every refusal of a stage is returned
//!   together as [`Refusals`].
//!
//! # Where it cannot match the TypeScript intake exactly
//!
//! - **Strings JavaScript can hold and Rust cannot.** A JSON string escaping a
//!   lone UTF-16 surrogate (`"\ud800"`) parses in JavaScript; here it is
//!   refused as [`Refusal::InvalidJson`].
//! - **Nesting.** Arrays and objects nested deeper than [`json::MAX_DEPTH`]
//!   are refused as invalid JSON rather than risk the stack, which holds on a
//!   thread with at least 1 MiB of it.
//! - **Key order.** An object keeps its keys in the order written, where
//!   `JSON.parse` lists integer-like keys first (see [`json::JsonValue`]).
//!   No answer intake gives depends on it; a writer orders keys itself.
//! - **URLs.** An Image Resource's URL is judged by the `url` crate's WHATWG
//!   parser where TypeScript uses the engine's `URL.canParse`; the two
//!   implement one standard and may differ at its edges (IDNA versions).

pub mod assets;
pub mod json;
pub mod text;

mod aggregate;
mod directory;
mod ids;
mod model;
mod plugins;
mod refusal;
mod schema;
mod shape;
mod snapshot;
mod space;

pub use aggregate::{SpaceAggregate, load_aggregate};
pub use directory::{
    AGGREGATE_FILE_NAME, ASSETS_DIRECTORY_NAME, AggregateContents, AggregateFiles, Entry,
    ImportedAggregate, import_aggregate, read_aggregate, space_directory_id,
};
pub use ids::{GraphId, Kind, MapId, ResourceId, SpaceId, Uuid, is_kind_id};
pub use model::{
    DOCUMENT_VERSION, Edge, Graph, HeadShape, Map, MapKind, Placement, Resource, Size,
    SpaceDocument, SpaceSnapshot,
};
pub use plugins::{is_plugin_kind, plugin_kinds};
pub use refusal::{
    EdgeEnd, EdgeEnds, Refusal, RefusalKind, Refusals, SelectionProblem, ShapeProblem,
};
pub use snapshot::decode_space_snapshot;
pub use space::{Space, load_space};
