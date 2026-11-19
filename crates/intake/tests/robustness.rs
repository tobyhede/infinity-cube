//! Properties over arbitrary input: intake answers every byte string without
//! panicking, its JSON parser reads what `serde_json` writes as the value
//! written, and a file nested to the depth limit is imported on the smallest
//! stack a host gives intake.

#![allow(
    clippy::unwrap_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use intake::json::{self, JsonValue};
use intake::{AggregateFiles, import_aggregate};
use proptest::prelude::*;

const META: &str = "10000000-0000-4000-8000-000000000001";

/// Any JSON value `serde_json` can write: finite numbers, any strings, nested
/// a few levels deep.
fn any_json() -> impl Strategy<Value = serde_json::Value> {
    let leaf = prop_oneof![
        Just(serde_json::Value::Null),
        any::<bool>().prop_map(serde_json::Value::Bool),
        any::<i64>().prop_map(serde_json::Value::from),
        any::<f64>()
            .prop_filter("JSON holds finite numbers", |n| n.is_finite())
            .prop_map(serde_json::Value::from),
        any::<String>().prop_map(serde_json::Value::String),
    ];
    leaf.prop_recursive(4, 64, 8, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..8).prop_map(serde_json::Value::Array),
            prop::collection::btree_map(any::<String>(), inner, 0..8)
                .prop_map(|map| serde_json::Value::Object(map.into_iter().collect())),
        ]
    })
}

/// Whether intake's reading equals the value `serde_json` wrote: every number
/// as the double it holds, and an object's keys compared as a set.
fn same(read: &JsonValue, written: &serde_json::Value) -> bool {
    match (read, written) {
        (JsonValue::Null, serde_json::Value::Null) => true,
        (JsonValue::Bool(left), serde_json::Value::Bool(right)) => left == right,
        (JsonValue::Number(left), serde_json::Value::Number(right)) => {
            right.as_f64().is_some_and(|right| *left == right)
        }
        (JsonValue::String(left), serde_json::Value::String(right)) => left == right,
        (JsonValue::Array(left), serde_json::Value::Array(right)) => {
            left.len() == right.len() && left.iter().zip(right).all(|(l, r)| same(l, r))
        }
        (JsonValue::Object(left), serde_json::Value::Object(right)) => {
            left.len() == right.len()
                && right
                    .iter()
                    .all(|(key, value)| left.get(key).is_some_and(|read| same(read, value)))
        }
        _ => false,
    }
}

proptest! {
    #[test]
    fn parses_any_text_without_panicking(text in any::<String>()) {
        let _ = json::parse(&text);
    }

    #[test]
    fn decodes_and_parses_any_bytes_without_panicking(bytes in prop::collection::vec(any::<u8>(), 0..256)) {
        let _ = json::parse(&json::decode_text(&bytes));
    }

    #[test]
    fn reads_what_serde_json_writes_as_the_value_written(value in any_json()) {
        let text = serde_json::to_string(&value).unwrap();
        let read = json::parse(&text);
        prop_assert!(read.is_ok(), "{text} should parse: {read:?}");
        prop_assert!(same(&read.unwrap(), &value), "{text} should read as written");
    }

    #[test]
    fn reads_what_serde_json_pretty_prints_as_the_value_written(value in any_json()) {
        let text = serde_json::to_string_pretty(&value).unwrap();
        let read = json::parse(&text);
        prop_assert!(read.is_ok(), "{text} should parse: {read:?}");
        prop_assert!(same(&read.unwrap(), &value), "{text} should read as written");
    }

    #[test]
    fn imports_any_file_bytes_without_panicking(
        aggregate in prop::collection::vec(any::<u8>(), 0..128),
        space in prop::collection::vec(any::<u8>(), 0..128),
        resource in prop::collection::vec(any::<u8>(), 0..128),
    ) {
        let mut files = AggregateFiles::new();
        files.insert_file("aggregate.json", aggregate);
        files.insert_file(format!("{META}/space.json"), space);
        files.insert_file(format!("{META}/resources/r.json"), resource);
        let _ = import_aggregate(files, || intake::Uuid::parse(META).unwrap());
    }

    #[test]
    fn imports_any_json_in_each_file_without_panicking(
        space in any_json(),
        resource in any_json(),
    ) {
        let mut files = AggregateFiles::new();
        files.insert_file("aggregate.json", format!(r#"{{"version": 1, "metaSpaceId": "{META}"}}"#));
        files.insert_file(format!("{META}/space.json"), serde_json::to_vec(&space).unwrap());
        files.insert_file(format!("{META}/resources/r.json"), serde_json::to_vec(&resource).unwrap());
        let _ = import_aggregate(files, || intake::Uuid::parse(META).unwrap());
    }
}

/// The stack a host's intake is given at the least: half the 2 MiB a tokio
/// worker thread has by default.
const SMALLEST_STACK: usize = 1024 * 1024;

/// An aggregate whose one Resource, of a kind no listed plugin draws, carries
/// content nested so its file's deepest object is `depth` levels down.
fn nested_resource(depth: usize) -> AggregateFiles {
    const RESOURCE: &str = "00000000-0000-4000-8000-000000000101";
    // The file's root object is one level, its content the second.
    let inner = depth - 1;
    let content = format!(
        "{}{}",
        r#"{"a":"#.repeat(inner - 1) + "{}",
        "}".repeat(inner - 1)
    );
    let mut files = AggregateFiles::new();
    files.insert_file(
        "aggregate.json",
        format!(r#"{{"version": 1, "metaSpaceId": "{META}"}}"#),
    );
    files.insert_file(
        format!("{META}/space.json"),
        format!(r#"{{"version": 1, "id": "{META}", "title": "Talk"}}"#),
    );
    files.insert_file(
        format!("{META}/resources/{RESOURCE}.json"),
        format!(
            r#"{{"id": "{RESOURCE}", "title": "Deep", "kind": "vnd.acme.deep", "content": {content}}}"#
        ),
    );
    files
}

/// Import `files`, and clone, compare and drop what it answers, on a thread
/// with [`SMALLEST_STACK`]; the kinds of the refusals, if refused.
fn import_on_the_smallest_stack(files: AggregateFiles) -> Result<(), Vec<String>> {
    std::thread::Builder::new()
        .stack_size(SMALLEST_STACK)
        .spawn(move || {
            let imported = import_aggregate(files, || panic!("every id is written down"));
            let copy = imported.clone();
            assert_eq!(copy, imported, "a clone equals what it copies");
            drop(copy);
            imported.map(|_| ()).map_err(|refusals| {
                refusals
                    .into_iter()
                    .map(|refusal| refusal.kind().as_str().to_owned())
                    .collect()
            })
        })
        .unwrap()
        .join()
        .unwrap()
}

#[test]
fn imports_content_nested_to_the_limit_on_the_smallest_stack() {
    assert_eq!(
        import_on_the_smallest_stack(nested_resource(json::MAX_DEPTH)),
        Ok(()),
        "content as deep as the limit allows is carried"
    );
}

#[test]
fn refuses_content_nested_past_the_limit_on_the_smallest_stack() {
    assert_eq!(
        import_on_the_smallest_stack(nested_resource(json::MAX_DEPTH + 1)),
        Err(vec!["invalid-json".to_owned()]),
        "one level more is refused, not read"
    );
}
