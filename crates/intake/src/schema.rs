//! The document schemas: `aggregate.json`, a `space.json` and a Resource, as
//! `packages/core/src/schema.ts` declares them, each raising the issues its
//! Zod schema raises (see [`crate::shape`]).

use crate::ids::{GraphId, Kind, MapId, ResourceId, SpaceId, is_kind_id};
use crate::json::JsonValue;
use crate::model::{
    DOCUMENT_VERSION, DraftGraph, DraftMap, DraftSpaceFile, Edge, Graph, HeadShape, Map, MapKind,
    Placement, Resource, Size, SpaceDocument, SpaceSnapshot,
};
use crate::plugins::listed;
use crate::refusal::ShapeProblem;
use crate::shape::{Checker, Issue, NumberCheck, Parsed, Status, Strictness, optional};
use crate::text::{is_js_trimmed, normalize_title};

/// The Closed Size, the smallest a Resource may be on either axis.
const CLOSED_SIZE: Size = Size {
    width: 260.0,
    height: 146.0,
};

/// Whether the ids a schema may leave out must be present.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Ids {
    /// Import input: a Space's, a Map's and a Graph's id may be absent and are minted.
    MayBeMinted,
    /// A stored document: every id present.
    Required,
}

fn into_result<T>(parsed: Parsed<T>, checker: Checker<'_>) -> Result<T, Vec<Issue>> {
    match parsed {
        Parsed::Valid(value) => Ok(value),
        Parsed::Dirty | Parsed::Aborted => Err(checker.into_issues()),
    }
}

/// What a kind that is no kind id is refused with: `KIND_ID_FORM`
/// (`packages/core/src/plugin-modules.ts`) after "is not a kind id".
const NOT_A_KIND_ID: &str = "is not a kind id — a bare id or vnd.<owner>.<name>, each part ASCII letters, digits and hyphens";

/// `z.literal(1)`.
fn version(checker: &mut Checker<'_>, value: Option<&JsonValue>) -> Parsed<()> {
    match value {
        Some(JsonValue::Number(number)) if *number == DOCUMENT_VERSION => Parsed::Valid(()),
        _ => {
            checker.issue(ShapeProblem::InvalidLiteral { expected: "1" });
            Parsed::Aborted
        }
    }
}

/// An id the schema may let Import mint: optional under [`Ids::MayBeMinted`].
fn maybe_id<'a, T>(
    checker: &mut Checker<'a>,
    value: Option<&'a JsonValue>,
    ids: Ids,
    parse: impl FnOnce(&str) -> Option<T>,
) -> Parsed<Option<T>> {
    match (ids, value) {
        (Ids::MayBeMinted, None) => Parsed::Valid(None),
        _ => checker.uuid(value, parse).map(Some),
    }
}

/// `aggregate.json`: a strict `{ version: 1, metaSpaceId }`, answering the Meta Space.
pub(crate) fn aggregate_file(json: &JsonValue) -> Result<SpaceId, Vec<Issue>> {
    let mut checker = Checker::new();
    let Some(mut object) =
        checker.object(Some(json), &["version", "metaSpaceId"], Strictness::Strict)
    else {
        return Err(checker.into_issues());
    };
    let declared = object.get("version");
    let parsed = checker.key("version", |c| version(c, declared));
    object.take(parsed);
    let meta = object.get("metaSpaceId");
    let parsed = checker.key("metaSpaceId", |c| c.uuid(meta, SpaceId::parse));
    let meta = object.take(parsed);
    into_result(object.finish(|| meta), checker)
}

/// What a `space.json` earns before its shape is parsed (`documentRefusal`):
/// a version this build does not read, then a retired space-level `graphs`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum DocumentRefusal {
    UnsupportedVersion(f64),
    RetiredSpaceGraphs,
}

/// The refusal a space document earns before its shape is parsed, if any.
pub(crate) fn document_refusal(json: Option<&JsonValue>) -> Option<DocumentRefusal> {
    let object = json?.as_object()?;
    if let Some(JsonValue::Number(declared)) = object.get("version")
        && *declared != DOCUMENT_VERSION
    {
        return Some(DocumentRefusal::UnsupportedVersion(*declared));
    }
    object
        .contains_key("graphs")
        .then_some(DocumentRefusal::RetiredSpaceGraphs)
}

