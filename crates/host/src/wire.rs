//! The HTTP wire encoding (`packages/persistence/src/http-protocol.ts`): the
//! commit request decoded strictly, every answer encoded in the shape the
//! browser's decoders take, and the Problem Details catalogue.

use intake::json::{JsonValue, decode_text, parse};
use intake::{Refusal, RefusalKind, Refusals, SelectionProblem, SpaceId, decode_space_snapshot};

use crate::repository::{
    AggregateLoad, AggregateRefusal, CommitRefusal, LoadedSpace, Revision, SpaceChange,
    SpaceCommit, SpaceConflict, SpaceSummary,
};

/// A Problem Details identity (RFC 9457), from the one closed catalogue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Problem {
    InvalidRequest,
    InvalidSpaceId,
    UnsupportedMediaType,
    PayloadTooLarge,
    InvalidAssetHash,
    AssetTooLarge,
    NotFound,
    MethodNotAllowed,
    Forbidden,
    PersistenceUnavailable,
    InternalError,
}

impl Problem {
    fn code(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid-request",
            Self::InvalidSpaceId => "invalid-space-id",
            Self::UnsupportedMediaType => "unsupported-media-type",
            Self::PayloadTooLarge => "payload-too-large",
            Self::InvalidAssetHash => "invalid-asset-hash",
            Self::AssetTooLarge => "asset-too-large",
            Self::NotFound => "not-found",
            Self::MethodNotAllowed => "method-not-allowed",
            Self::Forbidden => "forbidden",
            Self::PersistenceUnavailable => "persistence-unavailable",
            Self::InternalError => "internal-error",
        }
    }

    pub(crate) fn title(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Invalid request",
            Self::InvalidSpaceId => "Invalid Space id",
            Self::UnsupportedMediaType => "Unsupported media type",
            Self::PayloadTooLarge => "Payload too large",
            Self::InvalidAssetHash => "Invalid asset hash",
            Self::AssetTooLarge => "Asset too large",
            Self::NotFound => "Not found",
            Self::MethodNotAllowed => "Method not allowed",
            Self::Forbidden => "Forbidden",
            Self::PersistenceUnavailable => "Persistence unavailable",
            Self::InternalError => "Internal server error",
        }
    }

    pub(crate) fn status(self) -> u16 {
        match self {
            Self::InvalidRequest | Self::InvalidSpaceId | Self::InvalidAssetHash => 400,
            Self::Forbidden => 403,
            Self::NotFound => 404,
            Self::MethodNotAllowed => 405,
            Self::PayloadTooLarge | Self::AssetTooLarge => 413,
            Self::UnsupportedMediaType => 415,
            Self::InternalError => 500,
            Self::PersistenceUnavailable => 503,
        }
    }

    /// The body: `{ type, title, status, detail }`, and `errors` naming the
    /// whole body (`{ code: "invalid-value", pointer: "" }`) when asked.
    pub(crate) fn body(self, detail: &str, whole_body_invalid: bool) -> JsonValue {
        let mut entries = vec![
            (
                "type",
                text(&format!("urn:infinity-cube:problem:{}", self.code())),
            ),
            ("title", text(self.title())),
            ("status", JsonValue::Number(f64::from(self.status()))),
            ("detail", text(detail)),
        ];
        if whole_body_invalid {
            entries.push((
                "errors",
                JsonValue::Array(vec![object([
                    ("code", text("invalid-value")),
                    ("pointer", text("")),
                ])]),
            ));
        }
        object(entries)
    }
}

fn text(value: &str) -> JsonValue {
    JsonValue::String(value.to_owned())
}

pub(crate) fn object<'a>(entries: impl IntoIterator<Item = (&'a str, JsonValue)>) -> JsonValue {
    JsonValue::Object(
        entries
            .into_iter()
            .map(|(key, value)| (key.to_owned(), value))
            .collect(),
    )
}

fn revision(value: Revision) -> JsonValue {
    text(&value.to_string())
}

