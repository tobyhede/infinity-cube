//! The Space plugin (ADR 0068, ADR 0074, ADR 0079): shows a selected Map and
//! Graph of another Space, whose lifetime its one Space reference holds.
//! `packages/plugin-space/src/domain.ts`.

use super::{ContentKey, Plugin, check_open, content_id, key_names};
use crate::ids::{GraphId, MapId, SpaceId};
use crate::json::JsonValue;
use crate::shape::{Checker, NumberCheck, Status, Strictness, optional};

/// The Space plugin.
pub(crate) struct Space;

const FRAMING_KEYS: &[&str] = &["centreX", "centreY", "zoom"];

const CONTENT_KEYS: [ContentKey; 4] = [
    ContentKey::flat("spaceId"),
    ContentKey::flat("map"),
    ContentKey::flat("graph"),
    ContentKey {
        name: "framing",
        nested: FRAMING_KEYS,
    },
];

fn check_framing<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Status {
    let Some(mut object) = checker.object(Some(value), FRAMING_KEYS, Strictness::Strict) else {
        return Status::Aborted;
    };
    for (key, checks) in [
        ("centreX", &[NumberCheck::Finite][..]),
        ("centreY", &[NumberCheck::Finite][..]),
        ("zoom", &[NumberCheck::Positive, NumberCheck::Finite][..]),
    ] {
        let member = object.get(key);
        let parsed = checker.key(key, |c| c.number(member, checks));
        object.take(parsed);
    }
    object.status()
}

impl Plugin for Space {
    fn kind(&self) -> &'static str {
        "space"
    }

    fn content_keys(&self) -> &'static [ContentKey] {
        &CONTENT_KEYS
    }

    fn check_content<'a>(
        &self,
        checker: &mut Checker<'a>,
        content: Option<&'a JsonValue>,
    ) -> Status {
        let Some(mut object) =
            checker.object(content, &key_names(&CONTENT_KEYS), Strictness::Strict)
        else {
            return Status::Aborted;
        };
        for key in ["spaceId", "map", "graph"] {
            let member = object.get(key);
            let parsed = checker.key(key, |c| c.uuid(member, crate::ids::Uuid::parse));
            object.take(parsed);
        }
        let framing = object.get("framing");
        let parsed = checker.key("framing", |c| {
            optional(c, framing, |c, value| check_framing(c, value).parsed(()))
        });
        object.take(parsed);
        object.status()
    }

    fn check_map_content<'a>(&self, checker: &mut Checker<'a>, value: &'a JsonValue) -> Status {
        check_open(checker, value)
    }

    fn may_be_target(&self) -> bool {
        true
    }

    fn owns_referenced_spaces(&self) -> bool {
        true
    }

    fn space_references(&self, content: &JsonValue) -> Vec<SpaceId> {
        content_id(content, "spaceId", SpaceId::parse)
            .into_iter()
            .collect()
    }

    fn selection(&self, content: &JsonValue) -> Option<(MapId, GraphId)> {
        Some((
            content_id(content, "map", MapId::parse)?,
            content_id(content, "graph", GraphId::parse)?,
        ))
    }
}