/// A `space.json` as Import reads it (`importSpaceFileSchema`), or a stored
/// document (`spaceDocumentSchema`), which has no `id` and every other id.
pub(crate) fn space_file(json: &JsonValue, ids: Ids) -> Result<DraftSpaceFile, Vec<Issue>> {
    let mut checker = Checker::new();
    let parsed = space_file_with(&mut checker, json, ids);
    into_result(parsed, checker)
}

fn space_file_with<'a>(
    checker: &mut Checker<'a>,
    json: &'a JsonValue,
    ids: Ids,
) -> Parsed<DraftSpaceFile> {
    let keys: &[&str] = match ids {
        Ids::MayBeMinted => &["version", "id", "title", "maps", "defaultMap"],
        Ids::Required => &["version", "title", "maps", "defaultMap"],
    };
    let Some(mut object) = checker.object(Some(json), keys, Strictness::Strict) else {
        return Parsed::Aborted;
    };
    let declared = object.get("version");
    let parsed = checker.key("version", |c| version(c, declared));
    object.take(parsed);
    let id = match ids {
        Ids::MayBeMinted => {
            let value = object.get("id");
            let parsed = checker.key("id", |c| maybe_id(c, value, ids, SpaceId::parse));
            object.take(parsed).flatten()
        }
        Ids::Required => None,
    };
    let title = object.get("title");
    let parsed = checker.key("title", |c| c.non_empty_string(title));
    let title = object.take(parsed);
    let maps = object.get("maps");
    let parsed = checker.key("maps", |c| {
        optional(c, maps, |c, value| {
            c.array(Some(value), 0, |c, map| draft_map(c, map, ids))
        })
    });
    let maps = object.take(parsed);
    let default_map = object.get("defaultMap");
    let parsed = checker.key("defaultMap", |c| {
        optional(c, default_map, |c, value| c.uuid(Some(value), MapId::parse))
    });
    let default_map = object.take(parsed);
    object.finish(|| {
        Some(DraftSpaceFile {
            id,
            title: title?.to_owned(),
            maps: maps?,
            default_map: default_map?,
        })
    })
}

const MAP_KEYS: &[&str] = &["id", "title", "kind", "positions", "graphs", "activeGraph"];

/// A Map: `kind` defaults to `positioned`, then the union over the one kind.
fn draft_map<'a>(checker: &mut Checker<'a>, value: &'a JsonValue, ids: Ids) -> Parsed<DraftMap> {
    let Some(object) = value.as_object() else {
        return checker.wrong_type("object", Some(value));
    };
    match object.get("kind") {
        None => {}
        Some(JsonValue::String(kind)) if kind == "positioned" => {}
        Some(_) => {
            checker.key("kind", |c| {
                c.issue(ShapeProblem::InvalidUnionDiscriminator {
                    options: &["positioned"],
                });
            });
            return Parsed::Aborted;
        }
    }
    let Some(mut object) = checker.object(Some(value), MAP_KEYS, Strictness::Strict) else {
        return Parsed::Aborted;
    };
    let id = object.get("id");
    let parsed = checker.key("id", |c| maybe_id(c, id, ids, MapId::parse));
    let id = object.take(parsed);
    let title = object.get("title");
    let parsed = checker.key("title", |c| c.non_empty_string(title));
    let title = object.take(parsed);
    let positions = object.get("positions");
    let parsed = checker.key("positions", |c| positions_record(c, positions));
    let positions = object.take(parsed);
    let graphs = object.get("graphs");
    let parsed = checker.key("graphs", |c| {
        c.array(graphs, 1, |c, graph| draft_graph(c, graph, ids))
    });
    let graphs = object.take(parsed);
    let active = object.get("activeGraph");
    let parsed = checker.key("activeGraph", |c| {
        optional(c, active, |c, value| c.uuid(Some(value), GraphId::parse))
    });
    let active_graph = object.take(parsed);
    object.finish(|| {
        Some(DraftMap {
            id: id?,
            title: title?.to_owned(),
            positions: positions?,
            graphs: graphs?,
            active_graph: active_graph?,
        })
    })
}

