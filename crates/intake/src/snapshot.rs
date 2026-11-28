//! A stored Space snapshot decoded from JSON, as the HTTP application decodes
//! one a commit carries (`decodeSnapshot`): its shape only, each fault an
//! `invalid-shape` refusal located in the Space directory of the change.

use crate::ids::SpaceId;
use crate::json::{JsonObject, JsonValue};
use crate::model::{
    DOCUMENT_VERSION, Edge, Graph, Map, Placement, Resource, Size, SpaceDocument, SpaceSnapshot,
};
use crate::refusal::{Refusal, Refusals, ShapeProblem};
use crate::schema::{locate_snapshot_issue, space_snapshot};

/// Decode a snapshot `{ id, document, resources: [{ id, document }] }`.
///
/// Its document is held to the strict space document (no `id`, every Map and
/// Graph id present) and each Resource document to the Resource envelope,
/// unknown envelope keys stripped. What the snapshot's references say is not
/// asked here: [`crate::load_aggregate`] asks it of the candidate aggregate.
///
/// # Errors
///
/// Returns one [`Refusal::InvalidShape`] per fault, its file inside the
/// directory of `directory`, the Space the change names: `space.json` for the
/// snapshot's `id` and `document`, and `resources/<id>.json` for a Resource,
/// named by its position, `resources/[<index>].json`, where its id is not a string.
pub fn decode_space_snapshot(
    json: &JsonValue,
    directory: SpaceId,
) -> Result<SpaceSnapshot, Refusals> {
    space_snapshot(json).map_err(|issues| {
        let refusals = issues
            .into_iter()
            .map(|issue| {
                let (file, field) = locate_snapshot_issue(json, issue.field.as_deref());
                Refusal::InvalidShape {
                    file: format!("{directory}/{file}"),
                    field,
                    problem: issue.problem,
                }
            })
            .collect();
        Refusals::new(refusals).unwrap_or_else(|| {
            Refusals::from_one(Refusal::InvalidShape {
                file: format!("{directory}/space.json"),
                field: None,
                problem: crate::refusal::ShapeProblem::Custom("is not a Space snapshot"),
            })
        })
    })
}

/// A typed snapshot held to the stored snapshot's shape, as
/// `loadSpaceSnapshot` holds whatever it is given: written as the JSON it
/// stands for and decoded again, so a snapshot a host built in memory earns
/// the refusals the same snapshot as JSON would, and answers as its decoding
/// normalizes it (a Title, for one). A Map placing one Resource twice, which
/// JSON cannot write, is refused at that placement.
pub(crate) fn checked_shape(snapshot: &SpaceSnapshot) -> Result<SpaceSnapshot, Refusals> {
    let file = format!("{}/space.json", snapshot.id);
    let repeated: Vec<Refusal> = snapshot
        .document
        .maps
        .iter()
        .flatten()
        .enumerate()
        .flat_map(|(index, map)| {
            crate::space::repeated(map.positions.iter().map(|(id, _)| *id))
                .into_iter()
                .map(move |id| (index, id))
        })
        .map(|(index, id)| Refusal::InvalidShape {
            file: file.clone(),
            field: Some(format!("maps.{index}.positions.{id}")),
            problem: ShapeProblem::Custom("places one Resource more than once"),
        })
        .collect();
    match decode_space_snapshot(&snapshot_json(snapshot), snapshot.id) {
        Ok(decoded) => Refusals::check(repeated).map(|()| decoded),
        Err(decoding) => Err(
            Refusals::new(repeated.into_iter().chain(decoding).collect())
                .unwrap_or_else(|| decoding_fallback(&file)),
        ),
    }
}

fn decoding_fallback(file: &str) -> Refusals {
    Refusals::from_one(Refusal::InvalidShape {
        file: file.to_owned(),
        field: None,
        problem: ShapeProblem::Custom("is not a Space snapshot"),
    })
}

fn object<const N: usize>(entries: [(&str, Option<JsonValue>); N]) -> JsonValue {
    JsonValue::Object(
        entries
            .into_iter()
            .filter_map(|(key, value)| value.map(|value| (key.to_owned(), value)))
            .collect(),
    )
}

fn string(text: &str) -> Option<JsonValue> {
    Some(JsonValue::String(text.to_owned()))
}

/// The stored snapshot `{ id, document, resources: [{ id, document }] }` a
/// typed snapshot stands for.
fn snapshot_json(snapshot: &SpaceSnapshot) -> JsonValue {
    object([
        ("id", string(snapshot.id.as_str())),
        ("document", Some(document_json(&snapshot.document))),
        (
            "resources",
            Some(JsonValue::Array(
                snapshot.resources.iter().map(resource_json).collect(),
            )),
        ),
    ])
}

fn document_json(document: &SpaceDocument) -> JsonValue {
    object([
        ("version", Some(JsonValue::Number(DOCUMENT_VERSION))),
        ("title", string(&document.title)),
        (
            "maps",
            document
                .maps
                .as_ref()
                .map(|maps| JsonValue::Array(maps.iter().map(map_json).collect())),
        ),
        (
            "defaultMap",
            document.default_map.and_then(|id| string(id.as_str())),
        ),
    ])
}

