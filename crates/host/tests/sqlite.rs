//! The SQLite store (Storage ST-3, ST-126 to ST-128): one SQL repository over
//! `sqlx`, held to the memory store's answers, the TypeScript host's path
//! rules, the file settings, and its answers under contention.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::sync::Arc;
use std::time::Duration;

use host::{
    AggregateInput, AggregateLoad, AssetHash, AssetStored, CommitResult, InitializeResult,
    LoadedSpace, MemorySpaceRepository, ReplaceResult, RepositoryError, Revision, SpaceChange,
    SpaceCommit, SpaceRepository, SqlitePath, SqlitePathError, SqliteSpaceRepository, StoredAsset,
    TokioFilesystem, import_directory,
};
use http_conformance::{Counted, META};
use intake::SpaceId;
use sqlite_support::{Migrated, execute, hold_exclusive_lock, on_file};

mod given_a_sqlite_path {
    use super::*;

    fn refusal(value: Option<&str>) -> String {
        SqlitePath::from_variable(value)
            .map(|path| format!("accepted {path:?}"))
            .unwrap_or_else(|error| error.to_string())
    }

    #[test]
    fn refuses_an_unset_or_blank_variable() {
        for value in [None, Some(""), Some("   ")] {
            assert_eq!(
                refusal(value),
                "SQLITE_PATH must name the SQLite database file",
                "{value:?} names no file"
            );
        }
    }

    #[test]
    fn refuses_a_relative_path_naming_it() {
        assert_eq!(
            refusal(Some(" data/cube.db ")),
            "SQLITE_PATH must be an absolute path: data/cube.db",
            "the trimmed value is named"
        );
    }

    #[test]
    fn refuses_a_missing_parent_naming_it() {
        let directory = tempfile::tempdir().unwrap();
        let parent = directory.path().join("missing");
        let file = parent.join("cube.db");
        assert_eq!(
            refusal(file.to_str()),
            format!(
                "SQLite parent directory is missing or unwritable: {}",
                parent.display()
            ),
            "the parent is named"
        );
        assert!(!parent.exists(), "nothing is created");
    }

    #[test]
    fn refuses_an_unwritable_parent_naming_it() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let parent = directory.path().join("read-only");
        std::fs::create_dir(&parent).unwrap();
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o555)).unwrap();
        let file = parent.join("cube.db");
        assert_eq!(
            refusal(file.to_str()),
            format!(
                "SQLite parent directory is missing or unwritable: {}",
                parent.display()
            ),
            "the parent is named"
        );
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    // ST-126 gives the refusal of a missing file to the CLI alone.
    #[test]
    fn accepts_a_file_that_does_not_exist_and_creates_nothing() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("cube.db");
        let path = SqlitePath::from_variable(file.to_str()).unwrap();
        assert_eq!(path.as_path(), file, "the file is the one named");
        assert!(!file.exists(), "nothing is created");
    }

    #[test]
    fn names_each_refusal_by_kind() {
        assert!(
            matches!(SqlitePath::from_variable(None), Err(SqlitePathError::Unset)),
            "unset"
        );
        assert!(
            matches!(
                SqlitePath::from_variable(Some("cube.db")),
                Err(SqlitePathError::Relative(_))
            ),
            "relative"
        );
    }
}

fn open(path: &SqlitePath) -> SqliteSpaceRepository {
    SqliteSpaceRepository::open(path)
}

/// `store` holding the tracked fixture, put there through the lifecycle doors.
async fn seeded<R: SpaceRepository>(store: R) -> R {
    import_directory(
        &store,
        &TokioFilesystem,
        &http_conformance::fixture(),
        &Counted::default(),
    )
    .await
    .unwrap();
    store
}

fn meta() -> SpaceId {
    SpaceId::parse(META).unwrap()
}

