//! The Ur plugin (ADR 0113, ADR 0121): no content, and the Shape each Map
//! draws it in as its Map content. `packages/plugin-ur/src/domain.ts`.

use super::Plugin;
use crate::json::JsonValue;
use crate::shape::{Checker, Status, Strictness};

/// The outlines an Ur Resource's Shape may be, the Resource API's `OUTLINES`.
pub(crate) const OUTLINES: &[&str] = &["rectangle", "pill", "ellipse", "diamond"];

/// The Ur plugin.
pub(crate) struct Ur;

impl Plugin for Ur {
    fn kind(&self) -> &'static str {
        "ur"
    }

    fn check_content<'a>(
        &self,
        checker: &mut Checker<'a>,
        content: Option<&'a JsonValue>,
    ) -> Status {
        checker
            .object(content, &[], Strictness::Strict)
            .map_or(Status::Aborted, |object| object.status())
    }

    fn check_map_content<'a>(&self, checker: &mut Checker<'a>, value: &'a JsonValue) -> Status {
        let Some(mut object) = checker.object(Some(value), &["shape"], Strictness::Strict) else {
            return Status::Aborted;
        };
        let shape = object.get("shape");
        let parsed = checker.key("shape", |c| c.one_of(shape, OUTLINES));
        object.take(parsed);
        object.status()
    }

    fn may_be_target(&self) -> bool {
        true
    }
}
