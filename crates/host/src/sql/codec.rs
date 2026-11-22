//! A stored Space as rows, the rows the TypeScript SQL repository writes and
//! reads (`src/persistence/sql-space-repository.ts`): the space document and
//! each Resource document as JSON text, and revisions as canonical decimal
//! text (`encodeStoredRevision`).

use intake::json::{JsonObject, JsonValue, parse};
use intake::{SpaceId, SpaceSnapshot, decode_space_snapshot, load_space};

use crate::document::wire_snapshot;
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
fn decode_revision(text: &str) -> Option<Revision> {
    let canonical = text == "0"
        || (!text.starts_with('0') && !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()));
    canonical
        .then(|| text.parse::<u64>().ok())
        .flatten()
        .and_then(Revision::new)
}

/// A Space as its rows: the space row, and one row per Resource in the
/// snapshot's order.
pub(crate) fn encode_space(space: &LoadedSpace) -> (SpaceRow, Vec<ResourceRow>) {
    let wire = wire_snapshot(&space.snapshot);
    let id = space.snapshot.id.as_str().to_owned();
    let field = |value: &JsonValue, key: &str| value.as_object().and_then(|o| o.get(key)).cloned();
    let document = field(&wire, "document").map_or_else(String::new, |value| compact(&value));
    let resources = match field(&wire, "resources") {
        Some(JsonValue::Array(resources)) => resources
            .iter()
            .map(|resource| ResourceRow {
                id: field(resource, "id")
                    .and_then(|value| value.as_str().map(str::to_owned))
                    .unwrap_or_default(),
                space_id: id.clone(),
                document: field(resource, "document")
                    .map_or_else(String::new, |value| compact(&value)),
            })
            .collect(),
        _ => Vec::new(),
    };
    let row = SpaceRow {
        id,
        document,
        revision: encode_revision(space.revision),
        exported_revision: space.exported_revision.map(encode_revision),
    };
    (row, resources)
}

/// The title a stored space document carries.
pub(crate) fn decode_title(row: &SpaceRow) -> Result<String, String> {
    let document = parse(&row.document)
        .map_err(|error| format!("stored Space {} does not parse: {error}", row.id))?;
    document
        .as_object()
        .and_then(|object| object.get("title"))
        .and_then(JsonValue::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("stored Space {} has no title", row.id))
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