/// `z.record(uuid, placement)`: each key checked as a UUID, each value as a placement.
fn positions_record<'a>(
    checker: &mut Checker<'a>,
    value: Option<&'a JsonValue>,
) -> Parsed<Vec<(ResourceId, Placement)>> {
    let Some(JsonValue::Object(object)) = value else {
        return checker.wrong_type("object", value);
    };
    let mut status = Status::Valid;
    let mut positions = Vec::with_capacity(object.len());
    for (key, entry) in object.iter() {
        let (id, placement) = checker.key(key, |c| {
            let id = ResourceId::parse(key);
            if id.is_none() {
                c.issue(ShapeProblem::InvalidUuid);
            }
            (id, placement(c, entry))
        });
        if id.is_none() {
            status = status.max(Status::Dirty);
        }
        status = status.max(placement.status());
        if let (Some(id), Parsed::Valid(placement)) = (id, placement) {
            positions.push((id, placement));
        }
    }
    status.parsed(positions)
}

/// A placement: a strict `{ x, y, size?, editSize?, content? }`.
fn placement<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Parsed<Placement> {
    let Some(mut object) = checker.object(
        Some(value),
        &["x", "y", "size", "editSize", "content"],
        Strictness::Strict,
    ) else {
        return Parsed::Aborted;
    };
    let x = object.get("x");
    let parsed = checker.key("x", |c| c.number(x, &[NumberCheck::Finite]));
    let x = object.take(parsed);
    let y = object.get("y");
    let parsed = checker.key("y", |c| c.number(y, &[NumberCheck::Finite]));
    let y = object.take(parsed);
    let size = object.get("size");
    let parsed = checker.key("size", |c| optional(c, size, resource_size));
    let size = object.take(parsed);
    let edit_size = object.get("editSize");
    let parsed = checker.key("editSize", |c| optional(c, edit_size, resource_size));
    let edit_size = object.take(parsed);
    let content = object.get("content");
    let parsed = checker.key("content", |c| {
        optional(c, content, |c, value| {
            c.json_value(value).parsed(()).map(|()| value.clone())
        })
    });
    let content = object.take(parsed);
    object.finish(|| {
        Some(Placement {
            x: x?,
            y: y?,
            size: size?,
            edit_size: edit_size?,
            content: content?,
        })
    })
}

/// A size: a strict `{ width, height }`, each finite and no smaller than the Closed Size.
fn resource_size<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Parsed<Size> {
    let Some(mut object) = checker.object(Some(value), &["width", "height"], Strictness::Strict)
    else {
        return Parsed::Aborted;
    };
    let width = object.get("width");
    let parsed = checker.key("width", |c| {
        c.number(
            width,
            &[NumberCheck::Finite, NumberCheck::Min(CLOSED_SIZE.width)],
        )
    });
    let width = object.take(parsed);
    let height = object.get("height");
    let parsed = checker.key("height", |c| {
        c.number(
            height,
            &[NumberCheck::Finite, NumberCheck::Min(CLOSED_SIZE.height)],
        )
    });
    let height = object.take(parsed);
    object.finish(|| {
        Some(Size {
            width: width?,
            height: height?,
        })
    })
}

/// A Graph: a strict `{ id, title, color?, headShape?, edges }`.
fn draft_graph<'a>(
    checker: &mut Checker<'a>,
    value: &'a JsonValue,
    ids: Ids,
) -> Parsed<DraftGraph> {
    let Some(mut object) = checker.object(
        Some(value),
        &["id", "title", "color", "headShape", "edges"],
        Strictness::Strict,
    ) else {
        return Parsed::Aborted;
    };
    let id = object.get("id");
    let parsed = checker.key("id", |c| maybe_id(c, id, ids, GraphId::parse));
    let id = object.take(parsed);
    let title = object.get("title");
    let parsed = checker.key("title", |c| c.non_empty_string(title));
    let title = object.take(parsed);
    let color = object.get("color");
    let parsed = checker.key("color", |c| {
        optional(c, color, |c, value| c.non_empty_string(Some(value)))
    });
    let color = object.take(parsed);
    let head_shape = object.get("headShape");
    let parsed = checker.key("headShape", |c| {
        optional(c, head_shape, |c, value| {
            c.one_of(Some(value), HeadShape::NAMES)
        })
    });
    let head_shape = object.take(parsed);
    let edges = object.get("edges");
    let parsed = checker.key("edges", |c| c.array(edges, 0, edge));
    let edges = object.take(parsed);
    object.finish(|| {
        Some(DraftGraph {
            id: id?,
            title: title?.to_owned(),
            color: color?.map(str::to_owned),
            head_shape: match head_shape? {
                Some(index) => Some(HeadShape::from_index(index)?),
                None => None,
            },
            edges: edges?,
        })
    })
}