/// A commit renaming `loaded` to `title`, at the revision it was read at.
fn rename(loaded: &LoadedSpace, title: &str) -> SpaceCommit {
    let mut snapshot = loaded.snapshot.clone();
    title.clone_into(&mut snapshot.document.title);
    SpaceCommit {
        changes: vec![SpaceChange::Update {
            space_id: snapshot.id,
            snapshot,
            expected_revision: loaded.revision,
        }],
    }
}

mod given_a_migrated_file {
    use super::*;

    #[tokio::test]
    async fn answers_uninitialized_and_lists_no_space() {
        let file = Migrated::new().await;
        let store = open(&file.path());
        assert_eq!(
            store.load_aggregate().await,
            Ok(AggregateLoad::Uninitialized),
            "nothing is stored yet"
        );
        assert_eq!(store.list_spaces().await, Ok(vec![]), "no Space");
        assert_eq!(store.load_meta_space_id().await, Ok(None), "no Meta Space");
    }

    // ST-128: the rollback journal in `delete` mode, set even over a file
    // another writer left in WAL mode, and `synchronous=FULL` on the
    // repository's own connections.
    #[tokio::test]
    async fn writes_in_rollback_journal_delete_mode_with_synchronous_full() {
        let file = Migrated::new().await;
        assert_eq!(
            on_file(&file.file, "PRAGMA journal_mode = WAL")
                .await
                .as_deref(),
            Some("wal"),
            "the file starts in WAL mode"
        );
        let store = open(&file.path());
        let settings = store.connection_settings().await.unwrap();
        assert_eq!(
            settings.journal_mode, "delete",
            "the repository's connection's journal mode"
        );
        assert_eq!(settings.synchronous, 2, "synchronous=FULL is 2");
        store.close().await;
        assert_eq!(
            on_file(&file.file, "PRAGMA journal_mode").await.as_deref(),
            Some("delete"),
            "the file is left in delete mode"
        );
    }

    #[tokio::test]
    async fn answers_a_file_that_does_not_exist_as_unavailable_creating_nothing() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("cube.db");
        let store = open(&SqlitePath::from_variable(file.to_str()).unwrap());
        assert!(
            matches!(
                store.load_aggregate().await,
                Err(RepositoryError::Unavailable(_))
            ),
            "a file that does not exist is not answering"
        );
        assert!(!file.exists(), "nothing is created");
    }
}

/// Each store answers the same script the same way: what ST-3 asks of the
/// one SQL repository, held against the memory store.
mod given_the_memory_store_and_a_sqlite_file {
    use super::*;

    /// Both stores, each holding the tracked fixture.
    async fn both() -> (MemorySpaceRepository, SqliteSpaceRepository, Migrated) {
        let file = Migrated::new().await;
        let sqlite = seeded(open(&file.path())).await;
        (seeded(MemorySpaceRepository::new()).await, sqlite, file)
    }

    async fn aggregate_of<R: SpaceRepository>(store: &R) -> AggregateInput {
        let AggregateLoad::Loaded(loaded) = store.load_aggregate().await.unwrap() else {
            panic!("the store holds an aggregate");
        };
        AggregateInput {
            meta_space_id: loaded.meta_space_id,
            spaces: loaded
                .spaces
                .into_iter()
                .map(|space| space.snapshot)
                .collect(),
        }
    }

    #[tokio::test]
    async fn read_the_same_aggregate_spaces_and_meta_identity() {
        let (memory, sqlite, _file) = both().await;
        assert_eq!(
            sqlite.load_aggregate().await,
            memory.load_aggregate().await,
            "the aggregate"
        );
        assert_eq!(
            sqlite.list_spaces().await,
            memory.list_spaces().await,
            "the Spaces"
        );
        for summary in memory.list_spaces().await.unwrap() {
            assert_eq!(
                sqlite.load_space(summary.id).await,
                memory.load_space(summary.id).await,
                "Space {}",
                summary.id
            );
        }
        let unknown = SpaceId::parse(http_conformance::UNKNOWN_SPACE).unwrap();
        assert_eq!(sqlite.load_space(unknown).await, Ok(None), "no such Space");
        assert_eq!(
            sqlite.load_meta_space_id().await,
            Ok(Some(meta())),
            "the Meta identity"
        );
    }

