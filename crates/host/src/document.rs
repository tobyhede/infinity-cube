//! A Space snapshot as JSON: the files Export writes (`space.json` and one
//! file per Resource) and the snapshot the HTTP application answers.
//!
//! Every object is built key by key in the order the TypeScript Export
//! writes it (`src/aggregate-directory/write-space-directory.ts`), so the
//! bytes do not depend on the order a file or a commit wrote its keys in:
//!
//! - `space.json`: `version`, `id`, `title`, `maps`, `defaultMap`; each Map
//!   `id`, `title`, `kind`, `positions` (by Resource id in code unit order),
//!   `graphs`, `activeGraph`; each placement `x`, `y`, `size`, `content`;
//!   each Graph `id`, `title`, `color`, `headShape`, `edges`; each Edge
//!   `from`, `to`, `title`, `titleHidden`. An absent member writes no key.
//! - A Resource file: `id`, `title`, `kind`, `content`.
//! - A listed plugin's content in its schema's key order (`canonicalContent`),
//!   and every other JSON value, Map content included, with its keys in
//!   `canonicalJsonValue`'s order: code unit order, as JavaScript then lists an
//!   object's keys, array-index keys first and ascending.
//!
//! The snapshot on the wire is the stored one as `encodeLoadedSpace`
//! serialises it, which is what Zod's decoding of the commit (or of the
//! files) left: every declared object in its schema's key order, the same
//! order as above, but a Map's `positions` in the order they were written,
//! and every undeclared JSON value, Map content and a kind no plugin draws,
//! with its keys as a JavaScript object lists them: array-index keys first
//! and ascending, then the rest in the order first written.

use std::cmp::Ordering;

use intake::json::{JsonObject, JsonValue};
use intake::text::compare_utf16;
use intake::{
    DOCUMENT_VERSION, Edge, Graph, Map, Placement, Resource, SpaceSnapshot, plugin_content_keys,
};

fn string(text: &str) -> JsonValue {
    JsonValue::String(text.to_owned())
}

fn object<const N: usize>(entries: [(&str, Option<JsonValue>); N]) -> JsonValue {
    JsonValue::Object(
        entries
            .into_iter()
            .filter_map(|(key, value)| value.map(|value| (key.to_owned(), value)))
            .collect(),
    )
}

/// The value of `key` as an array index, as JavaScript lists such keys
/// first: a canonical decimal integer below 2³² − 1.
fn array_index(key: &str) -> Option<u32> {
    let index: u32 = key.parse().ok()?;
    (index < u32::MAX && index.to_string() == key).then_some(index)
}

/// Two keys in the order a JavaScript object built in code unit order lists them.
fn javascript_key_order(left: &str, right: &str) -> Ordering {
    match (array_index(left), array_index(right)) {
        (Some(left), Some(right)) => left.cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => compare_utf16(left, right),
    }
}

/// Which key order a document is written in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Order {
    /// The files Export writes: positions and undeclared keys sorted.
    Export,
    /// The stored snapshot as the wire serialises it.
    Wire,
}

impl Order {
    fn value(self, value: &JsonValue) -> JsonValue {
        match self {
            Self::Export => canonical_value(value),
            Self::Wire => javascript_value(value),
        }
    }

    fn object(self, entries: &JsonObject) -> JsonObject {
        match self {
            Self::Export => canonical_object(entries),
            Self::Wire => javascript_object(entries),
        }
    }
}

/// A JSON value as a JavaScript object built from it lists its keys, at every
/// depth: array-index keys first and ascending, then the rest as first written.
fn javascript_value(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::Array(items) => JsonValue::Array(items.iter().map(javascript_value).collect()),
        JsonValue::Object(entries) => JsonValue::Object(javascript_object(entries)),
        other => other.clone(),
    }
}

fn javascript_object(entries: &JsonObject) -> JsonObject {
    let mut indexed: Vec<(u32, &str, &JsonValue)> = Vec::new();
    let mut named: Vec<(&str, &JsonValue)> = Vec::new();
    for (key, value) in entries.iter() {
        match array_index(key) {
            Some(index) => indexed.push((index, key, value)),
            None => named.push((key, value)),
        }
    }
    indexed.sort_by_key(|(index, _, _)| *index);
    indexed
        .into_iter()
        .map(|(_, key, value)| (key, value))
        .chain(named)
        .map(|(key, value)| (key.to_owned(), javascript_value(value)))
        .collect()
}

