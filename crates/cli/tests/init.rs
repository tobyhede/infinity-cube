//! `infinity-cube init` and `version`, run as a process: a new aggregate
//! that `check` accepts and `run` names, a directory with content refused
//! untouched, and the version line.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod common;

use std::fs;
use std::process::{Command, Output};

use common::BINARY;

fn infinity_cube(args: &[&str]) -> Output {
    Command::new(BINARY).args(args).output().unwrap()
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

mod given_a_missing_directory {
    use super::*;

    #[test]
    fn writes_an_aggregate_check_accepts_and_names_how_to_run_it() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("space");
        let shown = directory.to_str().unwrap();

        let init = infinity_cube(&["init", shown]);

        assert!(init.status.success(), "{}", text(&init.stderr));
        // The directory is shown as a shell word, quoted where it needs to be.
        assert!(
            text(&init.stdout).contains("run it with: infinity-cube run "),
            "{}",
            text(&init.stdout)
        );
        let check = infinity_cube(&["check", shown]);
        assert!(check.status.success(), "{}", text(&check.stderr));
    }
}

mod given_a_directory_holding_content {
    use super::*;

    #[test]
    fn exits_one_and_leaves_it_as_it_was() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("notes.md"), "mine\n").unwrap();

        let init = infinity_cube(&["init", root.path().to_str().unwrap()]);

        assert_eq!(init.status.code(), Some(1), "refused");
        assert!(
            text(&init.stderr).contains("is not empty"),
            "{}",
            text(&init.stderr)
        );
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1, "untouched");
    }
}

mod given_version {
    use super::*;

    #[test]
    fn prints_the_cargo_version_and_a_commit() {
        let version = infinity_cube(&["--version"]);

        assert!(version.status.success(), "exits zero");
        let shown = text(&version.stdout);
        assert!(
            shown.starts_with(&format!("infinity-cube {} (", env!("CARGO_PKG_VERSION"))),
            "{shown}"
        );
    }
}
