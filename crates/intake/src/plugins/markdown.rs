//! The Markdown plugin (ADR 0020, ADR 0142): its text is the asset its `url`
//! names, and whether it is Open is its Map content.
//! `packages/plugin-markdown/src/domain.ts`.

use super::{ContentKey, Plugin, check_open, key_names};
use crate::assets::is_asset_ref;
use crate::json::JsonValue;
use crate::refusal::ShapeProblem;
use crate::shape::{Checker, Status, Strictness};

/// The Markdown plugin.
pub(crate) struct Markdown;

const CONTENT_KEYS: [ContentKey; 1] = [ContentKey::flat("url")];

impl Plugin for Markdown {
    fn kind(&self) -> &'static str {
        "markdown"
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