/// `canonicalJsonValue`: every object's keys in code unit order, at every depth.
pub(crate) fn canonical_value(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::Array(items) => JsonValue::Array(items.iter().map(canonical_value).collect()),
        JsonValue::Object(entries) => JsonValue::Object(canonical_object(entries)),
        other => other.clone(),
    }
}

fn canonical_object(entries: &JsonObject) -> JsonObject {
    let mut sorted: Vec<(&str, &JsonValue)> = entries.iter().collect();
    sorted.sort_by(|(left, _), (right, _)| javascript_key_order(left, right));
    sorted
        .into_iter()
        .map(|(key, value)| (key.to_owned(), canonical_value(value)))
        .collect()
}

fn ordered(value: &JsonObject, keys: impl IntoIterator<Item = &'static str>) -> JsonObject {
    keys.into_iter()
        .filter_map(|key| {
            value
                .get(key)
                .map(|member| (key.to_owned(), member.clone()))
        })
        .collect()
}

/// A Resource's content: a listed plugin's in its schema's key order
/// (`canonicalResource`), any other in `order`.
fn content(resource: &Resource, order: Order) -> JsonValue {
    let Some(object) = resource.content.as_object() else {
        return resource.content.clone();
    };
    match plugin_content_keys(resource.kind.as_str()) {
        Some(keys) => JsonValue::Object(
            keys.iter()
                .filter_map(|key| {
                    let member = object.get(key.name)?;
                    let member = match member.as_object() {
                        Some(inner) if !key.nested.is_empty() => {
                            JsonValue::Object(ordered(inner, key.nested.iter().copied()))
                        }
                        _ => member.clone(),
                    };
                    Some((key.name.to_owned(), member))
                })
                .collect(),
        ),
        None => JsonValue::Object(order.object(object)),
    }
}

/// A Resource file: `{ id, title, kind, content }`.
pub(crate) fn resource_file(resource: &Resource) -> JsonValue {
    object([
        ("id", Some(string(resource.id.as_str()))),
        ("title", Some(string(&resource.title))),
        ("kind", Some(string(resource.kind.as_str()))),
        ("content", Some(content(resource, Order::Export))),
    ])
}

/// A Resource as a snapshot carries it: `{ id, document: { title, kind, content } }`.
fn wire_resource(resource: &Resource) -> JsonValue {
    object([
        ("id", Some(string(resource.id.as_str()))),
        ("document", Some(wire_resource_document(resource))),
    ])
}

/// A Resource's document as a snapshot carries it: `{ title, kind, content }`.
pub(crate) fn wire_resource_document(resource: &Resource) -> JsonValue {
    object([
        ("title", Some(string(&resource.title))),
        ("kind", Some(string(resource.kind.as_str()))),
        ("content", Some(content(resource, Order::Wire))),
    ])
}

fn edge(edge: &Edge) -> JsonValue {
    let title = edge.title.as_deref().map(string);
    let hidden = (edge.title.is_some() && edge.title_hidden).then_some(JsonValue::Bool(true));
    object([
        ("from", Some(string(edge.from.as_str()))),
        ("to", Some(string(edge.to.as_str()))),
        ("title", title),
        ("titleHidden", hidden),
    ])
}

fn graph(graph: &Graph) -> JsonValue {
    object([
        ("id", Some(string(graph.id.as_str()))),
        ("title", Some(string(&graph.title))),
        ("color", graph.color.as_deref().map(string)),
        (
            "headShape",
            graph.head_shape.map(|shape| string(shape.as_str())),
        ),
        (
            "edges",
            Some(JsonValue::Array(graph.edges.iter().map(edge).collect())),
        ),
    ])
}

