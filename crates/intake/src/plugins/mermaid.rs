//! The Mermaid plugin (ADR 0142, ADR 0158): its source is the asset its `url`
//! names, and whether it is Open is its Map content.
//! `packages/plugin-mermaid/src/domain.ts`.

use super::{Plugin, check_open};
use crate::assets::is_asset_ref;
use crate::json::JsonValue;
use crate::refusal::ShapeProblem;
use crate::shape::{Checker, Status, Strictness};

/// The Mermaid plugin.
pub(crate) struct Mermaid;

impl Plugin for Mermaid {
    fn kind(&self) -> &'static str {
        "mermaid"
    }

    fn check_content<'a>(
        &self,
        checker: &mut Checker<'a>,
        content: Option<&'a JsonValue>,
    ) -> Status {
        let Some(mut object) = checker.object(content, &["url"], Strictness::Strict) else {
            return Status::Aborted;
        };
        let url = object.get("url");
        let parsed = checker.key("url", |c| {
            let text = c.string(url);
            c.refine(
                text,
                |text| is_asset_ref(text),
                || ShapeProblem::Custom("An asset reference."),
            )
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
}
