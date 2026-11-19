//! What the shell's tests share: a fresh copy of the tracked fixture, and
//! from `crates/http-conformance` the fixture's ids, the HTTP conformance
//! suite's stand-in build and a commit that renames a Space.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::{Path, PathBuf};

use tempfile::TempDir;

pub use http_conformance::support::rename_text;
pub use http_conformance::{META, META_ADDRESS};

/// The Meta Space's API address.
#[must_use]
pub fn meta_api() -> String {
    format!("/api/spaces/{META}")
}

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
    copy_tree(&http_conformance::fixture(), &directory);
    (temporary, directory)
}

/// The suite's stand-in build, with a file beside it that is not in it.
pub fn stand_in_build(temporary: &TempDir) -> PathBuf {
    http_conformance::write_stand_in_build(temporary.path())
}