/// Why a commit body is not a commit, in the words the request is answered with.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[non_exhaustive]
pub enum DecodeError {
    /// The body is not JSON at all.
    #[error("Malformed JSON in request body")]
    Malformed,
    /// The body is JSON but not a commit.
    #[error("{message}")]
    Invalid {
        /// Why, in words.
        message: String,
        /// A refused snapshot's refusals, located in the Space directory of
        /// its change (ADR 0156).
        refusals: Option<Refusals>,
    },
}

fn invalid(message: impl Into<String>) -> DecodeError {
    DecodeError::Invalid {
        message: message.into(),
        refusals: None,
    }
}

fn exact<'a>(
    value: &'a JsonValue,
    keys: &[&str],
    label: &str,
) -> Result<&'a intake::json::JsonObject, DecodeError> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid(format!("{label} must be an object")))?;
    let mut actual: Vec<&str> = object.iter().map(|(key, _)| key).collect();
    actual.sort_unstable();
    let mut expected = keys.to_vec();
    expected.sort_unstable();
    if actual != expected {
        return Err(invalid(format!("{label} has unexpected fields")));
    }
    Ok(object)
}

fn uuid_of(value: Option<&JsonValue>, label: &str) -> Result<SpaceId, DecodeError> {
    value
        .and_then(JsonValue::as_str)
        .and_then(SpaceId::parse)
        .ok_or_else(|| invalid(format!("{label} must be a UUID")))
}

fn revision_of(value: Option<&JsonValue>, label: &str) -> Result<Revision, DecodeError> {
    let digits = value.and_then(JsonValue::as_str).unwrap_or_default();
    let canonical = !digits.is_empty()
        && digits.len() <= 19
        && digits.bytes().all(|byte| byte.is_ascii_digit())
        && (digits == "0" || !digits.starts_with('0'));
    if !canonical {
        return Err(invalid(format!(
            "{label} must be a canonical non-negative decimal string"
        )));
    }
    digits
        .parse::<u64>()
        .ok()
        .and_then(Revision::new)
        .ok_or_else(|| invalid(format!("{label} must not exceed 2^63-1")))
}

fn snapshot_of(
    value: Option<&JsonValue>,
    label: &str,
    space_id: SpaceId,
) -> Result<intake::SpaceSnapshot, DecodeError> {
    let value = value.unwrap_or(&JsonValue::Null);
    decode_space_snapshot(value, space_id).map_err(|refusals| {
        let described: Vec<String> = refusals
            .as_slice()
            .iter()
            .take(3)
            .map(describe_snapshot_refusal)
            .collect();
        let remaining = refusals.as_slice().len().saturating_sub(3);
        let more = if remaining > 0 {
            format!(" (and {remaining} more)")
        } else {
            String::new()
        };
        DecodeError::Invalid {
            message: format!(
                "{label} snapshot is invalid: {}{more}",
                described.join("; ")
            ),
            refusals: Some(refusals),
        }
    })
}

fn describe_snapshot_refusal(refusal: &Refusal) -> String {
    let field = refusal
        .field()
        .map_or_else(|| "snapshot".to_owned(), |field| field.into_owned());
    match refusal {
        Refusal::InvalidShape { problem, .. } | Refusal::InvalidResourceFile { problem, .. } => {
            format!("{field} {}", problem.to_string().to_lowercase())
        }
        other => format!("{field} {}", other.to_string().to_lowercase()),
    }
}