/// An Edge's Title: a string, non-empty, trimmed and one line, each check its own issue.
fn edge_title<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Parsed<&'a str> {
    let Parsed::Valid(text) = checker.string(Some(value)) else {
        return Parsed::Aborted;
    };
    let mut status = Status::Valid;
    if text.is_empty() {
        checker.issue(ShapeProblem::TooSmall {
            of: "string",
            minimum: 1.0,
        });
        status = Status::Dirty;
    }
    if !is_js_trimmed(text) {
        checker.issue(ShapeProblem::Custom("An Edge Title is stored trimmed"));
        status = Status::Dirty;
    }
    if text.contains(['\r', '\n']) {
        checker.issue(ShapeProblem::Custom("An Edge Title must be one line"));
        status = Status::Dirty;
    }
    status.parsed(text)
}

/// An Edge: a strict `{ from, to, title?, titleHidden? }` that hides only a Title it has.
fn edge<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Parsed<Edge> {
    let Some(mut object) = checker.object(
        Some(value),
        &["from", "to", "title", "titleHidden"],
        Strictness::Strict,
    ) else {
        return Parsed::Aborted;
    };
    let from = object.get("from");
    let parsed = checker.key("from", |c| c.uuid(from, ResourceId::parse));
    let from = object.take(parsed);
    let to = object.get("to");
    let parsed = checker.key("to", |c| c.uuid(to, ResourceId::parse));
    let to = object.take(parsed);
    let title = object.get("title");
    let parsed = checker.key("title", |c| optional(c, title, edge_title));
    let title = object.take(parsed);
    let hidden = object.get("titleHidden");
    let parsed = checker.key("titleHidden", |c| {
        optional(c, hidden, |c, value| match value {
            JsonValue::Bool(true) => Parsed::Valid(()),
            _ => {
                c.issue(ShapeProblem::InvalidLiteral { expected: "true" });
                Parsed::Aborted
            }
        })
    });
    let title_hidden = object.take(parsed);
    // The object-level refinement runs unless a member aborted.
    if object.status() != Status::Aborted
        && object.object().contains_key("titleHidden")
        && !object.object().contains_key("title")
    {
        checker.key("titleHidden", |c| {
            c.issue(ShapeProblem::Custom("An Edge can hide only a Title it has"));
        });
        object.take(Parsed::<()>::Dirty);
    }
    object.finish(|| {
        Some(Edge {
            from: from?,
            to: to?,
            title: title?.map(str::to_owned),
            title_hidden: title_hidden?.is_some(),
        })
    })
}

/// Which envelope a Resource arrives in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Envelope {
    /// A Resource file, strict, carrying its own id (`resourceFileSchema`).
    File,
    /// A stored document, its id beside it, unknown keys stripped (`resourceDocumentSchema`).
    Document,
}

/// A Resource's kind and content: the content its plugin parses, a missing
/// kind's carried whole as a JSON object, a kind that is no kind id refused.
fn kinded_content<'a>(checker: &mut Checker<'a>, json: &'a JsonValue) -> Parsed<Kind> {
    let Some(object) = json.as_object() else {
        return Parsed::Aborted;
    };
    let Some(JsonValue::String(kind)) = object.get("kind") else {
        return Parsed::Aborted;
    };
    let content = object.get("content");
    let status = if let Some(plugin) = listed(kind) {
        checker.key("content", |c| plugin.check_content(c, content))
    } else if !is_kind_id(kind) {
        checker.key("kind", |c| {
            c.issue(ShapeProblem::Custom(NOT_A_KIND_ID));
        });
        Status::Aborted
    } else {
        checker.key("content", |c| {
            let status = c.required_json_value(content);
            if status != Status::Aborted && content.and_then(JsonValue::as_object).is_none() {
                c.issue(ShapeProblem::Custom("must be an object"));
                return Status::Dirty;
            }
            status
        })
    };
    status.parsed(()).and_then_kind(kind)
}

