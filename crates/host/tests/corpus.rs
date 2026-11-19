//! The intake conformance corpus (`conformance/intake/README.md`) run
//! through the host: every accepted directory case Imported into a memory
//! store and Exported in place onto a copy, the tree compared byte for byte
//! with `export/` (or with `aggregate/`); and every commit case decoded as
//! `POST /api/spaces` is, decided by the store, its refusals compared as a
//! multiset of (kind, file, id, field, edge), and an accepted one Exported
//! and compared with `next/`.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use host::{
    CommitResult, DecodeError, IdSource, MemorySpaceRepository, SpaceRepository, TokioFilesystem,
    decode_commit, export_aggregate, import_directory,
};
use intake::{Refusal, Uuid};
use serde_json::Value;

/// The cases carry every id, so minting one is a failure.
struct NoIds;

impl IdSource for NoIds {
    fn new_id(&self) -> Uuid {
        panic!("the host minted an id the case writes down")
    }
}

fn corpus() -> PathBuf {
    PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../conformance/intake"
    ))
}

type Located = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<(String, String)>,
);

fn located(refusal: &Refusal) -> Located {
    (
        refusal.kind().as_str().to_owned(),
        refusal.file().into_owned(),
        refusal.id().map(|id| id.as_str().to_owned()),
        refusal.field().map(|field| field.into_owned()),
        refusal
            .edge()
            .map(|edge| (edge.from.as_str().to_owned(), edge.to.as_str().to_owned())),
    )
}

fn expected(refusal: &Value) -> Located {
    let text = |key: &str| {
        refusal
            .get(key)
            .map(|value| value.as_str().unwrap().to_owned())
    };
    (
        text("kind").unwrap(),
        text("file").unwrap(),
        text("id"),
        text("field"),
        refusal.get("edge").map(|edge| {
            (
                edge["from"].as_str().unwrap().to_owned(),
                edge["to"].as_str().unwrap().to_owned(),
            )
        }),
    )
}

fn multiset(refusals: impl IntoIterator<Item = Located>) -> BTreeMap<Located, usize> {
    let mut counts = BTreeMap::new();
    for refusal in refusals {
        *counts.entry(refusal).or_insert(0) += 1;
    }
    counts
}

fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let path = entry.unwrap().path();
        let target = to.join(path.file_name().unwrap());
        if path.is_dir() {
            copy_tree(&path, &target);
        } else {
            fs::copy(&path, &target).unwrap();
        }
    }
}

fn read_tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                let relative = path
                    .strip_prefix(root)
                    .unwrap()
                    .components()
                    .map(|part| part.as_os_str().to_str().unwrap())
                    .collect::<Vec<_>>()
                    .join("/");
                files.insert(relative, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(root, root, &mut files);
    files
}

fn differences(actual: &Path, expected: &Path) -> Vec<String> {
    let actual = read_tree(actual);
    let expected = read_tree(expected);
    let mut names: Vec<&String> = actual.keys().chain(expected.keys()).collect();
    names.sort();
    names.dedup();
    names
        .into_iter()
        .filter_map(|name| match (actual.get(name), expected.get(name)) {
            (None, _) => Some(format!("missing {name}")),
            (_, None) => Some(format!("unexpected {name}")),
            (Some(left), Some(right)) if left != right => Some(format!(
                "different {name}:\n--- written\n{}\n--- expected\n{}",
                String::from_utf8_lossy(left),
                String::from_utf8_lossy(right)
            )),
            _ => None,
        })
        .collect()
}

fn case_json(case: &Path) -> Value {
    serde_json::from_slice(&fs::read(case.join("case.json")).unwrap()).unwrap()
}

fn cases(kind: &str) -> Vec<(String, PathBuf)> {
    let mut cases: Vec<(String, PathBuf)> = fs::read_dir(corpus().join(kind))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.is_dir())
        .map(|path| (path.file_name().unwrap().to_str().unwrap().to_owned(), path))
        .collect();
    cases.sort();
    cases
}

/// Import a fresh copy of `aggregate` into a fresh store, answering both.
async fn imported(aggregate: &Path) -> (tempfile::TempDir, PathBuf, MemorySpaceRepository) {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("talk");
    copy_tree(aggregate, &directory);
    let store = MemorySpaceRepository::new();
    import_directory(&store, &TokioFilesystem, &directory, &NoIds)
        .await
        .unwrap();
    (temporary, directory, store)
}

