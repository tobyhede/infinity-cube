//! What the shell's tests share: a fresh copy of the tracked fixture, the
//! HTTP conformance suite's stand-in build, and a commit that renames a Space.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use tempfile::TempDir;

/// The tracked fixture's Meta Space, and its product address.
pub const META: &str = "00000000-0000-4000-8000-000000000040";
pub const META_ADDRESS: &str = "/spaces/AAAAAAAAQACAAAAAAAAAQA";
pub const META_API: &str = "/api/spaces/00000000-0000-4000-8000-000000000040";
pub const STAND_IN_PAGE: &str = "<!doctype html><html><head><title>Stand-in</title><script>window.standIn = true;</script></head><body><div id=\"root\"></div></body></html>\n";
pub const STAND_IN_SCRIPT: (&str, &str) =
    ("assets/index-c0nf0rm4.js", "console.log(\"stand-in\");\n");
pub const STAND_IN_ICON: (&str, &str) = (
    "favicon.svg",
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"/>\n",
);
/// `contentSecurityPolicy(inlineScriptSources(page), [])` for the stand-in
/// page, its one script hashed by `openssl dgst -sha256 -binary | base64`.
pub const STAND_IN_POLICY: &str = "default-src 'self'; script-src 'self' 'sha256-PhqNIk+nbvnTgY4TWUCSygYKMiovRbbBV8E7EBCqKHo='; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            let _bytes = std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// A fresh copy of `packages/app/fixture` in a directory of its own.
pub fn fixture_copy() -> (TempDir, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("talk");
    copy_tree(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../app/fixture"),
        &directory,
    );
    (temporary, directory)
}

/// The suite's stand-in build, with a file beside it that is not in it.
pub fn stand_in_build(temporary: &TempDir) -> PathBuf {
    let root = temporary.path().join("built");
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::write(root.join("index.html"), STAND_IN_PAGE).unwrap();
    for (path, text) in [STAND_IN_SCRIPT, STAND_IN_ICON] {
        std::fs::write(root.join(path), text).unwrap();
    }
    std::fs::write(temporary.path().join("outside.txt"), "not built").unwrap();
    root
}

/// A commit renaming the Space `loaded` answers, at its revision.
pub fn rename_text(loaded: &Value, title: &str) -> String {
    let mut snapshot = loaded["snapshot"].clone();
    snapshot["document"]["title"] = json!(title);
    json!({ "changes": [{
        "kind": "update",
        "spaceId": loaded["snapshot"]["id"],
        "snapshot": snapshot,
        "expectedRevision": loaded["revision"],
    }] })
    .to_string()
}