trait AndThenKind {
    fn and_then_kind(self, kind: &str) -> Parsed<Kind>;
}

impl AndThenKind for Parsed<()> {
    fn and_then_kind(self, kind: &str) -> Parsed<Kind> {
        match self {
            Parsed::Valid(()) => Kind::parse(kind).map_or(Parsed::Aborted, Parsed::Valid),
            Parsed::Dirty => Parsed::Dirty,
            Parsed::Aborted => Parsed::Aborted,
        }
    }
}

/// A Resource in either envelope: the envelope and its kind's content each
/// checked whatever the other answers, so every issue is raised at once.
pub(crate) fn resource(json: &JsonValue, envelope: Envelope) -> Result<Resource, Vec<Issue>> {
    let mut checker = Checker::new();
    let parsed = resource_with(&mut checker, json, envelope);
    match into_result(parsed, checker)? {
        (Some(id), title, kind, content) => Ok(Resource {
            id,
            title,
            kind,
            content,
        }),
        (None, ..) => Err(vec![Issue {
            field: Some("id".to_owned()),
            problem: ShapeProblem::InvalidUuid,
        }]),
    }
}

/// A Resource's id (in the file envelope only), Title, kind and content.
/// A Resource's own id: a UUID written in lower case (ADR 0180), as
/// `resourceIdSchema` reads it. A reference to a Resource is any UUID; one
/// spelled in upper case names no Resource. The case is asked only of a UUID,
/// so a value that is not one meets the one refusal it met before.
fn resource_id<'a>(checker: &mut Checker<'a>, value: Option<&'a JsonValue>) -> Parsed<ResourceId> {
    match checker.uuid(value, ResourceId::parse) {
        Parsed::Valid(id) if !id.uuid().is_lower_case() => {
            checker.issue(ShapeProblem::Custom(
                "A Resource id must be written in lower case",
            ));
            Parsed::Dirty
        }
        parsed => parsed,
    }
}

type ResourceBody = (Option<ResourceId>, String, Kind, JsonValue);

fn resource_with<'a>(
    checker: &mut Checker<'a>,
    json: &'a JsonValue,
    envelope: Envelope,
) -> Parsed<ResourceBody> {
    let (keys, strictness): (&[&str], _) = match envelope {
        Envelope::File => (&["id", "title", "kind", "content"], Strictness::Strict),
        Envelope::Document => (&["title", "kind", "content"], Strictness::Strip),
    };
    let mut fields = None;
    if let Some(mut object) = checker.object(Some(json), keys, strictness) {
        let id = match envelope {
            Envelope::File => {
                let value = object.get("id");
                let parsed = checker.key("id", |c| resource_id(c, value));
                object.take(parsed).map(Some)
            }
            Envelope::Document => Some(None),
        };
        let title = object.get("title");
        let parsed = checker.key("title", |c| match c.string(title) {
            Parsed::Valid(text) => {
                let normalized = normalize_title(text);
                if normalized.is_empty() {
                    c.issue(ShapeProblem::Custom(
                        "A title must have at least one line with something in it",
                    ));
                    Parsed::Dirty
                } else {
                    Parsed::Valid(normalized)
                }
            }
            _ => Parsed::Aborted,
        });
        let title = object.take(parsed);
        let kind = object.get("kind");
        let parsed = checker.key("kind", |c| c.string(kind));
        object.take(parsed);
        fields = match object.finish(|| Some((id?, title?))) {
            Parsed::Valid(fields) => Some(fields),
            _ => None,
        };
    }
    let kind = kinded_content(checker, json);
    match (fields, kind) {
        (Some((id, title)), Parsed::Valid(kind)) => {
            let content = json
                .as_object()
                .and_then(|object| object.get("content"))
                .cloned()
                .unwrap_or(JsonValue::Null);
            Parsed::Valid((id, title, kind, content))
        }
        // The envelope is a transform over any value, so a refused Resource
        // dirties what holds it and never aborts it.
        _ => Parsed::Dirty,
    }
}

