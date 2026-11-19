//! The default plugin (ADR 0142): in no list, it answers for a kind no listed
//! plugin draws. It reads nothing, declares no reference and is no Target.

use super::{ContentKey, Plugin};
use crate::json::JsonValue;
use crate::shape::{Checker, Status};

/// The default plugin.
pub(crate) struct Default;

impl Plugin for Default {
    fn kind(&self) -> &'static str {
        "default"
    }

    /// None: its content is carried whole, in no schema's order, and
    /// [`plugin_content_keys`](super::plugin_content_keys) asks listed plugins only.
    fn content_keys(&self) -> &'static [ContentKey] {
        &[]
    }

    fn check_content<'a>(&self, _: &mut Checker<'a>, _: Option<&'a JsonValue>) -> Status {
        Status::Valid
    }

    fn check_map_content<'a>(&self, _: &mut Checker<'a>, _: &'a JsonValue) -> Status {
        Status::Valid
    }
}
