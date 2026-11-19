//! The Reference plugin (ADR 0070, ADR 0089): shows its Target, its one
//! Resource reference, and may not itself be a Target, so referencing is one
//! hop (ADR 0113). `packages/plugin-reference/src/domain.ts`.

use super::{Plugin, check_open, content_id};
use crate::ids::ResourceId;
use crate::json::JsonValue;
use crate::shape::{Checker, Status, Strictness};

/// The Reference plugin.
pub(crate) struct Reference;

impl Plugin for Reference {
    fn kind(&self) -> &'static str {
        "reference"
    }

    fn check_content<'a>(
        &self,
        checker: &mut Checker<'a>,
        content: Option<&'a JsonValue>,
    ) -> Status {
        let Some(mut object) = checker.object(content, &["target"], Strictness::Strict) else {
            return Status::Aborted;
        };
        let target = object.get("target");
        let parsed = checker.key("target", |c| c.uuid(target, ResourceId::parse));
        object.take(parsed);
        object.status()
    }

    fn check_map_content<'a>(&self, checker: &mut Checker<'a>, value: &'a JsonValue) -> Status {
        check_open(checker, value)
    }

    fn resource_references(&self, content: &JsonValue) -> Vec<ResourceId> {
        content_id(content, "target", ResourceId::parse)
            .into_iter()
            .collect()
    }
}