/// A stored Space snapshot, `{ id, document, resources: [{ id, document }] }`
/// (`spaceSnapshotSchema`), every issue located by its path from the root.
pub(crate) fn space_snapshot(json: &JsonValue) -> Result<SpaceSnapshot, Vec<Issue>> {
    let mut checker = Checker::new();
    let parsed = space_snapshot_with(&mut checker, json);
    into_result(parsed, checker)
}

fn space_snapshot_with<'a>(
    checker: &mut Checker<'a>,
    json: &'a JsonValue,
) -> Parsed<SpaceSnapshot> {
    let Some(mut object) = checker.object(
        Some(json),
        &["id", "document", "resources"],
        Strictness::Strip,
    ) else {
        return Parsed::Aborted;
    };
    let id = object.get("id");
    let parsed = checker.key("id", |c| c.uuid(id, SpaceId::parse));
    let id = object.take(parsed);
    let document = object.get("document");
    let parsed = checker.key("document", |c| match document {
        Some(value) => space_file_with(c, value, Ids::Required),
        None => c.wrong_type("object", None),
    });
    let document = object.take(parsed);
    let resources = object.get("resources");
    let parsed = checker.key("resources", |c| {
        c.array(resources, 0, |c, item| {
            let Some(mut entry) = c.object(Some(item), &["id", "document"], Strictness::Strip)
            else {
                return Parsed::Aborted;
            };
            let id = entry.get("id");
            let parsed = c.key("id", |c| resource_id(c, id));
            let id = entry.take(parsed);
            let body = entry.get("document");
            let parsed = c.key("document", |c| match body {
                Some(value) => resource_with(c, value, Envelope::Document),
                None => c.wrong_type("object", None),
            });
            let body = entry.take(parsed);
            entry.finish(|| {
                let (_, title, kind, content) = body?;
                Some(Resource {
                    id: id?,
                    title,
                    kind,
                    content,
                })
            })
        })
    });
    let resources = object.take(parsed);
    object.finish(|| {
        Some(SpaceSnapshot {
            id: id?,
            document: complete_document(document?)?,
            resources: resources?,
        })
    })
}

/// A stored document's Space file, every id present, as the model holds it.
fn complete_document(file: DraftSpaceFile) -> Option<SpaceDocument> {
    let maps = match file.maps {
        None => None,
        Some(maps) => Some(
            maps.into_iter()
                .map(|draft| {
                    Some(Map {
                        id: draft.id?,
                        title: draft.title,
                        kind: MapKind::Positioned,
                        positions: draft.positions,
                        graphs: draft
                            .graphs
                            .into_iter()
                            .map(|graph| {
                                Some(Graph {
                                    id: graph.id?,
                                    title: graph.title,
                                    color: graph.color,
                                    head_shape: graph.head_shape,
                                    edges: graph.edges,
                                })
                            })
                            .collect::<Option<Vec<_>>>()?,
                        active_graph: draft.active_graph,
                    })
                })
                .collect::<Option<Vec<_>>>()?,
        ),
    };
    Some(SpaceDocument {
        title: file.title,
        maps,
        default_map: file.default_map,
    })
}

/// Where an issue on a stored snapshot falls among its Space directory's files
/// (`locateSnapshotIssue`): `space.json` for its `id` and `document`, and a
/// Resource's file for each of `resources`, named by the id the snapshot gives
/// it when that is a string, else by its position, `resources/[<index>].json`.
/// A fault in `resources` itself falls at the `resources` directory.
pub(crate) fn locate_snapshot_issue(
    json: &JsonValue,
    field: Option<&str>,
) -> (String, Option<String>) {
    let space = |field: Option<&str>| ("space.json".to_owned(), field.map(str::to_owned));
    let Some(field) = field else {
        return space(None);
    };
    let mut parts = field.splitn(4, '.');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some("resources"), Some(index), part, rest) if index.parse::<usize>().is_ok() => {
            let id = index
                .parse::<usize>()
                .ok()
                .and_then(|position| {
                    json.as_object()?
                        .get("resources")
                        .and_then(|resources| match resources {
                            JsonValue::Array(items) => items.get(position),
                            _ => None,
                        })
                })
                .and_then(JsonValue::as_object)
                .and_then(|resource| resource.get("id"))
                .and_then(JsonValue::as_str);
            let file = id.map_or_else(
                || format!("resources/[{index}].json"),
                |id| format!("resources/{id}.json"),
            );
            let field = match (part, rest) {
                (Some("document"), rest) => rest.map(str::to_owned),
                (Some(part), Some(rest)) => Some(format!("{part}.{rest}")),
                (Some(part), None) => Some(part.to_owned()),
                (None, _) => None,
            };
            (file, field)
        }
        (Some("resources"), None, ..) => ("resources".to_owned(), None),
        (Some("document"), ..) => space(field.strip_prefix("document.")),
        _ => space(Some(field)),
    }
}

