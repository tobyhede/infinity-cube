//! The PostgreSQL store against a server that will not serve it (ADR 0177):
//! one that refuses connections, refuses this client at the handshake, or
//! hangs up, through the real driver and pool, and what start-up and the
//! HTTP application make of each.
//!
//! Each connect-time case runs twice. `sqlx`'s pool tries a refused
//! connection, `53300` and `57P03` again until its acquire timeout and then
//! answers only `PoolTimedOut`, so through the repository the case asserts
//! the answer TypeScript's does, within the acquire timeout and a margin.
//! Over one direct connection to the same server it hands the driver's own
//! error to `classify`, so the code itself is observed. Every other connect
//! failure surfaces at once.
//!
//! The stand-in cases need no database. The rest need the server
//! `INFINITY_CUBE_POSTGRES_TEST_URL` names, logging in by password, and are
//! ignored by default.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod postgres_support;

use std::collections::BTreeMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bytes::Bytes;
use host::{
    AggregateInput, Application, Clock, DatabaseUrl, EstablishError, LoadedSpace, PoolSettings,
    PostgresSpaceRepository, Probe, RepositoryError, Revision, Shell, SpaceChange, SpaceCommit,
    SpaceRepository, Step, TokioFilesystem, classify_postgres, import_directory, keep_establishing,
    postgres_connect_options,
};
use http::Request;
use http_conformance::Counted;
use http_conformance::support::json_of;
use intake::SpaceId;
use postgres_support::Fresh;
use postgres_support::stand_in::{Behaviour, REFUSING, StandIn};
use sqlx::{ConnectOptions as _, PgConnection};
use tokio::sync::Notify;

const SPACE_ID: &str = "d0000000-0000-4000-8000-000000000001";

/// The Presentation Space of the tracked fixture.
const PRESENTATION: &str = "00000000-0000-4000-8000-000000000060";

/// How long past the pool's acquire timeout an outage may take to answer.
const MARGIN: Duration = Duration::from_secs(3);

fn space(id: &str) -> SpaceId {
    SpaceId::parse(id).unwrap()
}

fn url(text: &str) -> DatabaseUrl {
    DatabaseUrl::parse(Some(text)).unwrap()
}

fn open(url: &DatabaseUrl) -> PostgresSpaceRepository {
    PostgresSpaceRepository::open(url).unwrap()
}

/// A Space of no Resources, as JSON intake reads it.
fn meta() -> intake::SpaceSnapshot {
    let json = format!(
        r#"{{"id":"{SPACE_ID}","document":{{"version":1,"title":"Meta"}},"resources":[]}}"#
    );
    let value = intake::json::parse(&json).unwrap();
    intake::decode_space_snapshot(&value, space(SPACE_ID)).unwrap()
}

/// What the repository answers `operation`, and how long it took.
async fn timed<T, Fut>(operation: Fut) -> (Result<T, RepositoryError>, Duration)
where
    Fut: Future<Output = Result<T, RepositoryError>>,
{
    let started = Instant::now();
    let answer = operation.await;
    (answer, started.elapsed())
}

/// The failure `operation` answers.
fn failure<T: std::fmt::Debug>(answer: Result<T, RepositoryError>) -> RepositoryError {
    answer.expect_err("the operation fails")
}

/// Assert `error` Unreachable, answered within the acquire timeout and the
/// margin.
fn assert_unreachable_in_time(error: &RepositoryError, took: Duration) {
    assert!(
        matches!(error, RepositoryError::Unavailable(_)),
        "unreachable: {error:?}"
    );
    assert!(
        took < PoolSettings::default().acquire_timeout + MARGIN,
        "answered within the acquire timeout and a margin: {took:?}"
    );
}

/// Assert `error` Unclassified naming `code`, answered before the pool's
/// acquire timeout would have passed.
fn assert_unclassified_at_once(error: &RepositoryError, took: Duration, code: &str) {
    let RepositoryError::Unclassified(words) = error else {
        panic!("unclassified: {error:?}");
    };
    assert!(words.contains(code), "names {code}: {words}");
    assert!(
        took < PoolSettings::default().acquire_timeout,
        "answered at once, not retried: {took:?}"
    );
}