fn decode_change(value: &JsonValue) -> Result<SpaceChange, DecodeError> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid("commit change must be an object"))?;
    match object.get("kind").and_then(JsonValue::as_str) {
        Some("create") => {
            let change = exact(value, &["kind", "spaceId", "snapshot"], "create change")?;
            let space_id = uuid_of(change.get("spaceId"), "change Space id")?;
            Ok(SpaceChange::Create {
                space_id,
                snapshot: snapshot_of(change.get("snapshot"), "create change", space_id)?,
            })
        }
        Some("update") => {
            let change = exact(
                value,
                &["kind", "spaceId", "snapshot", "expectedRevision"],
                "update change",
            )?;
            let space_id = uuid_of(change.get("spaceId"), "change Space id")?;
            Ok(SpaceChange::Update {
                space_id,
                snapshot: snapshot_of(change.get("snapshot"), "update change", space_id)?,
                expected_revision: revision_of(change.get("expectedRevision"), "expectedRevision")?,
            })
        }
        Some("delete") => {
            let change = exact(
                value,
                &["kind", "spaceId", "expectedRevision"],
                "delete change",
            )?;
            Ok(SpaceChange::Delete {
                space_id: uuid_of(change.get("spaceId"), "change Space id")?,
                expected_revision: revision_of(change.get("expectedRevision"), "expectedRevision")?,
            })
        }
        _ => Err(invalid("commit change has an unknown kind")),
    }
}

/// Decode a `POST /api/spaces` body as the HTTP application does
/// (`decodeCommitRequest`): shape only. Whether the change set names one
/// Space twice is the commit decision's. The body is read as `Request#json()`
/// reads it: as UTF-8 with a leading byte order mark dropped, where a file
/// keeps one.
///
/// # Errors
///
/// [`DecodeError::Malformed`] for a body that is not JSON, and
/// [`DecodeError::Invalid`] for JSON that is not a commit.
pub fn decode_commit(bytes: &[u8]) -> Result<SpaceCommit, DecodeError> {
    let unmarked = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let value = parse(&decode_text(unmarked)).map_err(|_| DecodeError::Malformed)?;
    let request = exact(&value, &["changes"], "commit request")?;
    let Some(JsonValue::Array(changes)) = request.get("changes") else {
        return Err(invalid("commit changes must be an array"));
    };
    let changes = changes
        .iter()
        .map(decode_change)
        .collect::<Result<Vec<_>, _>>()?;
    if changes.is_empty() {
        return Err(invalid("commit changes must be non-empty"));
    }
    Ok(SpaceCommit { changes })
}

pub(crate) fn summaries(spaces: &[SpaceSummary]) -> JsonValue {
    JsonValue::Array(
        spaces
            .iter()
            .map(|space| {
                object([
                    ("id", text(space.id.as_str())),
                    ("title", text(&space.title)),
                ])
            })
            .collect(),
    )
}

pub(crate) fn loaded_space(loaded: &LoadedSpace) -> JsonValue {
    object([
        ("snapshot", crate::document::wire_snapshot(&loaded.snapshot)),
        ("revision", revision(loaded.revision)),
        (
            "exportedRevision",
            loaded.exported_revision.map_or(JsonValue::Null, revision),
        ),
    ])
}

pub(crate) fn aggregate(load: &AggregateLoad) -> JsonValue {
    match load {
        AggregateLoad::Uninitialized => object([("kind", text("uninitialized"))]),
        AggregateLoad::Loaded(aggregate) => object([
            ("kind", text("loaded")),
            (
                "aggregate",
                object([
                    ("metaSpaceId", text(aggregate.meta_space_id.as_str())),
                    (
                        "spaces",
                        JsonValue::Array(aggregate.spaces.iter().map(loaded_space).collect()),
                    ),
                ]),
            ),
        ]),
    }
}

