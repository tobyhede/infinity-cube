//! What the binary says about a directory it will not run or check: the
//! sentence an author reads, and the JSON a program reads. A refusal names
//! its kind and where it is (ADR 0156); the message after it is this
//! runtime's own wording.

use std::path::Path;

use intake::{Refusal, Refusals};
use serde_json::{Map, Value, json};

/// A path as one word a POSIX shell reads back unchanged, so a printed
/// command can be pasted.
pub(crate) fn shell_word(path: &str) -> String {
    let plain = !path.is_empty()
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_./+:@%-".contains(c));
    if plain {
        path.to_owned()
    } else {
        format!("'{}'", path.replace('\'', "'\\''"))
    }
}

/// A missing or empty directory, naming the verb that makes one.
pub(crate) fn empty(directory: &Path) -> String {
    let shown = directory.display().to_string();
    format!(
        "{shown} holds no aggregate: it is missing or empty. To create one there: pnpm cube init {}",
        shell_word(&shown)
    )
}

/// One refusal on one line: its message, then its kind and location.
pub(crate) fn refusal_line(refusal: &Refusal) -> String {
    let mut location = format!("{} at {}", refusal.kind(), refusal.file());
    if let Some(id) = refusal.id() {
        location.push_str(&format!(", id {id}"));
    }
    if let Some(field) = refusal.field() {
        location.push_str(&format!(", field {field}"));
    }
    if let Some(edge) = refusal.edge() {
        location.push_str(&format!(", edge {} -> {}", edge.from, edge.to));
    }
    format!("{refusal} ({location})")
}

/// Intake's refusals of a directory, one line each.
pub(crate) fn refused(directory: &Path, refusals: &Refusals) -> String {
    let mut text = format!(
        "{} is not an aggregate intake accepts:",
        directory.display()
    );
    for refusal in refusals.as_slice() {
        text.push('\n');
        text.push_str(&refusal_line(refusal));
    }
    text
}

/// One refusal as the intake corpus writes it (`conformance/intake/README.md`):
/// `kind` and `file` always, `id`, `field` and `edge` only when present.
pub(crate) fn refusal_json(refusal: &Refusal) -> Value {
    let mut object = Map::new();
    let _kind = object.insert("kind".to_owned(), json!(refusal.kind().as_str()));
    let _file = object.insert("file".to_owned(), json!(refusal.file()));
    if let Some(id) = refusal.id() {
        let _id = object.insert("id".to_owned(), json!(id.as_str()));
    }
    if let Some(field) = refusal.field() {
        let _field = object.insert("field".to_owned(), json!(field));
    }
    if let Some(edge) = refusal.edge() {
        let _edge = object.insert(
            "edge".to_owned(),
            json!({ "from": edge.from.as_str(), "to": edge.to.as_str() }),
        );
    }
    Value::Object(object)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_a_path_only_when_a_shell_would_split_or_expand_it() {
        assert_eq!(shell_word("/tmp/talk-1"), "/tmp/talk-1", "plain");
        assert_eq!(shell_word("/tmp/my talk"), "'/tmp/my talk'", "a space");
        assert_eq!(shell_word("it's"), "'it'\\''s'", "a quote");
        assert_eq!(shell_word(""), "''", "empty");
    }

    #[test]
    fn names_pnpm_cube_init_for_an_empty_directory() {
        assert_eq!(
            empty(Path::new("/tmp/my talk")),
            "/tmp/my talk holds no aggregate: it is missing or empty. To create one there: pnpm cube init '/tmp/my talk'",
            "the init command can be pasted"
        );
    }

    #[test]
    fn writes_a_refusal_with_its_kind_and_location() {
        let refusal = Refusal::AggregateFileMissing;
        assert_eq!(
            refusal_json(&refusal),
            json!({ "kind": "aggregate-file-missing", "file": "aggregate.json" }),
            "absent keys are left out"
        );
        let line = refusal_line(&refusal);
        assert!(
            line.ends_with("(aggregate-file-missing at aggregate.json)"),
            "kind and file: {line}"
        );
    }
}