/// What one direct connection to `url`, outside any pool, fails with.
async fn connecting(url: &DatabaseUrl) -> sqlx::Error {
    let options = postgres_connect_options(url.as_str()).unwrap();
    options
        .connect()
        .await
        .map(|_: PgConnection| ())
        .expect_err("the connection is refused")
}

fn code_of(error: &sqlx::Error) -> Option<String> {
    error
        .as_database_error()
        .and_then(|database| database.code().map(|code| code.into_owned()))
}

/// The Space API over `store`, with no built application.
fn application(
    store: PostgresSpaceRepository,
) -> Application<PostgresSpaceRepository, Counted, BTreeMap<String, Bytes>> {
    Application::new(
        Arc::new(store),
        Counted::default(),
        Shell::new("<!doctype html>", BTreeMap::new()),
    )
}

/// Assert both direct reads answer `status` with the problem `code`.
async fn assert_direct_reads(
    application: &Application<PostgresSpaceRepository, Counted, BTreeMap<String, Bytes>>,
    status: u16,
    code: &str,
) {
    for path in ["/api/spaces".to_owned(), format!("/api/spaces/{SPACE_ID}")] {
        let request = Request::get(&path)
            .body(http_body_util::Full::new(Bytes::new()))
            .unwrap();
        let response = application.handle(request).await;
        assert_eq!(response.status(), status, "{path}");
        assert_eq!(
            response
                .headers()
                .get("content-type")
                .and_then(|value| value.to_str().ok()),
            Some("application/problem+json"),
            "{path}"
        );
        assert_eq!(
            json_of(&response)["type"],
            format!("urn:infinity-cube:problem:{code}"),
            "{path}"
        );
    }
}

mod given_a_server_that_refuses_connections {
    use super::*;

