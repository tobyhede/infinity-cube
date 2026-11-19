//! The build's plugin list, as the Rust intake reads it (ADR 0142, ADR 0156):
//! the Rust half of `packages/plugins`. Each listed plugin is one module
//! here and one entry in [`PLUGINS`], in the order the TypeScript list has
//! them; a plugin's content and Map content rules change in its TypeScript
//! domain half and its module here in the same change.
//!
//! A kind no listed plugin draws is the default plugin's: its content is
//! carried whole and its Map content is never refused.

mod default;
mod image;
mod markdown;
mod mermaid;
mod reference;
mod space;
mod ur;

use crate::ids::{GraphId, MapId, ResourceId, SpaceId};
use crate::json::JsonValue;
use crate::shape::{Checker, Status};

/// One key of a listed plugin's content, in its schema's order, with the keys
/// of the object it holds when its schema declares one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContentKey {
    /// The key.
    pub name: &'static str,
    /// The keys of the object it holds, in its schema's order; empty when it
    /// holds no object.
    pub nested: &'static [&'static str],
}

impl ContentKey {
    /// A key holding no object.
    pub(crate) const fn flat(name: &'static str) -> Self {
        Self { name, nested: &[] }
    }
}

/// The names of `keys`, in order, for a schema's check of an object.
pub(crate) const fn key_names<const N: usize>(keys: &[ContentKey; N]) -> [&'static str; N] {
    let mut names = [""; N];
    let mut at = 0;
    while at < N {
        names[at] = keys[at].name;
        at += 1;
    }
    names
}

/// What intake asks of a kind: the rules its plugin's domain half declares.
pub(crate) trait Plugin: Sync {
    /// The kind it draws.
    fn kind(&self) -> &'static str;

    /// Its content's keys, in its schema's order.
    fn content_keys(&self) -> &'static [ContentKey];

    /// Check a Resource's `content`, raising each issue its schema raises,
    /// relative to the content.
    fn check_content<'a>(
        &self,
        checker: &mut Checker<'a>,
        content: Option<&'a JsonValue>,
    ) -> Status;

    /// Check the Map content a placement keeps for a Resource of this kind.
    fn check_map_content<'a>(&self, checker: &mut Checker<'a>, value: &'a JsonValue) -> Status;

    /// Whether another Resource may reference one of this kind as its Target (ADR 0113).
    fn may_be_target(&self) -> bool {
        false
    }

    /// Whether a Space this kind references lives by that reference (ADR 0074).
    fn owns_referenced_spaces(&self) -> bool {
        false
    }

    /// The Resources content its schema accepted references, in declared order.
    fn resource_references(&self, _content: &JsonValue) -> Vec<ResourceId> {
        Vec::new()
    }

    /// The Spaces content its schema accepted references, in declared order.
    fn space_references(&self, _content: &JsonValue) -> Vec<SpaceId> {
        Vec::new()
    }

    /// The Map and Graph of another Space this content selects, when the kind shows one (ADR 0079).
    fn selection(&self, _content: &JsonValue) -> Option<(MapId, GraphId)> {
        None
    }
}

/// Every listed plugin, in the order every choice among kinds is offered in.
pub(crate) static PLUGINS: &[&dyn Plugin] = &[
    &markdown::Markdown,
    &space::Space,
    &image::Image,
    &ur::Ur,
    &reference::Reference,
    &mermaid::Mermaid,
];

/// The default plugin: what answers for a kind no listed plugin draws.
pub(crate) static DEFAULT_PLUGIN: &dyn Plugin = &default::Default;

/// The listed plugin that draws `kind`, if one does.
pub(crate) fn listed(kind: &str) -> Option<&'static dyn Plugin> {
    PLUGINS.iter().copied().find(|plugin| plugin.kind() == kind)
}

/// The plugin that answers for `kind`: its own, or the default plugin.
pub(crate) fn plugin_for(kind: &str) -> &'static dyn Plugin {
    listed(kind).unwrap_or(DEFAULT_PLUGIN)
}

/// The kinds a listed plugin draws, in list order.
#[must_use]
pub fn plugin_kinds() -> Vec<&'static str> {
    PLUGINS.iter().map(|plugin| plugin.kind()).collect()
}

