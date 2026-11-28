//! The intake conformance corpus (ADR 0156): every directory case under
//! `conformance/intake/directory/`, imported as `cube check` does and its
//! answer compared with the case's `expect`, refusals as a multiset of
//! (kind, file, id, field, edge). An accepted case's read model is compared
//! with the files Export records for it, as JSON values: what each Space,
//! Map, placement, Graph, Edge and Resource holds, and each asset's bytes.
//! The bytes Export writes, and the commit cases, need the host (issue 11).

#![allow(
    clippy::unwrap_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use intake::json::JsonValue;
use intake::{
    AggregateFiles, Edge, Graph, ImportedAggregate, Map, Placement, Refusal, RefusalKind, Resource,
    Space, import_aggregate,
};
use serde_json::Value;

fn corpus() -> PathBuf {
    PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../conformance/intake"
    ))
}

/// One refusal's five keys, an absent key `None`.
type Located = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<(String, String)>,
);

/// Every file below `root`, by path relative to it with `/` between segments.
fn read_tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                let relative = path
                    .strip_prefix(root)
                    .unwrap()
                    .components()
                    .map(|part| part.as_os_str().to_str().unwrap())
                    .collect::<Vec<_>>()
                    .join("/");
                files.insert(relative, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(root, root, &mut files);
    files
}

fn located(refusal: &Refusal) -> Located {
    (
        refusal.kind().as_str().to_owned(),
        refusal.file().into_owned(),
        refusal.id().map(|id| id.as_str().to_owned()),
        refusal.field().map(|field| field.into_owned()),
        refusal
            .edge()
            .map(|edge| (edge.from.as_str().to_owned(), edge.to.as_str().to_owned())),
    )
}

fn expected(refusal: &Value) -> Located {
    let text = |key: &str| {
        refusal
            .get(key)
            .map(|value| value.as_str().unwrap().to_owned())
    };
    (
        text("kind").unwrap(),
        text("file").unwrap(),
        text("id"),
        text("field"),
        refusal.get("edge").map(|edge| {
            (
                edge["from"].as_str().unwrap().to_owned(),
                edge["to"].as_str().unwrap().to_owned(),
            )
        }),
    )
}

/// A multiset: each refusal and how many times it appears.
fn multiset(refusals: impl IntoIterator<Item = Located>) -> BTreeMap<Located, usize> {
    let mut counts = BTreeMap::new();
    for refusal in refusals {
        *counts.entry(refusal).or_insert(0) += 1;
    }
    counts
}

/// The answer a case expects and the one intake gave, when they differ.
fn disagreement(case: &Path) -> Option<String> {
    let description: Value =
        serde_json::from_slice(&fs::read(case.join("case.json")).unwrap()).unwrap();
    let expect = &description["expect"];
    let want = match expect["outcome"].as_str().unwrap() {
        "accepted" => None,
        "refused" => Some(multiset(
            expect["refusals"].as_array().unwrap().iter().map(expected),
        )),
        other => panic!("unknown outcome {other}"),
    };
    let files: AggregateFiles = read_tree(&case.join("aggregate")).into_iter().collect();
    let got = match import_aggregate(files, || {
        panic!(
            "{}: intake minted an id the case writes down",
            case.display()
        )
    }) {
        Ok(imported) => {
            if want.is_none() {
                let recorded = if case.join("export").is_dir() {
                    case.join("export")
                } else {
                    case.join("aggregate")
                };
                let differences = read_model_differences(&imported, &recorded);
                if !differences.is_empty() {
                    return Some(differences.join("\n"));
                }
            }
            None
        }
        Err(refusals) => Some(multiset(refusals.as_slice().iter().map(located))),
    };
    (want != got).then(|| format!("expected {want:#?}\ngot {got:#?}"))
}

/// A JSON value with every number as the double it holds, so `0` and `0.0`
/// compare equal; objects compare as maps.
fn normalized(value: Value) -> Value {
    match value {
        Value::Number(number) => Value::from(number.as_f64().unwrap()),
        Value::Array(items) => Value::Array(items.into_iter().map(normalized).collect()),
        Value::Object(entries) => Value::Object(
            entries
                .into_iter()
                .map(|(key, value)| (key, normalized(value)))
                .collect(),
        ),
        other => other,
    }
}

fn from_intake(value: &JsonValue) -> Value {
    match value {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(flag) => Value::Bool(*flag),
        JsonValue::Number(number) => Value::from(*number),
        JsonValue::String(text) => Value::String(text.clone()),
        JsonValue::Array(items) => Value::Array(items.iter().map(from_intake).collect()),
        JsonValue::Object(entries) => Value::Object(
            entries
                .iter()
                .map(|(key, value)| (key.to_owned(), from_intake(value)))
                .collect(),
        ),
    }
}

/// The members of `entries` that are present, as a JSON object.
fn object(entries: Vec<(&str, Option<Value>)>) -> Value {
    Value::Object(
        entries
            .into_iter()
            .filter_map(|(key, value)| value.map(|value| (key.to_owned(), value)))
            .collect(),
    )
}

fn space_json(space: &Space) -> Value {
    let document = &space.snapshot().document;
    object(vec![
        ("version", Some(Value::from(1.0))),
        ("id", Some(space.id().as_str().into())),
        ("title", Some(document.title.clone().into())),
        (
            "maps",
            document
                .maps
                .as_ref()
                .map(|maps| maps.iter().map(map_json).collect()),
        ),
        (
            "defaultMap",
            document.default_map.map(|id| id.as_str().into()),
        ),
    ])
}

