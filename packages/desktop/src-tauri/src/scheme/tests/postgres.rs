//! The scheme handler over the PostgreSQL repository (ADR 0181): a Space
//! window on a PostgreSQL database, served by the application
//! [`open_database`] composes, on a fresh migrated database of the test's own
//! seeded with the tracked fixture through the lifecycle doors. Through it,
//! the HTTP conformance cases `crates/http-conformance` writes once,
//! generated here by its `cases!`; and what opening a database does when it
//! is not one the shell can serve.
//!
//! Every test needing a server is `#[ignore]`d, as every PostgreSQL test of
//! `crates/host` is, and runs in CI's `rust` job against the server
//! `INFINITY_CUBE_POSTGRES_TEST_URL` names; run that way with the variable
//! unset, it panics rather than passing having tested nothing.

use host::{PostgresSpaceRepository, TokioFilesystem, import_directory};
use http_conformance::Counted;

use super::*;
use crate::database::{Database, PostgresDatabase};
use crate::server::{Repository, close_database, first_address, open_database};
use crate::test_support::FreshPostgres;

/// A Space window on a PostgreSQL database, served through the scheme.
struct Postgres {
    open_aggregates: OpenAggregates,
    address: AggregateAddress,
    repository: Repository,
    database: FreshPostgres,
    _temporary: TempDir,
}

/// `database` as the Start window's form names it.
fn named(database: &FreshPostgres) -> Database {
    Database::Postgres(PostgresDatabase::from_form(database.url.as_str(), "").unwrap())
}

impl http_conformance::Adapter for Postgres {
    async fn open() -> Self {
        let database = FreshPostgres::new(true).await;
        let opened = named(&database);
        let Database::Postgres(postgres) = &opened else {
            unreachable!("named as a PostgreSQL database")
        };
        let seeding = PostgresSpaceRepository::open(postgres.connect_url()).unwrap();
        import_directory(
            &seeding,
            &TokioFilesystem,
            &http_conformance::fixture(),
            &Counted::default(),
        )
        .await
        .unwrap();
        seeding.close().await;
        let temporary = tempfile::tempdir().unwrap();
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let (application, repository) = open_database(&opened, shell).await.unwrap();
        let address = AggregateAddress::new(opened.key(), SchemeStyle::HostPerAggregate);
        let open_aggregates = OpenAggregates::new(SchemeStyle::HostPerAggregate);
        open_aggregates.open(address.clone(), application, WINDOW);
        Self {
            open_aggregates,
            address,
            repository,
            database,
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

    /// `jsonb` holds an object's keys shorter first, then by their bytes.
    fn stored_key_order(mut written: Vec<String>) -> Vec<String> {
        written.sort_by(|left, right| left.len().cmp(&right.len()).then(left.cmp(right)));
        written
    }

    async fn close(self) {
        let _windows =
            close_database(&self.open_aggregates, self.address.key(), &self.repository).await;
        self.database.drop_database().await;
    }
}

http_conformance::cases!(Postgres, #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]);

mod given_a_postgresql_database_to_open {
    use super::*;

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn establishes_the_meta_space_of_a_migrated_database_holding_none_and_opens_at_it() {
        let database = FreshPostgres::new(true).await;
        let temporary = tempfile::tempdir().unwrap();
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let (application, repository) = open_database(&named(&database), shell)
            .await
            .expect("a migrated database opens");
        let first = first_address(&application).await;
        assert!(
            first.starts_with("/spaces/"),
            "the window opens at the Meta Space established from Default Content, not {first}"
        );
        repository.close().await;
        database.drop_database().await;
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_a_database_that_has_not_been_migrated_naming_the_migration() {
        let database = FreshPostgres::new(false).await;
        let temporary = tempfile::tempdir().unwrap();
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let refused = open_database(&named(&database), shell)
            .await
            .expect_err("an unmigrated database is not served");
        assert!(
            refused.contains("pnpm db:migrate,"),
            "the refusal names what to run: {refused}"
        );
        if let Some(password) = database.url.password() {
            assert!(
                !refused.contains(password),
                "the refusal names the database without its password: {refused}"
            );
        }
        database.drop_database().await;
    }

    #[tokio::test]
    async fn refuses_a_database_that_does_not_answer_naming_it_without_its_password() {
        let temporary = tempfile::tempdir().unwrap();
        let shell = built_shell(&stand_in_build(&temporary)).unwrap();
        let database = Database::Postgres(
            PostgresDatabase::from_form("postgres://cube@127.0.0.1:1/cube", "hunter2").unwrap(),
        );
        let refused = open_database(&database, shell)
            .await
            .expect_err("a database that does not answer is not served");
        assert!(
            refused.contains("postgres://cube@127.0.0.1:1/cube"),
            "the refusal names the database by its kept URL: {refused}"
        );
        assert!(
            !refused.contains("hunter2") && !refused.contains("migrate"),
            "no password, and no migration for a database that did not answer: {refused}"
        );
    }
}