/// Whether a listed plugin draws `kind`; a kind none draws is carried whole (ADR 0142).
#[must_use]
pub fn is_plugin_kind(kind: &str) -> bool {
    listed(kind).is_some()
}

/// The keys of the content of the listed plugin that draws `kind`, in its
/// schema's order, or `None` when no listed plugin draws it: what a writer
/// orders a Resource's content by (`canonicalResource`).
#[must_use]
pub fn plugin_content_keys(kind: &str) -> Option<&'static [ContentKey]> {
    listed(kind).map(|plugin| plugin.content_keys())
}

/// Why `plugin` refuses this Map content, in its schema's words, or `None` when it accepts it.
pub(crate) fn map_content_problem(plugin: &dyn Plugin, value: &JsonValue) -> Option<String> {
    let mut checker = Checker::new();
    if plugin.check_map_content(&mut checker, value) == Status::Valid {
        return None;
    }
    let described: Vec<String> = checker
        .into_issues()
        .iter()
        .map(|issue| match &issue.field {
            Some(field) => format!("{field}: {}", issue.problem),
            None => issue.problem.to_string(),
        })
        .collect();
    Some(described.join("; "))
}

/// A string member a validated content holds, as the id it spells.
pub(crate) fn content_id<T>(
    content: &JsonValue,
    key: &str,
    parse: impl FnOnce(&str) -> Option<T>,
) -> Option<T> {
    content.as_object()?.get(key)?.as_str().and_then(parse)
}

/// The Map content `{ open: boolean }`, strict, which several plugins keep.
pub(crate) fn check_open<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Status {
    use crate::shape::Strictness;
    let Some(mut object) = checker.object(Some(value), &["open"], Strictness::Strict) else {
        return Status::Aborted;
    };
    let open = object.get("open");
    let parsed = checker.key("open", |c| c.boolean(open));
    object.take(parsed);
    object.status()
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_the_plugin_list {
        use super::*;

        #[test]
        fn lists_the_plugins_in_the_typescript_lists_order() {
            assert_eq!(
                plugin_kinds(),
                vec!["markdown", "space", "image", "ur", "reference", "mermaid"],
                "the order of packages/plugins/src/domain.ts"
            );
        }
    }

    mod given_each_listed_plugin {
        use super::*;

        #[test]
        fn declares_its_content_keys_in_its_schemas_order() {
            let declared = |kind: &str| {
                plugin_content_keys(kind).map(|keys| {
                    keys.iter()
                        .map(|key| (key.name, key.nested))
                        .collect::<Vec<_>>()
                })
            };
            assert_eq!(declared("ur"), Some(vec![]), "Ur content is empty");
            assert_eq!(
                declared("image"),
                Some(vec![
                    ("url", &[][..]),
                    ("naturalSize", &["width", "height"][..])
                ]),
                "Image content"
            );
            assert_eq!(
                declared("markdown"),
                Some(vec![("url", &[][..])]),
                "Markdown content"
            );
            assert_eq!(
                declared("reference"),
                Some(vec![("target", &[][..])]),
                "Reference content"
            );
            assert_eq!(
                declared("space"),
                Some(vec![
                    ("spaceId", &[][..]),
                    ("map", &[][..]),
                    ("graph", &[][..]),
                    ("framing", &["centreX", "centreY", "zoom"][..]),
                ]),
                "Space content"
            );
            assert_eq!(
                declared("vnd.acme.widget"),
                None,
                "a kind no listed plugin draws declares no keys"
            );
        }
    }

    mod given_a_kind_no_plugin_draws {
        use super::*;

        #[test]
        fn answers_a_kind_no_plugin_draws_with_the_default_plugin() {
            assert!(
                !is_plugin_kind("vnd.acme.widget"),
                "an unknown kind is listed by none"
            );
            let value = crate::json::parse(r#"{"anything": [1]}"#).unwrap();
            assert_eq!(
                map_content_problem(plugin_for("vnd.acme.widget"), &value),
                None,
                "the default plugin refuses no Map content"
            );
        }
    }
}