fn resource_json(resource: &Resource) -> JsonValue {
    object([
        ("id", string(resource.id.as_str())),
        (
            "document",
            Some(object([
                ("title", string(&resource.title)),
                ("kind", string(resource.kind.as_str())),
                ("content", Some(resource.content.clone())),
            ])),
        ),
    ])
}

fn map_json(map: &Map) -> JsonValue {
    let positions: JsonObject = map
        .positions
        .iter()
        .map(|(id, placement)| (id.as_str().to_owned(), placement_json(placement)))
        .collect();
    object([
        ("id", string(map.id.as_str())),
        ("title", string(&map.title)),
        ("kind", string(map.kind.as_str())),
        ("positions", Some(JsonValue::Object(positions))),
        (
            "graphs",
            Some(JsonValue::Array(
                map.graphs.iter().map(graph_json).collect(),
            )),
        ),
        (
            "activeGraph",
            map.active_graph.and_then(|id| string(id.as_str())),
        ),
    ])
}

/// A size, its width before its height.
fn size_json(size: Size) -> JsonValue {
    object([
        ("width", Some(JsonValue::Number(size.width))),
        ("height", Some(JsonValue::Number(size.height))),
    ])
}

fn placement_json(placement: &Placement) -> JsonValue {
    object([
        ("x", Some(JsonValue::Number(placement.x))),
        ("y", Some(JsonValue::Number(placement.y))),
        ("size", placement.size.map(size_json)),
        ("editSize", placement.edit_size.map(size_json)),
        ("content", placement.content.clone()),
    ])
}

fn graph_json(graph: &Graph) -> JsonValue {
    object([
        ("id", string(graph.id.as_str())),
        ("title", string(&graph.title)),
        ("color", graph.color.as_deref().and_then(string)),
        (
            "headShape",
            graph.head_shape.and_then(|shape| string(shape.as_str())),
        ),
        (
            "edges",
            Some(JsonValue::Array(
                graph.edges.iter().map(edge_json).collect(),
            )),
        ),
    ])
}

fn edge_json(edge: &Edge) -> JsonValue {
    object([
        ("from", string(edge.from.as_str())),
        ("to", string(edge.to.as_str())),
        ("title", edge.title.as_deref().and_then(string)),
        (
            "titleHidden",
            edge.title_hidden.then_some(JsonValue::Bool(true)),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn located(json: &str) -> Vec<(String, Option<String>)> {
        let directory = SpaceId::parse("10000000-0000-4000-8000-000000000001").unwrap();
        let mut located: Vec<_> = decode_space_snapshot(&parse(json).unwrap(), directory)
            .expect_err("the snapshot should be refused")
            .into_iter()
            .map(|refusal| {
                (
                    refusal.file().into_owned(),
                    refusal.field().map(|f| f.into_owned()),
                )
            })
            .collect();
        located.sort();
        located
    }

    mod given_a_whole_snapshot {
        use super::*;

        #[test]
        fn decodes_a_whole_snapshot() {
            let json = parse(
                r#"{"id": "10000000-0000-4000-8000-000000000001",
                    "document": {"version": 1, "title": "Space"},
                    "resources": [{"id": "00000000-0000-4000-8000-000000000101",
                                   "document": {"title": "A", "kind": "ur", "content": {}, "stripped": 1}}]}"#,
            )
            .unwrap();
            let directory = SpaceId::parse("10000000-0000-4000-8000-000000000001").unwrap();
            let snapshot = decode_space_snapshot(&json, directory).expect("the snapshot decodes");
            assert_eq!(
                snapshot.resources.len(),
                1,
                "its Resource, its unknown key stripped"
            );
        }
    }

    mod given_faults_in_the_space_directory {
        use super::*;

        #[test]
        fn locates_each_fault_in_the_space_directory() {
            let d = "10000000-0000-4000-8000-000000000001";
            assert_eq!(
                located(
                    r#"{"id": "10000000-0000-4000-8000-000000000001",
                        "document": {"version": 1, "title": "", "id": "x"},
                        "resources": [{"id": "00000000-0000-4000-8000-000000000101",
                                       "document": {"title": "A", "kind": "ur", "content": {"x": 1}}},
                                      {"id": 7, "document": {"title": "B", "kind": "reference", "content": {"target": "no"}}}]}"#
                ),
                vec![
                    (
                        format!("{d}/resources/00000000-0000-4000-8000-000000000101.json"),
                        Some("content".into())
                    ),
                    (
                        format!("{d}/resources/[1].json"),
                        Some("content.target".into())
                    ),
                    (format!("{d}/resources/[1].json"), Some("id".into())),
                    (format!("{d}/space.json"), None),
                    (format!("{d}/space.json"), Some("title".into())),
                ],
                "the snapshot's document is space.json, each Resource its own file"
            );
        }
    }

    mod given_a_fault_in_resources_itself {
        use super::*;

        #[test]
        fn locates_it_at_the_resources_directory() {
            let d = "10000000-0000-4000-8000-000000000001";
            assert_eq!(
                located(
                    r#"{"id": "10000000-0000-4000-8000-000000000001",
                        "document": {"version": 1, "title": "Space"},
                        "resources": 7}"#
                ),
                vec![(format!("{d}/resources"), None)],
                "no one Resource file is at fault, so the directory is named"
            );
        }
    }
}
