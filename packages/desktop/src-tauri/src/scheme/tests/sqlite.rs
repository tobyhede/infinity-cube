//! The scheme handler over the SQLite repository (ADR 0181): a Space window
//! on a SQLite file, served by the application [`open_database`] composes,
//! on a fresh migrated file seeded with the tracked fixture through the
//! lifecycle doors. Through it, the HTTP conformance cases
//! `crates/http-conformance` writes once, generated here by its `cases!`;
//! and what opening a file does when it is not one the shell can serve.

use std::path::PathBuf;

use host::{SqlitePath, SqliteSpaceRepository, TokioFilesystem, import_directory};
use http_conformance::Counted;

use super::*;
use crate::database::Database;
use crate::server::{Repository, close_database, first_address, open_database};
use crate::test_support::migrated_sqlite_file;

/// A Space window on a SQLite file, served through the scheme.
struct Sqlite {
    open_aggregates: OpenAggregates,
    address: AggregateAddress,
    repository: Repository,
    _temporary: TempDir,
}

/// A migrated file in a directory of its own.
async fn migrated() -> (TempDir, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let file = temporary.path().join("cube.db");
    migrated_sqlite_file(&file).await;
    (temporary, file)
}

impl http_conformance::Adapter for Sqlite {
    async fn open() -> Self {
        let (temporary, file) = migrated().await;
        let seeding =
            SqliteSpaceRepository::open(&SqlitePath::from_variable(file.to_str()).unwrap());
        import_directory(
            &seeding,
            &TokioFilesystem,
            &http_conformance::fixture(),
            &Counted::default(),
        )
        .await
        .unwrap();
        seeding.close().await;
        let database = Database::sqlite_file(&file);
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let (application, repository) = open_database(&database, shell).await.unwrap();
        let address = AggregateAddress::new(database.key(), SchemeStyle::HostPerAggregate);
        let open_aggregates = OpenAggregates::new(SchemeStyle::HostPerAggregate);
        open_aggregates.open(address.clone(), application, WINDOW);
        Self {
            open_aggregates,
            address,
            repository,
            _temporary: temporary,
        }
    }

    /// As WebKitGTK sends a page's request to its own origin under a custom
    /// scheme: at the Space's origin, naming the page as its `Referer`.
    async fn send(&self, request: Request<Bytes>) -> Response<Bytes> {
        let (mut parts, body) = request.into_parts();
        let origin = self.address.origin();
        parts.uri = format!("{origin}{}", parts.uri).parse().unwrap();
        let _added = parts.headers.append(
            REFERER,
            HeaderValue::from_str(&format!("{origin}{META_ADDRESS}")).unwrap(),
        );
        self.open_aggregates
            .answer(WINDOW, Request::from_parts(parts, body.to_vec()))
            .await
            .map(Bytes::from)
    }

    fn own_origin(&self) -> String {
        self.address.origin()
    }

    fn own_address(&self) -> Vec<(&'static str, String)> {
        Vec::new()
    }

    async fn close(self) {
        let _windows =
            close_database(&self.open_aggregates, self.address.key(), &self.repository).await;
    }
}

http_conformance::cases!(Sqlite);

mod given_a_sqlite_file_to_open {
    use super::*;

    #[tokio::test]
    async fn establishes_the_meta_space_of_a_migrated_file_holding_none_and_opens_at_it() {
        let (temporary, file) = migrated().await;
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let (application, repository) = open_database(&Database::sqlite_file(&file), shell)
            .await
            .expect("a migrated file opens");
        let first = first_address(&application).await;
        assert!(
            first.starts_with("/spaces/"),
            "the window opens at the Meta Space established from Default Content, not {first}"
        );
        repository.close().await;
    }

    #[tokio::test]
    async fn refuses_a_file_that_has_not_been_migrated_naming_the_migration() {
        let temporary = tempfile::tempdir().unwrap();
        let file = temporary.path().join("cube.db");
        std::fs::write(&file, b"").unwrap();
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let refused = open_database(&Database::sqlite_file(&file), shell)
            .await
            .expect_err("an unmigrated file is not served");
        assert!(
            refused.contains("pnpm db:migrate:sqlite"),
            "the refusal names what to run: {refused}"
        );
        assert_eq!(
            std::fs::metadata(&file).unwrap().len(),
            0,
            "the shell migrates nothing"
        );
    }

    #[tokio::test]
    async fn refuses_a_file_that_does_not_exist_and_creates_none() {
        let temporary = tempfile::tempdir().unwrap();
        let file = temporary.path().join("missing.db");
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let refused = open_database(&Database::sqlite_file(&file), shell)
            .await
            .expect_err("a missing file is not served");
        assert!(
            refused.contains(&file.display().to_string()),
            "the refusal names the file: {refused}"
        );
        assert!(!file.exists(), "the shell never creates a SQLite file");
    }
}