    // The pool answers only `PoolTimedOut`, so the driver's own error is
    // observed over a direct connection instead.
    // Case: names the aggregate read unavailable, keeping the driver error on cause
    #[tokio::test]
    async fn names_the_aggregate_read_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.load_aggregate()).await;
        assert_unreachable_in_time(&failure(answer), took);
        let direct = connecting(&url(REFUSING)).await;
        assert!(
            matches!(&direct, sqlx::Error::Io(io) if io.kind() == std::io::ErrorKind::ConnectionRefused),
            "{direct:?}"
        );
        assert!(matches!(
            classify_postgres(&direct),
            RepositoryError::Unavailable(_)
        ));
        store.close().await;
    }

    // Case: names a commit unavailable
    #[tokio::test]
    async fn names_a_commit_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.commit(SpaceCommit {
            changes: vec![SpaceChange::Create {
                space_id: space(SPACE_ID),
                snapshot: meta(),
            }],
        }))
        .await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: names establishment unavailable
    #[tokio::test]
    async fn names_establishment_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.initialize_aggregate(AggregateInput {
            meta_space_id: space(SPACE_ID),
            spaces: vec![meta()],
        }))
        .await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: names %s unavailable, keeping the refusal on the cause chain
    #[tokio::test]
    async fn names_list_spaces_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.list_spaces()).await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: names %s unavailable, keeping the refusal on the cause chain
    #[tokio::test]
    async fn names_load_space_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.load_space(space(SPACE_ID))).await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: names %s unavailable, keeping the refusal on the cause chain
    #[tokio::test]
    async fn names_load_meta_space_id_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.load_meta_space_id()).await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: names %s unavailable, keeping the refusal on the cause chain
    #[tokio::test]
    async fn names_mark_exported_unavailable() {
        let store = open(&url(REFUSING));
        let (answer, took) =
            timed(store.mark_exported(space(SPACE_ID), Revision::new(1).unwrap())).await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // `sqlx` keeps no cause chain; a commit whose server refuses it is
    // classified by the failure itself.
    // Case: walks the cause chain to %s
    #[tokio::test]
    async fn names_a_commit_unavailable_when_its_socket_is_refused() {
        let store = open(&url(REFUSING));
        let (answer, took) = timed(store.commit(SpaceCommit {
            changes: vec![SpaceChange::Delete {
                space_id: space(SPACE_ID),
                expected_revision: Revision::FIRST,
            }],
        }))
        .await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: answers a refused connection on a direct read 503 persistence-unavailable
    #[tokio::test]
    async fn answers_a_refused_connection_on_a_direct_read_503_persistence_unavailable() {
        let application = application(open(&url(REFUSING)));
        assert_direct_reads(&application, 503, "persistence-unavailable").await;
    }
}

mod given_a_server_that_hangs_up {
    use super::*;

    #[tokio::test]
    async fn names_a_connection_closed_with_a_fin_unavailable_at_once() {
        let server = StandIn::start(Behaviour::Fin).await;
        let store = open(&server.url());
        let (answer, took) = timed(store.list_spaces()).await;
        let error = failure(answer);
        assert!(
            matches!(error, RepositoryError::Unavailable(_)),
            "{error:?}"
        );
        assert!(took < PoolSettings::default().acquire_timeout, "{took:?}");
        let direct = connecting(&server.url()).await;
        assert!(
            matches!(&direct, sqlx::Error::Io(io) if io.kind() == std::io::ErrorKind::UnexpectedEof),
            "a closed connection reads UnexpectedEof: {direct:?}"
        );
        assert!(matches!(
            classify_postgres(&direct),
            RepositoryError::Unavailable(_)
        ));
        store.close().await;
    }

    #[tokio::test]
    async fn names_a_connection_closed_with_an_rst_unavailable_at_once() {
        let server = StandIn::start(Behaviour::Reset).await;
        let store = open(&server.url());
        let (answer, took) = timed(store.list_spaces()).await;
        let error = failure(answer);
        assert!(
            matches!(error, RepositoryError::Unavailable(_)),
            "{error:?}"
        );
        assert!(took < PoolSettings::default().acquire_timeout, "{took:?}");
        assert!(matches!(
            classify_postgres(&connecting(&server.url()).await),
            RepositoryError::Unavailable(_)
        ));
        store.close().await;
    }
}

mod given_a_server_that_refuses_this_client {
    use super::*;

    const WRONG_PASSWORD: (&str, &str) = (
        "28P01",
        "password authentication failed for user \"infinity_cube\"",
    );
    const NO_HBA_ENTRY: (&str, &str) = (
        "28000",
        "no pg_hba.conf entry for host \"127.0.0.1\", user \"infinity_cube\", database \"infinity_cube\"",
    );
    const MISSING_DATABASE: (&str, &str) = ("3D000", "database \"infinity_cube\" does not exist");
    const TOO_MANY_CLIENTS: (&str, &str) = ("53300", "sorry, too many clients already");
    const STARTING_UP: (&str, &str) = ("57P03", "the database system is starting up");

    async fn refusing((code, words): (&'static str, &'static str)) -> StandIn {
        StandIn::start(Behaviour::Refuse(code, words)).await
    }

    /// The configuration refusal `refusal`, unclassified inside and outside
    /// a transaction, at once, and over a direct connection.
    async fn leaves_unclassified(refusal: (&'static str, &'static str)) {
        let server = refusing(refusal).await;
        let store = open(&server.url());
        let (answer, took) = timed(store.load_aggregate()).await;
        assert_unclassified_at_once(&failure(answer), took, refusal.0);
        let (answer, took) = timed(store.list_spaces()).await;
        assert_unclassified_at_once(&failure(answer), took, refusal.0);
        directly(&server, refusal.0, false).await;
        store.close().await;
    }

    /// The outage `refusal`, unreachable inside and outside a transaction,
    /// within the acquire timeout and a margin, and over a direct connection.
    async fn names_unreachable(refusal: (&'static str, &'static str)) {
        let server = refusing(refusal).await;
        let store = open(&server.url());
        let (answer, took) = timed(store.load_aggregate()).await;
        assert_unreachable_in_time(&failure(answer), took);
        let (answer, took) = timed(store.list_spaces()).await;
        assert_unreachable_in_time(&failure(answer), took);
        directly(&server, refusal.0, true).await;
        store.close().await;
    }

    /// Over one direct connection, the driver's error carries `code` and
    /// `classify` names it as `unreachable` says.
    async fn directly(server: &StandIn, code: &str, unreachable: bool) {
        let error = connecting(&server.url()).await;
        assert_eq!(code_of(&error).as_deref(), Some(code), "{error:?}");
        let classified = classify_postgres(&error);
        assert_eq!(
            matches!(classified, RepositoryError::Unavailable(_)),
            unreachable,
            "{code}: {classified:?}"
        );
        assert!(
            unreachable || matches!(classified, RepositoryError::Unclassified(_)),
            "{code}: {classified:?}"
        );
    }

    // Case: leaves SQLSTATE %s unclassified inside and outside a transaction
    #[tokio::test]
    async fn leaves_a_wrong_password_unclassified_inside_and_outside_a_transaction() {
        leaves_unclassified(WRONG_PASSWORD).await;
    }

    // Case: leaves SQLSTATE %s unclassified inside and outside a transaction
    #[tokio::test]
    async fn leaves_no_hba_entry_unclassified_inside_and_outside_a_transaction() {
        leaves_unclassified(NO_HBA_ENTRY).await;
    }

    // Case: leaves SQLSTATE %s unclassified inside and outside a transaction
    #[tokio::test]
    async fn leaves_a_missing_database_unclassified_inside_and_outside_a_transaction() {
        leaves_unclassified(MISSING_DATABASE).await;
    }

    // Case: names SQLSTATE %s unavailable inside and outside a transaction
    #[tokio::test]
    async fn names_too_many_clients_unavailable_inside_and_outside_a_transaction() {
        names_unreachable(TOO_MANY_CLIENTS).await;
    }

    // Case: names SQLSTATE %s unavailable inside and outside a transaction
    #[tokio::test]
    async fn names_a_server_starting_up_unavailable_inside_and_outside_a_transaction() {
        names_unreachable(STARTING_UP).await;
    }

    // Case: recognises SQLSTATE %s raised while connecting
    #[tokio::test]
    async fn recognises_too_many_clients_raised_while_connecting() {
        directly(&refusing(TOO_MANY_CLIENTS).await, "53300", true).await;
    }

    // Case: recognises SQLSTATE %s raised while connecting
    #[tokio::test]
    async fn recognises_a_server_starting_up_raised_while_connecting() {
        directly(&refusing(STARTING_UP).await, "57P03", true).await;
    }

    // Case: leaves SQLSTATE %s raised while connecting unclassified
    #[tokio::test]
    async fn leaves_a_wrong_password_raised_while_connecting_unclassified() {
        directly(&refusing(WRONG_PASSWORD).await, "28P01", false).await;
    }

    // Case: leaves SQLSTATE %s raised while connecting unclassified
    #[tokio::test]
    async fn leaves_no_hba_entry_raised_while_connecting_unclassified() {
        directly(&refusing(NO_HBA_ENTRY).await, "28000", false).await;
    }

    // Case: leaves SQLSTATE %s raised while connecting unclassified
    #[tokio::test]
    async fn leaves_a_missing_database_raised_while_connecting_unclassified() {
        directly(&refusing(MISSING_DATABASE).await, "3D000", false).await;
    }

    // `sqlx` keeps no cause chain; a commit meeting a server not yet
    // accepting connections is classified by the failure itself.
    // Case: walks the cause chain to %s
    #[tokio::test]
    async fn names_a_commit_unavailable_when_the_server_is_starting_up() {
        let server = refusing(STARTING_UP).await;
        let store = open(&server.url());
        let (answer, took) = timed(store.commit(SpaceCommit {
            changes: vec![SpaceChange::Create {
                space_id: space(SPACE_ID),
                snapshot: meta(),
            }],
        }))
        .await;
        assert_unreachable_in_time(&failure(answer), took);
        store.close().await;
    }

    // Case: answers a wrong password on a direct read 500 internal-error
    #[tokio::test]
    async fn answers_a_wrong_password_on_a_direct_read_500_internal_error() {
        let server = refusing(WRONG_PASSWORD).await;
        let application = application(open(&server.url()));
        assert_direct_reads(&application, 500, "internal-error").await;
    }
}

/// A clock that records each wait and returns at once, until `limit` waits
/// have passed; the next never returns, and says so.
struct Stopping {
    waits: Mutex<Vec<u64>>,
    limit: usize,
    stopped: Arc<Notify>,
}

impl Stopping {
    fn new(limit: usize) -> Self {
        Self {
            waits: Mutex::new(Vec::new()),
            limit,
            stopped: Arc::new(Notify::new()),
        }
    }

    fn waits(&self) -> Vec<u64> {
        self.waits.lock().unwrap().clone()
    }
}

impl Clock for Stopping {
    fn sleep(&self, duration: Duration) -> impl Future<Output = ()> + Send {
        let stop = {
            let mut waits = self.waits.lock().unwrap();
            waits.push(duration.as_secs());
            waits.len() > self.limit
        };
        let stopped = Arc::clone(&self.stopped);
        async move {
            if stop {
                stopped.notify_one();
                std::future::pending::<()>().await;
            }
        }
    }
}

/// Start-up over `store` until it stops or `clock` stops it: its answer, if
/// it stopped by itself, and every failure it reported.
async fn starting<R: SpaceRepository>(
    store: &R,
    clock: &Stopping,
) -> (Option<Result<SpaceId, EstablishError>>, Vec<EstablishError>) {
    let mut reported = Vec::new();
    let ids = Counted::default();
    let answer = {
        let establishing = keep_establishing(store, &ids, clock, |failure| {
            reported.push(failure.clone());
        });
        tokio::select! {
            answer = establishing => Some(answer),
            () = clock.stopped.notified() => None,
        }
    };
    (answer, reported)
}

fn unclassified_naming(failure: &EstablishError, code: &str) -> bool {
    matches!(
        failure,
        EstablishError::Repository(RepositoryError::Unclassified(words)) if words.contains(code)
    )
}

mod given_start_up_over_a_server_that_refuses_this_client {
    use super::*;

    // Case: gives up on a wrong password once a second attempt confirms it
    #[tokio::test]
    async fn gives_up_on_a_wrong_password_once_a_second_attempt_confirms_it() {
        let server = StandIn::start(Behaviour::Refuse(
            "28P01",
            "password authentication failed for user \"infinity_cube\"",
        ))
        .await;
        let store = open(&server.url());
        let clock = Stopping::new(5);
        let (answer, reported) = starting(&store, &clock).await;
        let answer = answer.expect("start-up stopped by itself");
        assert!(
            answer
                .as_ref()
                .is_err_and(|failure| unclassified_naming(failure, "28P01")),
            "{answer:?}"
        );
        assert_eq!(clock.waits(), [5, 10]);
        assert_eq!(
            reported.len(),
            3,
            "the first attempt and two that confirm it"
        );
        assert!(
            reported
                .iter()
                .all(|failure| unclassified_naming(failure, "28P01")),
            "{reported:?}"
        );
        store.close().await;
    }

    // Case: keeps waiting out too many connections past the confirming limit
    #[tokio::test]
    async fn keeps_waiting_out_too_many_connections_past_the_confirming_limit() {
        let server = StandIn::start(Behaviour::Refuse(
            "53300",
            "sorry, too many clients already",
        ))
        .await;
        // A short acquire timeout, so five outages take a second.
        let store = PostgresSpaceRepository::open_with(
            &server.url(),
            PoolSettings {
                acquire_timeout: Duration::from_millis(200),
                ..PoolSettings::default()
            },
        )
        .unwrap();
        let clock = Stopping::new(5);
        let (answer, reported) = starting(&store, &clock).await;
        assert!(answer.is_none(), "an outage never gives up: {answer:?}");
        assert_eq!(reported.len(), 6, "the first attempt and five retries");
        assert!(
            reported.iter().all(|failure| matches!(
                failure,
                EstablishError::Repository(RepositoryError::Unavailable(_))
            )),
            "{reported:?}"
        );
        store.close().await;
    }
}

/// `database`'s URL with a password its server will not accept.
fn wrong_password(database: &Fresh) -> DatabaseUrl {
    let mut url = database.url.clone();
    let password = format!("{}-not-the-password", url.password().unwrap_or_default());
    url.set_password(Some(&password)).unwrap();
    DatabaseUrl::parse(Some(url.as_str())).unwrap()
}

/// The server's URL naming a database it does not have.
fn missing_database() -> DatabaseUrl {
    let url = postgres_support::naming(&postgres_support::server(), "infinity_cube_absent");
    DatabaseUrl::parse(Some(url.as_str())).unwrap()
}

/// Ports of `postgres-misconfiguration.test.ts`, against a real server that
/// refuses this client for real.
mod given_a_real_server_that_refuses_this_client {
    use super::*;

    // Case: leaves the transactional aggregate read unclassified with the raw handshake refusal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn leaves_the_aggregate_read_unclassified_given_a_wrong_password() {
        let database = Fresh::new().await;
        let store = open(&wrong_password(&database));
        let (answer, took) = timed(store.load_aggregate()).await;
        assert_unclassified_at_once(&failure(answer), took, "28P01");
        store.close().await;
    }

    // Case: leaves the transactional aggregate read unclassified with the raw handshake refusal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn leaves_the_aggregate_read_unclassified_given_a_database_that_does_not_exist() {
        let store = open(&missing_database());
        let (answer, took) = timed(store.load_aggregate()).await;
        assert_unclassified_at_once(&failure(answer), took, "3D000");
        store.close().await;
    }

    // Case: leaves a direct read unclassified with the normalised refusal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn leaves_a_direct_read_unclassified_given_a_wrong_password() {
        let database = Fresh::new().await;
        let store = open(&wrong_password(&database));
        let (answer, took) = timed(store.list_spaces()).await;
        assert_unclassified_at_once(&failure(answer), took, "28P01");
        store.close().await;
    }

    // Case: leaves a direct read unclassified with the normalised refusal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn leaves_a_direct_read_unclassified_given_a_database_that_does_not_exist() {
        let store = open(&missing_database());
        let (answer, took) = timed(store.list_spaces()).await;
        assert_unclassified_at_once(&failure(answer), took, "3D000");
        store.close().await;
    }

    // Case: gives up once a second attempt confirms the refusal
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn gives_up_once_a_second_attempt_confirms_the_refusal() {
        let database = Fresh::new().await;
        let store = open(&wrong_password(&database));
        let clock = Stopping::new(5);
        let (answer, reported) = starting(&store, &clock).await;
        let answer = answer.expect("start-up stopped by itself");
        assert!(
            answer
                .as_ref()
                .is_err_and(|failure| unclassified_naming(failure, "28P01")),
            "{answer:?}"
        );
        assert_eq!(clock.waits(), [5, 10]);
        assert_eq!(reported.len(), 3);
        store.close().await;
    }

    // An unmigrated database is an invariant failure, which start-up stops
    // at once a second retry confirms it (ADR 0177, where TypeScript answers
    // it unclassified).
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn stops_start_up_over_an_unmigrated_database_once_a_second_retry_confirms_it() {
        let database = Fresh::unmigrated().await;
        let store = database.open();
        let clock = Stopping::new(5);
        let (answer, reported) = starting(&store, &clock).await;
        let answer = answer.expect("start-up stopped by itself");
        assert!(
            matches!(
                answer,
                Err(EstablishError::Repository(
                    RepositoryError::BrokenStoredState(_)
                ))
            ),
            "{answer:?}"
        );
        assert_eq!(clock.waits(), [5, 10]);
        assert_eq!(reported.len(), 3);
        store.close().await;
    }
}

