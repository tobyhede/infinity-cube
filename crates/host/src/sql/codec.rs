//! A stored Space as rows of the shape the TypeScript SQL repository writes
//! and reads (`src/persistence/sql-space-repository.ts`): the space document
//! and each Resource document as JSON text, and revisions as canonical
//! decimal text (`encodeStoredRevision`).

use std::collections::HashMap;

use intake::json::{JsonObject, JsonValue, parse};
use intake::{SpaceId, SpaceSnapshot, decode_space_snapshot, load_space};

use crate::document::{wire_resource_document, wire_space_document};
use crate::json_text::compact;
use crate::repository::{LoadedSpace, Revision};

/// A row of `spaces`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SpaceRow {
    pub(crate) id: String,
    pub(crate) document: String,
    pub(crate) revision: String,
    pub(crate) exported_revision: Option<String>,
}

/// A row of `resources`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResourceRow {
    pub(crate) id: String,
    pub(crate) space_id: String,
    pub(crate) document: String,
}

/// A revision as stored: canonical decimal text.
pub(crate) fn encode_revision(revision: Revision) -> String {
    revision.get().to_string()
}

/// A stored revision, if it is canonical decimal text no higher than the
/// ceiling (`decodeStoredRevision`).
pub(crate) fn decode_revision(text: &str) -> Option<Revision> {
    let canonical = text == "0"
        || (!text.starts_with('0') && !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()));
    canonical
        .then(|| text.parse::<u64>().ok())
        .flatten()
        .and_then(Revision::new)
}

/// A Space as its rows: the space row, and one row per Resource in the
/// snapshot's order, each document as the snapshot carries it.
pub(crate) fn encode_space(space: &LoadedSpace) -> (SpaceRow, Vec<ResourceRow>) {
    let id = space.snapshot.id.as_str();
    let resources = space
        .snapshot
        .resources
        .iter()
        .map(|resource| ResourceRow {
            id: resource.id.as_str().to_owned(),
            space_id: id.to_owned(),
            document: compact(&wire_resource_document(resource)),
        })
        .collect();
    let row = SpaceRow {
        id: id.to_owned(),
        document: compact(&wire_space_document(&space.snapshot)),
        revision: encode_revision(space.revision),
        exported_revision: space.exported_revision.map(encode_revision),
    };
    (row, resources)
}

/// Whether two stored documents hold the same JSON, an object's keys in any
/// order, as `isDeepStrictEqual` compares the documents `#writeUpdate` reads.
/// Text that does not parse holds no document another can equal.
pub(crate) fn same_document(left: &str, right: &str) -> bool {
    match (parse(left), parse(right)) {
        (Ok(left), Ok(right)) => same_json(&left, &right),
        _ => false,
    }
}

fn same_json(left: &JsonValue, right: &JsonValue) -> bool {
    match (left, right) {
        (JsonValue::Object(left), JsonValue::Object(right)) => {
            // Indexed once, so an object of many keys compares in linear time:
            // `JsonObject::get` scans its entries.
            let right: HashMap<&str, &JsonValue> = right.iter().collect();
            left.len() == right.len()
                && left
                    .iter()
                    .all(|(key, value)| right.get(key).is_some_and(|other| same_json(value, other)))
        }
        (JsonValue::Array(left), JsonValue::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right)
                    .all(|(value, other)| same_json(value, other))
        }
        _ => left == right,
    }
}

/// The title a stored space document carries, if it is JSON holding a string
/// `title`. Only the title is read: a Space whose document fails intake is
/// listed beside the others, and fails when it is opened (`tests/sqlite.rs` ›
/// `lists_a_broken_space_beside_the_others`).
pub(crate) fn decode_title(row: &SpaceRow) -> Option<String> {
    parse(&row.document)
        .ok()?
        .as_object()?
        .get("title")?
        .as_str()
        .map(str::to_owned)
}

/// A stored Space from its rows, through the one Space intake
/// (`loadSpaceSnapshot`), or why it cannot be read.
pub(crate) fn decode_space(
    row: &SpaceRow,
    resources: &[&ResourceRow],
) -> Result<LoadedSpace, String> {
    let broken = |what: &str| format!("stored Space {} {what}", row.id);
    let id = SpaceId::parse(&row.id).ok_or_else(|| broken("has an id that is not a UUID"))?;
    let parsed = |text: &str| parse(text).map_err(|_| broken("holds a document that is not JSON"));
    let resources = resources
        .iter()
        .map(|resource| {
            Ok(JsonValue::Object(JsonObject::from_iter([
                ("id".to_owned(), JsonValue::String(resource.id.clone())),
                ("document".to_owned(), parsed(&resource.document)?),
            ])))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let json = JsonValue::Object(JsonObject::from_iter([
        ("id".to_owned(), JsonValue::String(row.id.clone())),
        ("document".to_owned(), parsed(&row.document)?),
        ("resources".to_owned(), JsonValue::Array(resources)),
    ]));
    let snapshot: SpaceSnapshot = decode_space_snapshot(&json, id)
        .and_then(load_space)
        .map(intake::Space::into_snapshot)
        .map_err(|refusals| broken(&format!("fails intake: {refusals}")))?;
    let revision = decode_revision(&row.revision)
        .ok_or_else(|| broken("has a revision that is not canonical"))?;
    let exported_revision = match &row.exported_revision {
        None => None,
        Some(text) => Some(
            decode_revision(text)
                .ok_or_else(|| broken("has an exported revision that is not canonical"))?,
        ),
    };
    Ok(LoadedSpace {
        snapshot,
        revision,
        exported_revision,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_two_stored_documents {
        use super::*;

        #[test]
        fn are_the_same_whatever_order_an_object_s_keys_are_in() {
            assert!(
                same_document(
                    r#"{"a":1,"b":{"c":[1,{"d":2,"e":3}]}}"#,
                    r#"{"b":{"c":[1,{"e":3,"d":2}]},"a":1}"#
                ),
                "keys in another order"
            );
        }

        #[test]
        fn differ_by_a_value_a_key_or_an_array_s_order() {
            for (left, right) in [
                (r#"{"a":1}"#, r#"{"a":2}"#),
                (r#"{"a":1}"#, r#"{"b":1}"#),
                (r#"{"a":1}"#, r#"{"a":1,"b":1}"#),
                ("[1,2]", "[2,1]"),
                ("not json", "not json"),
            ] {
                assert!(!same_document(left, right), "{left} and {right}");
            }
        }
    }

    mod given_stored_revision_text {
        use super::*;

        #[test]
        fn reads_canonical_decimal_up_to_the_ceiling() {
            assert_eq!(decode_revision("0"), Some(Revision::FIRST), "zero");
            assert_eq!(decode_revision("12").map(Revision::get), Some(12), "twelve");
            assert_eq!(
                decode_revision("9223372036854775807").map(Revision::get),
                Some(Revision::CEILING),
                "the ceiling"
            );
        }

        #[test]
        fn refuses_any_other_text() {
            for text in [
                "",
                "01",
                "-1",
                "+1",
                " 1",
                "1.0",
                "9223372036854775808",
                "x",
            ] {
                assert_eq!(decode_revision(text), None, "{text:?} is not canonical");
            }
        }
    }
}