    #[tokio::test]
    async fn answer_commits_the_same_and_keep_what_they_wrote() {
        let (memory, sqlite, file) = both().await;
        let loaded = memory.load_space(meta()).await.unwrap().unwrap();
        for commit in [rename(&loaded, "Renamed"), rename(&loaded, "Stale")] {
            assert_eq!(
                sqlite.commit(commit.clone()).await,
                memory.commit(commit).await,
                "the commit's answer"
            );
        }
        let mut orphaned = rename(&loaded, "Orphaned");
        let other = memory
            .load_space(SpaceId::parse(http_conformance::FIXTURE_SPACES[1]).unwrap())
            .await
            .unwrap()
            .unwrap();
        orphaned.changes = vec![SpaceChange::Delete {
            space_id: meta(),
            expected_revision: Revision::new(1).unwrap(),
        }];
        assert_eq!(
            sqlite.commit(orphaned.clone()).await,
            memory.commit(orphaned).await,
            "a refused commit"
        );
        let create = SpaceCommit {
            changes: vec![SpaceChange::Create {
                space_id: other.snapshot.id,
                snapshot: other.snapshot,
            }],
        };
        assert_eq!(
            sqlite.commit(create.clone()).await,
            memory.commit(create).await,
            "a create the store will not judge"
        );
        assert_eq!(
            sqlite.load_aggregate().await,
            memory.load_aggregate().await,
            "what the commits left"
        );
        sqlite.close().await;
        let reopened = open(&file.path());
        assert_eq!(
            reopened.load_aggregate().await,
            memory.load_aggregate().await,
            "what the commits left, read again from the file"
        );
    }

    #[tokio::test]
    async fn store_and_load_assets_the_same() {
        let (memory, sqlite, _file) = both().await;
        let asset = StoredAsset {
            hash: AssetHash::of(b"picture"),
            media_type: "image/png".to_owned(),
            bytes: bytes::Bytes::from_static(b"picture"),
        };
        let later = StoredAsset {
            media_type: "image/gif".to_owned(),
            ..asset.clone()
        };
        for stored in [asset.clone(), later, StoredAsset::empty()] {
            assert_eq!(
                sqlite.store_asset(stored.clone()).await,
                memory.store_asset(stored).await,
                "storing an asset"
            );
        }
        assert_eq!(
            sqlite.store_asset(asset.clone()).await,
            Ok(AssetStored::Existing),
            "stored once"
        );
        for hash in [
            asset.hash.clone(),
            AssetHash::of(b"absent"),
            AssetHash::of(b""),
        ] {
            assert_eq!(
                sqlite.load_asset(&hash).await,
                memory.load_asset(&hash).await,
                "loading {hash:?}"
            );
        }
        assert_eq!(
            sqlite.load_asset(&asset.hash).await.unwrap(),
            Some(asset),
            "the first media type stands"
        );
    }