/// A Resource file's JSON (`decodeFile`): refused at `kind` alone unless it
/// declares a kind that is a kind id, then held to the strict file envelope.
pub(crate) fn resource_file(json: &JsonValue) -> Result<Resource, Vec<Issue>> {
    let declared = json
        .as_object()
        .and_then(|object| object.get("kind"))
        .and_then(JsonValue::as_str);
    let problem = match declared {
        None => Some(ShapeProblem::Custom(
            "a Resource file must declare its kind",
        )),
        Some(kind) if !is_kind_id(kind) => Some(ShapeProblem::Custom(NOT_A_KIND_ID)),
        Some(_) => None,
    };
    if let Some(problem) = problem {
        return Err(vec![Issue {
            field: Some("kind".to_owned()),
            problem,
        }]);
    }
    resource(json, Envelope::File)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn issue_fields(result: Result<impl std::fmt::Debug, Vec<Issue>>) -> Vec<Option<String>> {
        let mut fields: Vec<_> = result
            .expect_err("the document should be refused")
            .into_iter()
            .map(|issue| issue.field)
            .collect();
        fields.sort();
        fields
    }

    fn some(fields: &[&str]) -> Vec<Option<String>> {
        let mut fields: Vec<_> = fields
            .iter()
            .map(|field| Some((*field).to_owned()))
            .collect();
        fields.sort();
        fields
    }

    const RESOURCE: &str = "00000000-0000-4000-8000-000000000101";

    mod given_aggregate_files {
        use super::*;

        #[test]
        fn reads_the_meta_space() {
            let json =
                parse(r#"{"version": 1, "metaSpaceId": "10000000-0000-4000-8000-000000000001"}"#)
                    .unwrap();
            assert_eq!(
                aggregate_file(&json).map(|id| id.to_string()),
                Ok("10000000-0000-4000-8000-000000000001".to_owned()),
                "the Meta Space named"
            );
        }

        #[test]
        fn raises_an_issue_per_fault_and_one_for_unknown_keys() {
            let json = parse(r#"{"version": 2, "metaSpaceId": "nope", "extra": true}"#).unwrap();
            let mut fields = issue_fields(aggregate_file(&json));
            fields.sort();
            assert_eq!(
                fields,
                vec![None, Some("metaSpaceId".into()), Some("version".into())],
                "the version, the id and the unknown key, each once"
            );
        }
    }

    mod given_space_files {
        use super::*;

        fn space(maps: &str) -> JsonValue {
            parse(&format!(
                r#"{{"version": 1, "id": "10000000-0000-4000-8000-000000000001", "title": "Space", "maps": {maps}}}"#
            ))
            .unwrap()
        }

        #[test]
        fn defaults_a_maps_kind_to_positioned_and_lets_import_mint_its_ids() {
            let json = space(&format!(
                r#"[{{"title": "M", "positions": {{"{RESOURCE}": {{"x": 0, "y": 0}}}}, "graphs": [{{"title": "G", "edges": []}}]}}]"#
            ));
            let draft = space_file(&json, Ids::MayBeMinted).expect("the space file reads");
            let map = draft
                .maps
                .as_deref()
                .and_then(<[_]>::first)
                .expect("one Map");
            assert_eq!(map.id, None, "the Map's id is left for Import to mint");
            assert_eq!(
                map.graphs.first().map(|graph| graph.id),
                Some(None),
                "so is its Graph's"
            );
        }

        #[test]
        fn refuses_another_map_kind_at_its_kind() {
            let json = space(r#"[{"kind": "automatic", "title": "M"}]"#);
            assert_eq!(
                issue_fields(space_file(&json, Ids::MayBeMinted)),
                some(&["maps.0.kind"]),
                "the discriminator is at fault, and nothing else is checked"
            );
        }

        #[test]
        fn locates_faults_deep_in_a_map() {
            let json = space(&format!(
                r#"[{{"id": "00000000-0000-4000-8000-000000000a01", "title": "", "positions": {{"bad": {{"x": 1e400, "y": 0, "size": {{"width": 1, "height": 146}}}}}}, "graphs": [{{"title": "G", "edges": [{{"from": "{RESOURCE}", "to": "{RESOURCE}", "title": " a\nb", "titleHidden": true}}]}}]}}]"#
            ));
            assert_eq!(
                issue_fields(space_file(&json, Ids::MayBeMinted)),
                some(&[
                    "maps.0.title",
                    "maps.0.positions.bad",
                    "maps.0.positions.bad.x",
                    "maps.0.positions.bad.size.width",
                    "maps.0.graphs.0.edges.0.title",
                    "maps.0.graphs.0.edges.0.title",
                ]),
                "each issue once at its path; an untrimmed two-line Title earns two"
            );
        }

        #[test]
        fn refuses_a_map_with_no_graph_and_an_edge_hiding_no_title() {
            let json = space(&format!(
                r#"[{{"title": "M", "positions": {{}}, "graphs": []}}, {{"title": "N", "positions": {{}}, "graphs": [{{"title": "G", "edges": [{{"from": "{RESOURCE}", "to": "{RESOURCE}", "titleHidden": true}}]}}]}}]"#
            ));
            assert_eq!(
                issue_fields(space_file(&json, Ids::MayBeMinted)),
                some(&["maps.0.graphs", "maps.1.graphs.0.edges.0.titleHidden"]),
                "at least one Graph, and only a Title it has is hidden"
            );
        }
    }

    mod given_resource_files {
        use super::*;

        fn file(body: &str) -> JsonValue {
            parse(body).unwrap()
        }

        #[test]
        fn refuses_a_file_declaring_no_kind_at_its_kind_alone() {
            let json = file(r#"{"id": "x", "title": 7}"#);
            assert_eq!(
                issue_fields(resource_file(&json)),
                some(&["kind"]),
                "kind alone"
            );
        }

        #[test]
        fn refuses_the_envelope_and_the_content_together() {
            let json = file(&format!(
                r#"{{"id": "{RESOURCE}", "title": "  \n ", "kind": "markdown", "content": {{"url": "notes.md", "x": 1}}, "extra": 1}}"#
            ));
            let mut fields = issue_fields(resource_file(&json));
            fields.sort();
            assert_eq!(
                fields,
                vec![
                    None,
                    Some("content".into()),
                    Some("content.url".into()),
                    Some("title".into())
                ],
                "the unknown envelope key, the content's unknown key, its url and the blank title"
            );
        }

        #[test]
        fn carries_a_missing_kinds_content_whole_but_only_an_object() {
            let accepted = file(&format!(
                r#"{{"id": "{RESOURCE}", "title": "W", "kind": "vnd.acme.widget", "content": {{"dial": 11}}}}"#
            ));
            let resource = resource_file(&accepted).expect("a missing kind is carried");
            assert_eq!(
                resource.content.to_string(),
                r#"{"dial":11}"#,
                "content kept whole"
            );
            let refused = file(&format!(
                r#"{{"id": "{RESOURCE}", "title": "W", "kind": "vnd.acme.widget", "content": [1e400]}}"#
            ));
            assert_eq!(
                issue_fields(resource_file(&refused)),
                some(&["content", "content.0"]),
                "an infinite number, and content that is no object"
            );
        }

        #[test]
        fn normalizes_the_title() {
            let json = file(&format!(
                r#"{{"id": "{RESOURCE}", "title": "Name \r\nSub\n", "kind": "ur", "content": {{}}}}"#
            ));
            assert_eq!(
                resource_file(&json).map(|resource| resource.title),
                Ok("Name\nSub".to_owned()),
                "the Title as stored"
            );
        }
    }
}