fn placement(at: &Placement, order: Order) -> JsonValue {
    object([
        ("x", Some(JsonValue::Number(at.x))),
        ("y", Some(JsonValue::Number(at.y))),
        (
            "size",
            at.size.map(|size| {
                object([
                    ("width", Some(JsonValue::Number(size.width))),
                    ("height", Some(JsonValue::Number(size.height))),
                ])
            }),
        ),
        (
            "editSize",
            at.edit_size.map(|size| {
                object([
                    ("width", Some(JsonValue::Number(size.width))),
                    ("height", Some(JsonValue::Number(size.height))),
                ])
            }),
        ),
        (
            "content",
            at.content.as_ref().map(|content| order.value(content)),
        ),
    ])
}

/// A Map; its positions sorted by Resource id for Export, and as written on
/// the wire (a Resource id is a UUID, never an array index, so a JavaScript
/// object keeps them as written).
fn map(map: &Map, order: Order) -> JsonValue {
    let mut positions: Vec<&(intake::ResourceId, Placement)> = map.positions.iter().collect();
    if order == Order::Export {
        positions.sort_by(|(left, _), (right, _)| compare_utf16(left.as_str(), right.as_str()));
    }
    object([
        ("id", Some(string(map.id.as_str()))),
        ("title", Some(string(&map.title))),
        ("kind", Some(string(map.kind.as_str()))),
        (
            "positions",
            Some(JsonValue::Object(
                positions
                    .into_iter()
                    .map(|(id, at)| (id.as_str().to_owned(), placement(at, order)))
                    .collect(),
            )),
        ),
        (
            "graphs",
            Some(JsonValue::Array(map.graphs.iter().map(graph).collect())),
        ),
        (
            "activeGraph",
            map.active_graph.map(|id| string(id.as_str())),
        ),
    ])
}

/// The space document: `space.json` for Export, and less its `id` on the wire.
fn space_document(snapshot: &SpaceSnapshot, order: Order) -> JsonValue {
    let with_id = order == Order::Export;
    let document = &snapshot.document;
    object([
        ("version", Some(JsonValue::Number(DOCUMENT_VERSION))),
        ("id", with_id.then(|| string(snapshot.id.as_str()))),
        ("title", Some(string(&document.title))),
        (
            "maps",
            document
                .maps
                .as_ref()
                .map(|maps| JsonValue::Array(maps.iter().map(|one| map(one, order)).collect())),
        ),
        (
            "defaultMap",
            document.default_map.map(|id| string(id.as_str())),
        ),
    ])
}

/// `space.json` as Export writes it.
pub(crate) fn space_file(snapshot: &SpaceSnapshot) -> JsonValue {
    space_document(snapshot, Order::Export)
}

/// The space document as a snapshot carries it, with no `id`.
pub(crate) fn wire_space_document(snapshot: &SpaceSnapshot) -> JsonValue {
    space_document(snapshot, Order::Wire)
}

/// The snapshot the HTTP application answers and a commit carries:
/// `{ id, document, resources: [{ id, document }] }`.
pub(crate) fn wire_snapshot(snapshot: &SpaceSnapshot) -> JsonValue {
    object([
        ("id", Some(string(snapshot.id.as_str()))),
        ("document", Some(wire_space_document(snapshot))),
        (
            "resources",
            Some(JsonValue::Array(
                snapshot.resources.iter().map(wire_resource).collect(),
            )),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json_text::compact;
    use intake::json::parse;

    mod given_unread_keys {
        use super::*;

        #[test]
        fn orders_them_as_a_javascript_object_lists_them() {
            let value =
                parse(r#"{"b":1,"10":2,"a":{"z":0,"y":0},"2":3,"02":4,"":5,"😀":6}"#).unwrap();
            assert_eq!(
                compact(&canonical_value(&value)),
                "{\"2\":3,\"10\":2,\"02\":4,\"a\":{\"y\":0,\"z\":0},\"b\":1,\"😀\":6,\"\u{e000}\":5}",
                "array-index keys first and ascending, then code unit order at every depth"
            );
        }

        #[test]
        fn keeps_them_on_the_wire_in_javascript_object_order() {
            let value = parse(r#"{"b":1,"10":2,"a":{"z":0,"y":0},"2":3,"02":4,"":5}"#).unwrap();
            assert_eq!(
                compact(&javascript_value(&value)),
                r#"{"2":3,"10":2,"b":1,"a":{"z":0,"y":0},"02":4,"":5}"#,
                "array-index keys first and ascending, then as first written, at every depth"
            );
        }
    }
}