fn map_json(map: &Map) -> Value {
    object(vec![
        ("id", Some(map.id.as_str().into())),
        ("title", Some(map.title.clone().into())),
        ("kind", Some(map.kind.as_str().into())),
        (
            "positions",
            Some(Value::Object(
                map.positions
                    .iter()
                    .map(|(id, placement)| (id.as_str().to_owned(), placement_json(placement)))
                    .collect(),
            )),
        ),
        ("graphs", Some(map.graphs.iter().map(graph_json).collect())),
        ("activeGraph", map.active_graph.map(|id| id.as_str().into())),
    ])
}

fn placement_json(placement: &Placement) -> Value {
    object(vec![
        ("x", Some(placement.x.into())),
        ("y", Some(placement.y.into())),
        (
            "size",
            placement.size.map(|size| {
                object(vec![
                    ("width", Some(size.width.into())),
                    ("height", Some(size.height.into())),
                ])
            }),
        ),
        (
            "editSize",
            placement.edit_size.map(|size| {
                object(vec![
                    ("width", Some(size.width.into())),
                    ("height", Some(size.height.into())),
                ])
            }),
        ),
        ("content", placement.content.as_ref().map(from_intake)),
    ])
}

fn graph_json(graph: &Graph) -> Value {
    object(vec![
        ("id", Some(graph.id.as_str().into())),
        ("title", Some(graph.title.clone().into())),
        ("color", graph.color.clone().map(Value::from)),
        (
            "headShape",
            graph.head_shape.map(|shape| shape.as_str().into()),
        ),
        ("edges", Some(graph.edges.iter().map(edge_json).collect())),
    ])
}

fn edge_json(edge: &Edge) -> Value {
    object(vec![
        ("from", Some(edge.from.as_str().into())),
        ("to", Some(edge.to.as_str().into())),
        ("title", edge.title.clone().map(Value::from)),
        (
            "titleHidden",
            edge.title_hidden.then_some(Value::Bool(true)),
        ),
    ])
}

fn resource_json(resource: &Resource) -> Value {
    object(vec![
        ("id", Some(resource.id.as_str().into())),
        ("title", Some(resource.title.clone().into())),
        ("kind", Some(resource.kind.as_str().into())),
        ("content", Some(from_intake(&resource.content))),
    ])
}

/// Where what intake read differs from the files `recorded` holds: each Space
/// directory's `space.json` and Resource files, and each asset's bytes.
fn read_model_differences(imported: &ImportedAggregate, recorded: &Path) -> Vec<String> {
    let files = read_tree(recorded);
    let mut expected: BTreeMap<String, Value> = BTreeMap::new();
    let mut expected_assets: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    for (path, bytes) in &files {
        if let Some(name) = path.strip_prefix("assets/") {
            expected_assets.insert(name.split('.').next().unwrap().to_owned(), bytes.clone());
        } else if path != "aggregate.json" {
            expected.insert(
                path.clone(),
                normalized(serde_json::from_slice(bytes).unwrap()),
            );
        }
    }
    let mut read: BTreeMap<String, Value> = BTreeMap::new();
    for space in imported.aggregate.spaces() {
        let id = space.id();
        read.insert(format!("{id}/space.json"), normalized(space_json(space)));
        for resource in &space.snapshot().resources {
            read.insert(
                format!("{id}/resources/{}.json", resource.id),
                normalized(resource_json(resource)),
            );
        }
    }
    let read_assets: BTreeMap<String, Vec<u8>> = imported
        .assets
        .iter()
        .map(|asset| (asset.hash.clone(), asset.bytes.clone()))
        .collect();
    let mut differences = Vec::new();
    for path in expected
        .keys()
        .chain(read.keys())
        .collect::<std::collections::BTreeSet<_>>()
    {
        if expected.get(path) != read.get(path) {
            differences.push(format!(
                "{path}: recorded {:#?}\nread {:#?}",
                expected.get(path),
                read.get(path)
            ));
        }
    }
    if expected_assets != read_assets {
        differences.push(format!(
            "assets: recorded {:?}, read {:?}",
            expected_assets.keys().collect::<Vec<_>>(),
            read_assets.keys().collect::<Vec<_>>()
        ));
    }
    differences
}

fn directory_cases() -> Vec<(String, PathBuf)> {
    let mut cases: Vec<(String, PathBuf)> = fs::read_dir(corpus().join("directory"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.is_dir())
        .map(|path| (path.file_name().unwrap().to_str().unwrap().to_owned(), path))
        .collect();
    cases.sort();
    cases
}

#[test]
fn every_directory_case_gets_its_expected_answer() {
    let cases = directory_cases();
    assert!(!cases.is_empty(), "the corpus should hold directory cases");
    let mut failures = Vec::new();
    for (name, path) in &cases {
        if let Some(difference) = disagreement(path) {
            failures.push(format!("{name}:\n{difference}"));
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {} directory cases disagree:\n\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n\n")
    );
}

#[test]
fn refusal_kinds_are_the_readme_list_in_its_order() {
    let readme = fs::read_to_string(corpus().join("README.md")).unwrap();
    let table = readme
        .split("## Refusal kinds")
        .nth(1)
        .unwrap()
        .split("\n## ")
        .next()
        .unwrap();
    let listed: Vec<&str> = table
        .lines()
        .filter_map(|line| line.strip_prefix("| `"))
        .filter_map(|line| line.split('`').next())
        .collect();
    let ours: Vec<&str> = RefusalKind::ALL.iter().map(|kind| kind.as_str()).collect();
    assert_eq!(
        ours, listed,
        "RefusalKind::ALL should be the README's closed list, in order"
    );
}