/// `store` holding the tracked fixture, put there through the lifecycle doors.
async fn seeded(store: PostgresSpaceRepository) -> PostgresSpaceRepository {
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

async fn presentation(store: &PostgresSpaceRepository) -> LoadedSpace {
    store
        .load_space(space(PRESENTATION))
        .await
        .unwrap()
        .unwrap()
}

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

/// A probe stopping `store`'s first operation to reach a step `at` accepts
/// until released, telling the test it got there.
fn pause_once(
    store: &PostgresSpaceRepository,
    at: fn(&Step) -> bool,
) -> (Arc<Notify>, Arc<Notify>) {
    let reached = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let paused = Arc::new(AtomicBool::new(false));
    let (signal, wait) = (Arc::clone(&reached), Arc::clone(&release));
    let probe: Probe = Arc::new(move |step| {
        let (signal, wait, paused) = (Arc::clone(&signal), Arc::clone(&wait), Arc::clone(&paused));
        Box::pin(async move {
            if at(&step) && !paused.swap(true, Ordering::SeqCst) {
                signal.notify_one();
                wait.notified().await;
            }
        })
    });
    store.set_probe(Some(probe));
    (reached, release)
}

mod given_a_real_server {
    use super::*;

    // Case: reaches the database on the next read rather than repeating the first failure
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn reaches_the_database_on_the_next_read_rather_than_repeating_the_first_failure() {
        let database = Fresh::new().await;
        let server = format!(
            "{}:{}",
            database.url.host_str().unwrap(),
            database.url.port().unwrap_or(5432)
        );
        let upstream = tokio::net::lookup_host(server)
            .await
            .unwrap()
            .next()
            .unwrap();
        let stand_in = StandIn::start(Behaviour::ResetFirstThenPass(upstream)).await;
        let mut through = database.url.clone();
        through.set_host(Some("127.0.0.1")).unwrap();
        through.set_port(Some(stand_in.port())).unwrap();
        let store = open(&url(through.as_str()));
        let first = store.list_spaces().await;
        assert!(
            matches!(first, Err(RepositoryError::Unavailable(_))),
            "the reset connection: {first:?}"
        );
        let after_first = stand_in.connections();
        assert_eq!(
            store.list_spaces().await,
            Ok(Vec::new()),
            "the next read reaches the database"
        );
        assert!(stand_in.connections() > after_first, "a new connection");
        store.close().await;
    }

    /// Install a deferred trigger on `database` raising `code` when a
    /// transaction that updated a Space commits.
    async fn refusing_at_commit(database: &Fresh, code: &str) {
        database
            .execute(&format!(
                "CREATE FUNCTION refuse_at_commit() RETURNS trigger LANGUAGE plpgsql AS $$ \
                 BEGIN RAISE EXCEPTION 'refused at commit' USING ERRCODE = '{code}'; END $$; \
                 CREATE CONSTRAINT TRIGGER refuse_at_commit AFTER UPDATE ON spaces \
                 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse_at_commit();"
            ))
            .await;
    }

    async fn names_a_commit_refused_at_commit_unavailable(code: &str) {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        refusing_at_commit(&database, code).await;
        let current = presentation(&store).await;
        let answer = store.commit(rename(&current, "Refused at commit")).await;
        let Err(RepositoryError::Unavailable(words)) = &answer else {
            panic!("unreachable: {answer:?}");
        };
        assert!(words.contains(code), "{words}");
        assert_eq!(presentation(&store).await, current, "nothing written");
        store.close().await;
    }

    // A failure `COMMIT` raises is classified by its SQLSTATE, as one on a
    // statement is.
    // Case: walks the cause chain to %s
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn names_a_serialization_failure_at_commit_unavailable() {
        names_a_commit_refused_at_commit_unavailable("40001").await;
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn names_a_deadlock_at_commit_unavailable() {
        names_a_commit_refused_at_commit_unavailable("40P01").await;
    }

    // The connection a commit holds, ended by the server mid-transaction.
    // Case: walks the cause chain to %s
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn names_a_commit_whose_connection_the_server_ended_unavailable() {
        let database = Fresh::new().await;
        let store = Arc::new(seeded(database.open()).await);
        let current = presentation(&store).await;
        let (reached, release) = pause_once(&store, |step| matches!(step, Step::RowLock(_)));
        let committing = {
            let store = Arc::clone(&store);
            let commit = rename(&current, "Never landed");
            tokio::spawn(async move { store.commit(commit).await })
        };
        reached.notified().await;
        let ended = database
            .scalar(
                "SELECT count(pg_terminate_backend(pid))::text FROM pg_stat_activity \
                 WHERE datname = current_database() AND pid <> pg_backend_pid() \
                 AND state = 'idle in transaction'",
            )
            .await;
        assert_eq!(ended.as_deref(), Some("1"), "the commit's connection");
        release.notify_one();
        let answer = committing.await.unwrap();
        assert!(
            matches!(answer, Err(RepositoryError::Unavailable(_))),
            "{answer:?}"
        );
        store.set_probe(None);
        assert_eq!(presentation(&store).await, current, "nothing written");
        store.close().await;
    }
}
