//! `infinity-cube check`, run as a process: every directory case of the
//! intake corpus (`conformance/intake/README.md`) through `check --json`,
//! its answer compared with the case's `expect` (refusals as a multiset of
//! kind, file, id, field and edge), and what an author reads.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod common;

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::process::{Command, Output};

use common::{BINARY, copy_of, corpus};
use serde_json::Value;

fn check(args: &[&str]) -> Output {
    Command::new(BINARY)
        .arg("check")
        .args(args)
        .output()
        .unwrap()
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// One refusal's six values (kind, file, id, field and the edge's two
/// ends), an absent one `None`, whatever order its JSON
/// object keeps them in.
type Located = [Option<String>; 6];

fn located(refusal: &Value) -> Located {
    let text = |value: &Value| value.as_str().map(str::to_owned);
    [
        text(&refusal["kind"]),
        text(&refusal["file"]),
        text(&refusal["id"]),
        text(&refusal["field"]),
        text(&refusal["edge"]["from"]),
        text(&refusal["edge"]["to"]),
    ]
}

/// Refusals as a multiset: each, and how many times it appears.
fn multiset(refusals: &Value) -> BTreeMap<Located, usize> {
    let mut counts = BTreeMap::new();
    for refusal in refusals.as_array().into_iter().flatten() {
        *counts.entry(located(refusal)).or_insert(0) += 1;
    }
    counts
}

/// The case's expected answer and what `check --json` answered, when they differ.
fn disagreement(case: &Path) -> Option<String> {
    let description: Value =
        serde_json::from_slice(&fs::read(case.join("case.json")).unwrap()).unwrap();
    let expect = &description["expect"];
    let (_temporary, directory) = copy_of(&case.join("aggregate"));
    let output = check(&["--json", directory.to_str().unwrap()]);
    let answer: Value = serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "{}: not JSON ({error}): {}",
            case.display(),
            text(&output.stdout)
        )
    });
    let outcome = answer["outcome"].as_str().unwrap_or_default();
    let exit_agrees = output.status.success() == (outcome == "accepted");
    let want = (expect["outcome"].clone(), multiset(&expect["refusals"]));
    let got = (answer["outcome"].clone(), multiset(&answer["refusals"]));
    (want != got || !exit_agrees).then(|| {
        format!(
            "expected {want:#?}\ngot {got:#?} exiting {:?}",
            output.status.code()
        )
    })
}

mod given_the_intake_corpus {
    use super::*;

    #[test]
    fn answers_each_directory_case_as_its_expect_says() {
        let mut cases: Vec<_> = fs::read_dir(corpus().join("directory"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.is_dir())
            .collect();
        cases.sort();
        assert!(
            cases.len() > 50,
            "the corpus should hold its directory cases"
        );
        let failures: Vec<String> = cases
            .iter()
            .filter_map(|case| {
                disagreement(case)
                    .map(|why| format!("{}:\n{why}", case.file_name().unwrap().to_string_lossy()))
            })
            .collect();
        assert!(
            failures.is_empty(),
            "{} cases disagree:\n{}",
            failures.len(),
            failures.join("\n\n")
        );
    }
}

mod given_an_accepted_directory {
    use super::*;

    #[test]
    fn says_it_is_valid_and_exits_zero() {
        let (_temporary, directory) = copy_of(&common::repository().join("packages/app/fixture"));
        let output = check(&[directory.to_str().unwrap()]);
        assert!(
            output.status.success(),
            "accepted: {}",
            text(&output.stderr)
        );
        assert_eq!(
            text(&output.stdout),
            format!("{} is a valid aggregate.\n", directory.display()),
            "the answer"
        );
    }

    #[test]
    fn names_each_asset_it_does_not_carry() {
        let (_temporary, directory) = copy_of(&corpus().join("directory/accepted-image/aggregate"));
        let output = check(&[directory.to_str().unwrap()]);
        assert!(
            output.status.success(),
            "accepted: {}",
            text(&output.stderr)
        );
        let hash = "n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg";
        assert!(
            text(&output.stdout).contains(&format!(
                "/assets/{hash} has no file: write its bytes to assets/{hash}.<extension>"
            )),
            "the absent picture: {}",
            text(&output.stdout)
        );
        let json = check(&["--json", directory.to_str().unwrap()]);
        let answer: Value = serde_json::from_slice(&json.stdout).unwrap();
        assert_eq!(answer["absentAssets"], serde_json::json!([hash]), "as JSON");
    }

    #[test]
    fn writes_nothing() {
        let (_temporary, directory) =
            copy_of(&corpus().join("directory/accepted-rewritten/aggregate"));
        let before = common::read_tree(&directory);
        assert!(
            check(&[directory.to_str().unwrap()]).status.success(),
            "accepted"
        );
        assert_eq!(
            common::read_tree(&directory),
            before,
            "the directory is unchanged"
        );
    }
}

mod given_a_refused_directory {
    use super::*;

    #[test]
    fn prints_each_refusal_with_its_kind_and_location_and_exits_one() {
        let (_temporary, directory) =
            copy_of(&corpus().join("directory/duplicate-graph-edge/aggregate"));
        let output = check(&[directory.to_str().unwrap()]);
        assert_eq!(output.status.code(), Some(1), "refused");
        let stderr = text(&output.stderr);
        assert!(
            stderr.contains("(duplicate-graph-edge at 10000000-0000-4000-8000-000000000001/space.json, id 00000000-0000-4000-8000-000000000b01, edge 00000000-0000-4000-8000-000000000101 -> 00000000-0000-4000-8000-000000000102)"),
            "kind and location: {stderr}"
        );
    }
}

mod given_a_missing_or_empty_directory {
    use super::*;

    #[test]
    fn refuses_it_naming_pnpm_cube_init() {
        let temporary = tempfile::tempdir().unwrap();
        let empty = temporary.path().join("empty");
        fs::create_dir_all(empty.join(".git")).unwrap();
        for directory in [temporary.path().join("missing"), empty] {
            let output = check(&[directory.to_str().unwrap()]);
            assert_eq!(output.status.code(), Some(1), "{}", directory.display());
            // A path a shell would split or expand, as a Windows temporary
            // directory's is, is named in single quotes.
            let stderr = text(&output.stderr);
            let shown = directory.display();
            assert!(
                stderr.contains(&format!("To create one there: pnpm cube init {shown}"))
                    || stderr.contains(&format!("To create one there: pnpm cube init '{shown}'")),
                "names init: {stderr}"
            );
        }
    }
}

mod given_no_directory_argument {
    use super::*;

    #[test]
    fn exits_two_on_a_usage_error() {
        let output = Command::new(BINARY).args(["check"]).output().unwrap();
        assert_eq!(output.status.code(), Some(2), "no directory");
        assert!(
            text(&output.stderr).starts_with("Usage: infinity-cube"),
            "usage"
        );
    }
}