pub(crate) fn committed(revisions: &[(SpaceId, Revision)], deleted: &[SpaceId]) -> JsonValue {
    object([
        (
            "revisions",
            JsonValue::Array(
                revisions
                    .iter()
                    .map(|(id, value)| {
                        object([
                            ("spaceId", text(id.as_str())),
                            ("revision", revision(*value)),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "deletedSpaceIds",
            JsonValue::Array(deleted.iter().map(|id| text(id.as_str())).collect()),
        ),
    ])
}

pub(crate) fn conflict(conflicts: &[SpaceConflict]) -> JsonValue {
    object([(
        "conflicts",
        JsonValue::Array(
            conflicts
                .iter()
                .map(|conflict| {
                    object([
                        ("spaceId", text(conflict.space_id.as_str())),
                        (
                            "current",
                            conflict
                                .current
                                .as_ref()
                                .map_or(JsonValue::Null, loaded_space),
                        ),
                    ])
                })
                .collect(),
        ),
    )])
}

/// A Space intake refusal as the wire carries it (`SpaceError`, less where
/// it is located): its kind, the id or file it names, and its message.
fn space_error(refusal: &Refusal) -> JsonValue {
    let kind = text(refusal.kind().as_str());
    let message = text(&refusal.to_string());
    match refusal.kind() {
        RefusalKind::InvalidShape
        | RefusalKind::UnsupportedVersion
        | RefusalKind::RetiredSpaceGraphs => object([("kind", kind), ("message", message)]),
        RefusalKind::InvalidJson | RefusalKind::InvalidResourceFile => object([
            ("kind", kind),
            ("path", text(&refusal.file())),
            ("message", message),
        ]),
        _ => {
            let reference = match refusal {
                Refusal::GraphEdgeMissingResource { edge, end, .. }
                | Refusal::GraphEdgeResourceOutsideMap { edge, end, .. } => match end {
                    intake::EdgeEnd::From => edge.from.as_str().to_owned(),
                    intake::EdgeEnd::To => edge.to.as_str().to_owned(),
                },
                Refusal::MapMemberMissingResource { resource, .. } => resource.as_str().to_owned(),
                Refusal::MapActiveGraphMissing { graph, .. }
                | Refusal::MapActiveGraphOutsideMap { graph, .. } => graph.as_str().to_owned(),
                Refusal::ReferenceTargetMissing { target, .. }
                | Refusal::ReferenceTargetNotTargetable { target, .. } => {
                    target.as_str().to_owned()
                }
                other => other
                    .id()
                    .map(|id| id.as_str().to_owned())
                    .unwrap_or_default(),
            };
            object([
                ("kind", kind),
                ("ref", text(&reference)),
                ("message", message),
            ])
        }
    }
}

fn resource_location(
    space: SpaceId,
    resource: intake::ResourceId,
    target: SpaceId,
) -> [(&'static str, JsonValue); 3] {
    [
        ("spaceId", text(space.as_str())),
        ("resourceId", text(resource.as_str())),
        ("targetSpaceId", text(target.as_str())),
    ]
}

fn aggregate_error(error: &AggregateRefusal) -> JsonValue {
    match error {
        AggregateRefusal::InvalidSpaceSnapshot {
            snapshot_index,
            errors,
        } => object([
            ("kind", text("invalid-space-snapshot")),
            ("snapshotIndex", JsonValue::Number(*snapshot_index as f64)),
            (
                "errors",
                JsonValue::Array(errors.iter().map(space_error).collect()),
            ),
        ]),
        AggregateRefusal::DuplicateSpaceId {
            space_id,
            snapshot_indexes,
        } => object([
            ("kind", text("duplicate-space-id")),
            ("spaceId", text(space_id.as_str())),
            (
                "snapshotIndexes",
                JsonValue::Array(
                    snapshot_indexes
                        .iter()
                        .map(|index| JsonValue::Number(*index as f64))
                        .collect(),
                ),
            ),
        ]),
        AggregateRefusal::DuplicateResourceId {
            resource_id,
            space_ids,
        } => object([
            ("kind", text("duplicate-resource-id")),
            ("resourceId", text(resource_id.as_str())),
            (
                "spaceIds",
                JsonValue::Array(space_ids.iter().map(|id| text(id.as_str())).collect()),
            ),
        ]),
        AggregateRefusal::Aggregate(refusal) => {
            let kind = ("kind", text(refusal.kind().as_str()));
            let mut entries: Vec<(&str, JsonValue)> = vec![kind];
            match refusal {
                Refusal::MetaSpaceMissing { meta } => {
                    entries.push(("metaSpaceId", text(meta.as_str())))
                }
                Refusal::OrdinarySpaceUnreferenced { space }
                | Refusal::DuplicateSpaceId { space } => {
                    entries.push(("spaceId", text(space.as_str())));
                }
                Refusal::SpaceReferenceMissing {
                    space,
                    resource,
                    target,
                }
                | Refusal::SpaceReferenceCycle {
                    space,
                    resource,
                    target,
                } => entries.extend(resource_location(*space, *resource, *target)),
                Refusal::SpaceResourceSelection {
                    space,
                    resource,
                    target,
                    problem,
                } => {
                    entries.extend(resource_location(*space, *resource, *target));
                    match problem {
                        SelectionProblem::MapMissing { map } => {
                            entries.push(("mapId", text(map.as_str())));
                        }
                        SelectionProblem::GraphMissing { graph } => {
                            entries.push(("graphId", text(graph.as_str())));
                        }
                        SelectionProblem::GraphOutsideMap { map, graph } => {
                            entries.push(("mapId", text(map.as_str())));
                            entries.push(("graphId", text(graph.as_str())));
                        }
                    }
                }
                other => entries.push(("message", text(&other.to_string()))),
            }
            object(entries)
        }
    }
}

pub(crate) fn refused(refusal: &CommitRefusal) -> JsonValue {
    object([(
        "errors",
        JsonValue::Array(refusal.errors.iter().map(aggregate_error).collect()),
    )])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(bytes: &str) -> String {
        match decode_commit(bytes.as_bytes()) {
            Err(DecodeError::Invalid { message, .. }) => message,
            other => panic!("expected an invalid commit, got {other:?}"),
        }
    }

    mod given_bytes_that_are_not_a_commit {
        use super::*;

        #[test]
        fn refuses_malformed_json_as_malformed() {
            assert_eq!(decode_commit(b"{"), Err(DecodeError::Malformed), "not JSON");
        }

        #[test]
        fn refuses_what_is_not_a_commit_by_its_shape() {
            assert_eq!(
                message(r#"{"changes":"none"}"#),
                "commit changes must be an array",
                "changes"
            );
            assert_eq!(
                message(r#"{"changes":[],"x":1}"#),
                "commit request has unexpected fields",
                "keys"
            );
            assert_eq!(
                message(r#"{"changes":[]}"#),
                "commit changes must be non-empty",
                "empty"
            );
            assert_eq!(
                message(r#"{"changes":[{"kind":"move"}]}"#),
                "commit change has an unknown kind",
                "kind"
            );
        }
    }

    mod given_a_revision {
        use super::*;

        #[test]
        fn reads_it_only_in_its_canonical_spelling() {
            for spelling in ["01", "-1", "1.0", "9223372036854775808", ""] {
                let body = format!(
                    r#"{{"changes":[{{"kind":"delete","spaceId":"10000000-0000-4000-8000-000000000001","expectedRevision":"{spelling}"}}]}}"#
                );
                assert!(
                    decode_commit(body.as_bytes()).is_err(),
                    "{spelling:?} is refused"
                );
            }
            let body = r#"{"changes":[{"kind":"delete","spaceId":"10000000-0000-4000-8000-000000000001","expectedRevision":"9223372036854775807"}]}"#;
            assert!(
                decode_commit(body.as_bytes()).is_ok(),
                "the ceiling is read"
            );
        }
    }

    mod given_a_refused_snapshot {
        use super::*;

        #[test]
        fn locates_it_in_the_space_directory_of_its_change() {
            let body = r#"{"changes":[{"kind":"create","spaceId":"10000000-0000-4000-8000-000000000001","snapshot":{"id":"10000000-0000-4000-8000-000000000001","document":{"version":1,"title":""},"resources":[]}}]}"#;
            let Err(DecodeError::Invalid {
                message,
                refusals: Some(refusals),
            }) = decode_commit(body.as_bytes())
            else {
                panic!("expected a refused snapshot");
            };
            assert!(
                message.starts_with("create change snapshot is invalid: "),
                "{message}"
            );
            assert_eq!(
                refusals.as_slice()[0].file(),
                "10000000-0000-4000-8000-000000000001/space.json",
                "the Space directory's space.json"
            );
        }
    }
}