#[tokio::test]
async fn every_accepted_directory_case_exports_the_recorded_bytes() {
    let mut failures = Vec::new();
    let mut accepted = 0;
    for (name, case) in cases("directory") {
        if case_json(&case)["expect"]["outcome"] != "accepted" {
            continue;
        }
        accepted += 1;
        let (_temporary, directory, store) = imported(&case.join("aggregate")).await;
        let _exported = export_aggregate(&store, &TokioFilesystem, &directory)
            .await
            .unwrap();
        let recorded = if case.join("export").is_dir() {
            case.join("export")
        } else {
            case.join("aggregate")
        };
        let differences = differences(&directory, &recorded);
        if !differences.is_empty() {
            failures.push(format!("{name}:\n{}", differences.join("\n")));
        }
    }
    assert!(
        accepted > 0,
        "the corpus should hold accepted directory cases"
    );
    assert!(
        failures.is_empty(),
        "{} of {accepted} accepted cases export other bytes:\n\n{}",
        failures.len(),
        failures.join("\n\n")
    );
}

#[tokio::test]
async fn every_commit_case_gets_its_expected_answer_and_exports_the_recorded_bytes() {
    let mut failures = Vec::new();
    let cases = cases("commit");
    assert!(!cases.is_empty(), "the corpus should hold commit cases");
    for (name, case) in &cases {
        let description = case_json(case);
        let base = description["base"].as_str().unwrap();
        let (_temporary, directory, store) =
            imported(&corpus().join("directory").join(base).join("aggregate")).await;
        let body = fs::read(case.join("commit.json")).unwrap();
        let got = match decode_commit(&body) {
            Err(DecodeError::Invalid {
                refusals: Some(refusals),
                ..
            }) => Some(multiset(refusals.as_slice().iter().map(located))),
            Err(other) => panic!("{name}: the commit did not decode: {other:?}"),
            Ok(commit) => match store.commit(commit).await.unwrap() {
                CommitResult::Committed { .. } => None,
                CommitResult::AggregateRefused(refusal) => {
                    Some(multiset(refusal.refusals.iter().map(located)))
                }
                other => panic!("{name}: no intake answer: {other:?}"),
            },
        };
        let expect = &description["expect"];
        let want = match expect["outcome"].as_str().unwrap() {
            "accepted" => None,
            _ => Some(multiset(
                expect["refusals"].as_array().unwrap().iter().map(expected),
            )),
        };
        if want != got {
            failures.push(format!("{name}: expected {want:#?}\ngot {got:#?}"));
            continue;
        }
        if want.is_none() {
            let _exported = export_aggregate(&store, &TokioFilesystem, &directory)
                .await
                .unwrap();
            let differences = differences(&directory, &case.join("next"));
            if !differences.is_empty() {
                failures.push(format!("{name}:\n{}", differences.join("\n")));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {} commit cases disagree:\n\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n\n")
    );
}

mod given_an_accepted_directory_case {
    use super::*;

    #[tokio::test]
    async fn absent_assets_names_each_referenced_asset_the_directory_does_not_carry() {
        let (_temporary, _directory, store) =
            imported(&corpus().join("directory/accepted-image/aggregate")).await;
        let absent: Vec<String> = host::absent_assets(&store)
            .await
            .unwrap()
            .iter()
            .map(|hash| hash.as_str().to_owned())
            .collect();
        assert_eq!(
            absent,
            vec!["n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg".to_owned()],
            "the Image's picture is referenced and not carried"
        );
    }

    #[tokio::test]
    async fn absent_assets_is_empty_when_the_directory_carries_every_asset() {
        let (_temporary, _directory, store) =
            imported(&corpus().join("directory/accepted-markdown/aggregate")).await;
        let absent = host::absent_assets(&store).await.unwrap();
        assert!(absent.is_empty(), "every asset is carried: {absent:?}");
    }
}

/// Import reads a directory on disk as intake's own runner reads the case's
/// files: a file where Import lists a directory (`resources`, `assets`)
/// cannot be listed, as `scanAggregateFrom` finds.
#[tokio::test]
async fn every_directory_case_gets_its_expected_answer_through_import_directory() {
    let mut failures = Vec::new();
    for (name, case) in cases("directory") {
        let expect = &case_json(&case)["expect"];
        let want = match expect["outcome"].as_str().unwrap() {
            "accepted" => None,
            _ => Some(multiset(
                expect["refusals"].as_array().unwrap().iter().map(expected),
            )),
        };
        let temporary = tempfile::tempdir().unwrap();
        let directory = temporary.path().join("talk");
        copy_tree(&case.join("aggregate"), &directory);
        let store = MemorySpaceRepository::new();
        let got = match import_directory(&store, &TokioFilesystem, &directory, &NoIds).await {
            Ok(()) => None,
            Err(host::ImportError::Refused(refusals)) => {
                Some(multiset(refusals.as_slice().iter().map(located)))
            }
            Err(other) => panic!("{name}: {other}"),
        };
        if want != got {
            failures.push(format!("{name}:\nexpected {want:#?}\ngot {got:#?}"));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n\n"));
}