    #[tokio::test]
    async fn answer_the_lifecycle_doors_the_same() {
        let (memory, sqlite, _file) = both().await;
        let same = aggregate_of(&memory).await;
        let mut other = same.clone();
        "Another title".clone_into(&mut other.spaces[0].document.title);
        for input in [same.clone(), other.clone()] {
            let (left, right) = (
                sqlite.initialize_aggregate(input.clone()).await,
                memory.initialize_aggregate(input).await,
            );
            assert_eq!(left, right, "initializing an initialized store");
        }
        assert!(
            matches!(
                sqlite.initialize_aggregate(same.clone()).await,
                Ok(InitializeResult::Existing(_))
            ),
            "the same aggregate is existing"
        );
        let unknown = SpaceId::parse(http_conformance::UNKNOWN_SPACE).unwrap();
        for expected in [Some(unknown), None, Some(meta())] {
            assert_eq!(
                sqlite.replace_aggregate(other.clone(), expected).await,
                memory.replace_aggregate(other.clone(), expected).await,
                "replacing, expecting {expected:?}"
            );
        }
        assert_eq!(
            sqlite.load_aggregate().await,
            memory.load_aggregate().await,
            "what the replacement left"
        );
        let revision = Revision::new(0).unwrap();
        assert_eq!(
            sqlite.mark_exported(meta(), revision).await,
            memory.mark_exported(meta(), revision).await,
            "marking a Space exported"
        );
        assert_eq!(
            sqlite
                .load_space(meta())
                .await
                .unwrap()
                .unwrap()
                .exported_revision,
            Some(revision),
            "the exported revision is kept"
        );
        assert_eq!(
            sqlite.mark_exported(unknown, revision).await,
            memory.mark_exported(unknown, revision).await,
            "marking a Space no store holds"
        );
    }

    #[tokio::test]
    async fn refuse_and_answer_an_uninitialized_store_the_same() {
        let file = Migrated::new().await;
        let sqlite = open(&file.path());
        let memory = MemorySpaceRepository::new();
        let input = aggregate_of(&seeded(MemorySpaceRepository::new()).await).await;
        assert_eq!(
            sqlite.replace_aggregate(input.clone(), None).await,
            Ok(ReplaceResult::Uninitialized),
            "nothing to replace"
        );
        let mut refused = input.clone();
        refused.spaces.truncate(1);
        assert_eq!(
            sqlite.initialize_aggregate(refused.clone()).await,
            memory.initialize_aggregate(refused).await,
            "an aggregate intake refuses"
        );
        assert_eq!(
            sqlite.initialize_aggregate(input.clone()).await,
            memory.initialize_aggregate(input).await,
            "the first initialization"
        );
    }
}

/// The rows each runtime writes are the rows the other reads (ST-125): the
/// space document and each Resource document as JSON text, the revision as
/// decimal text.
mod given_rows_the_typescript_host_reads {
    use super::*;

    #[tokio::test]
    async fn writes_documents_as_json_and_revisions_as_decimal_text() {
        let file = Migrated::new().await;
        let store = seeded(open(&file.path())).await;
        let loaded = store.load_space(meta()).await.unwrap().unwrap();
        store.commit(rename(&loaded, "Renamed")).await.unwrap();
        store.close().await;
        assert_eq!(
            on_file(
                &file.file,
                &format!(
                    "SELECT revision || ' ' || json_extract(document, '$.title') FROM spaces WHERE id = '{META}'"
                )
            )
            .await
            .as_deref(),
            Some("1 Renamed"),
            "the revision and the title as stored"
        );
        assert_eq!(
            on_file(
                &file.file,
                "SELECT meta_space_id FROM repository_state WHERE singleton_id = 1"
            )
            .await
            .as_deref(),
            Some(META),
            "the Meta identity as stored"
        );
    }
}

/// ST-127: one operation at a time inside the process, and a file another
/// process holds answered as unavailable.
mod given_contention {
    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn answers_overlapping_edits_to_one_space_as_one_commit_and_conflicts() {
        let file = Migrated::new().await;
        let store = Arc::new(seeded(open(&file.path())).await);
        let loaded = store.load_space(meta()).await.unwrap().unwrap();
        let edits = (0..8).map(|index| {
            let store = Arc::clone(&store);
            let commit = rename(&loaded, &format!("Edit {index}"));
            tokio::spawn(async move { store.commit(commit).await })
        });
        let mut committed = 0;
        let mut conflicts = 0;
        for edit in edits {
            match edit.await.unwrap() {
                Ok(CommitResult::Committed { .. }) => committed += 1,
                Ok(CommitResult::Conflict(_)) => conflicts += 1,
                other => panic!("an overlapping edit answers {other:?}"),
            }
        }
        assert_eq!(
            (committed, conflicts),
            (1, 7),
            "one lands, the rest conflict"
        );
        assert_eq!(
            store.load_space(meta()).await.unwrap().unwrap().revision,
            Revision::new(1).unwrap(),
            "one revision was written"
        );
    }

