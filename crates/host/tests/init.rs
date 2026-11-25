//! The init conformance case (`conformance/init/README.md`) run through the
//! host: `init_directory` with ids counted up from one writes exactly
//! `expected/`, which `test/unit/init-conformance.test.ts` holds the
//! TypeScript `initAggregate` to as well.

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
    Initialized, NEW_SPACE_TITLE as NEW_SPACE, TokioFilesystem, import_directory, init_directory,
};
use http_conformance::Counted;

fn expected() -> PathBuf {
    PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../conformance/init/expected"
    ))
}

/// Every file under `root`, by path relative to it with `/` between segments.
fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                let relative = path.strip_prefix(root).unwrap();
                let name = relative
                    .components()
                    .map(|part| part.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                files.insert(name, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(root, root, &mut files);
    files
}

mod given_a_missing_directory {
    use super::*;

    #[tokio::test]
    async fn writes_the_files_of_the_conformance_case_byte_for_byte() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("space");

        let initialized =
            init_directory(&TokioFilesystem, &directory, NEW_SPACE, &Counted::default())
                .await
                .unwrap();

        assert_eq!(initialized, Initialized::Written, "init writes");
        assert_eq!(
            tree(&directory),
            tree(&expected()),
            "init writes exactly conformance/init/expected"
        );
    }

    #[tokio::test]
    async fn writes_an_aggregate_a_run_imports() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("space");
        init_directory(&TokioFilesystem, &directory, NEW_SPACE, &host::RandomIds)
            .await
            .unwrap();

        let store = host::MemorySpaceRepository::new();
        import_directory(&store, &TokioFilesystem, &directory, &host::RandomIds)
            .await
            .expect("the new aggregate imports");
    }
}

mod given_a_directory_holding_only_dot_entries {
    use super::*;

    #[tokio::test]
    async fn writes_beside_them_and_leaves_them_as_they_were() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join(".git")).unwrap();
        fs::write(root.path().join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();

        let initialized = init_directory(
            &TokioFilesystem,
            root.path(),
            NEW_SPACE,
            &Counted::default(),
        )
        .await
        .unwrap();

        assert_eq!(
            initialized,
            Initialized::Written,
            "dot-entries are not content"
        );
        assert_eq!(
            fs::read_to_string(root.path().join(".git/HEAD")).unwrap(),
            "ref: refs/heads/main\n",
            "the dot-entry is untouched"
        );
        assert!(
            root.path().join("aggregate.json").is_file(),
            "the aggregate is written"
        );
    }
}

mod given_a_directory_holding_content {
    use super::*;

    #[tokio::test]
    async fn writes_nothing() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("notes.md"), "mine\n").unwrap();

        let initialized = init_directory(
            &TokioFilesystem,
            root.path(),
            NEW_SPACE,
            &Counted::default(),
        )
        .await
        .unwrap();

        assert_eq!(initialized, Initialized::NotEmpty, "init refuses");
        assert_eq!(
            fs::read_dir(root.path()).unwrap().count(),
            1,
            "nothing but the file that was there"
        );
    }
}

mod given_a_title {
    use super::*;

    #[tokio::test]
    async fn titles_the_meta_space_with_it_as_written() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("space");
        let title = r#"Q3 "review" \ notes"#;

        init_directory(&TokioFilesystem, &directory, title, &Counted::default())
            .await
            .unwrap();

        let aggregate: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.join("aggregate.json")).unwrap()).unwrap();
        let meta = aggregate["metaSpaceId"].as_str().unwrap();
        let space: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.join(meta).join("space.json")).unwrap())
                .unwrap();
        assert_eq!(
            space["title"], title,
            "the Meta Space bears the Title given"
        );
        let store = host::MemorySpaceRepository::new();
        import_directory(&store, &TokioFilesystem, &directory, &host::RandomIds)
            .await
            .expect("an aggregate with that Title imports");
    }
}