    #[tokio::test]
    async fn fails_reads_and_writes_against_another_processes_lock_as_unavailable() {
        let file = Migrated::new().await;
        let store = seeded(SqliteSpaceRepository::open_with_busy_timeout(
            &file.path(),
            Duration::from_millis(50),
        ))
        .await;
        let loaded = store.load_space(meta()).await.unwrap().unwrap();
        let holder = hold_exclusive_lock(&file.file).await;

        let read = store.load_aggregate().await;
        assert!(
            matches!(read, Err(RepositoryError::Unavailable(_))),
            "a read waits out the busy timeout and fails: {read:?}"
        );
        let write = store.commit(rename(&loaded, "Blocked")).await;
        assert!(
            matches!(write, Err(RepositoryError::Unavailable(_))),
            "a write waits out the busy timeout and fails: {write:?}"
        );

        sqlx::Connection::close(holder).await.unwrap();
        assert_eq!(
            store.load_space(meta()).await.unwrap(),
            Some(loaded.clone()),
            "nothing of the failed write was written"
        );
        assert!(
            matches!(
                store.commit(rename(&loaded, "After")).await,
                Ok(CommitResult::Committed { .. })
            ),
            "no lock is left behind: the next write lands"
        );
    }

    #[tokio::test]
    async fn waits_out_a_lock_let_go_inside_the_busy_timeout() {
        let file = Migrated::new().await;
        let store = seeded(SqliteSpaceRepository::open_with_busy_timeout(
            &file.path(),
            Duration::from_secs(5),
        ))
        .await;
        let loaded = store.load_space(meta()).await.unwrap().unwrap();
        let holder = hold_exclusive_lock(&file.file).await;
        let release = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            sqlx::Connection::close(holder).await.unwrap();
        });
        assert!(
            matches!(
                store.commit(rename(&loaded, "Waited")).await,
                Ok(CommitResult::Committed { .. })
            ),
            "the write lands once the other lock clears"
        );
        release.await.unwrap();
    }
}

/// ST-7: stored state no aggregate can be read from fails as broken, and is
/// not repaired.
mod given_broken_stored_state {
    use super::*;

    #[tokio::test]
    async fn fails_spaces_without_a_meta_identity_as_broken() {
        let file = Migrated::new().await;
        let store = seeded(open(&file.path())).await;
        store.close().await;
        execute(&file.file, "DELETE FROM repository_state").await;
        let store = open(&file.path());
        assert!(
            matches!(
                store.load_aggregate().await,
                Err(RepositoryError::BrokenStoredState(_))
            ),
            "Spaces with no Meta identity"
        );
        assert!(
            matches!(
                store
                    .initialize_aggregate(AggregateInput {
                        meta_space_id: meta(),
                        spaces: vec![],
                    })
                    .await,
                Ok(InitializeResult::AggregateRefused(_))
            ),
            "an empty input is refused before the store is read"
        );
    }

    #[tokio::test]
    async fn fails_a_document_that_is_not_json_or_a_revision_that_is_not_canonical() {
        for statement in [
            format!("UPDATE spaces SET document = 'not json' WHERE id = '{META}'"),
            format!("UPDATE spaces SET revision = '01' WHERE id = '{META}'"),
        ] {
            let file = Migrated::new().await;
            let store = seeded(open(&file.path())).await;
            store.close().await;
            execute(&file.file, &statement).await;
            let store = open(&file.path());
            for (what, answer) in [
                ("the aggregate", store.load_aggregate().await.map(drop)),
                ("the Space", store.load_space(meta()).await.map(drop)),
            ] {
                assert!(
                    matches!(answer, Err(RepositoryError::BrokenStoredState(_))),
                    "{what} after `{statement}`: {answer:?}"
                );
            }
        }
    }
}
