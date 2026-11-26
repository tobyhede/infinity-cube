//! `infinity-cube serve --store postgres`, started as a process: the
//! refusals of `DATABASE_URL` it announces before taking a port, announcing
//! before the database answers, start-up from Default Content in the
//! background (ST-10), serving a database seeded through the lifecycle doors
//! without reseeding it, the `Host` check and the stop signals.
//!
//! The refusals and the unreachable database need no server. The rest need
//! the server `INFINITY_CUBE_POSTGRES_TEST_URL` names, whose role may create
//! databases, and are ignored by default. Each makes a database of its own,
//! migrated by `sqlx`'s migrator from `migrations-sql/postgres/` as test
//! setup, standing in for `pnpm db:migrate`; `serve` migrates nothing.
//!
//! `// Case:` marks an HTTP conformance case, which
//! `test/unit/http-conformance-rust-ports.test.ts` holds to the case lists;
//! `// TypeScript case:` marks a case of the TypeScript database host's own
//! tests that `.scratch/rust-postgresql-store/case-map.md` assigns here.

#![cfg(unix)]
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod common;

use std::ffi::OsStr;
use std::io::Write as _;
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::time::Duration;

use common::{Announcement, Started, exchange, get, start_from};
use host::{DatabaseUrl, PostgresSpaceRepository, RandomIds, TokioFilesystem, import_directory};
use serde_json::Value;
use sqlx::{Connection as _, PgConnection};

const NEEDS_NO_DATABASE_URL: &str = "DATABASE_URL must name the PostgreSQL database";

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

/// `serve --store postgres` and `extra`, running in `directory`, with
/// `DATABASE_URL` set to `url`, or unset for `None`.
fn serve_in(directory: &Path, url: Option<&str>, extra: &[&str]) -> Started {
    let mut args = vec!["serve", "--store", "postgres"];
    args.extend_from_slice(extra);
    start_from(
        Some(directory),
        &args,
        &[("DATABASE_URL", url.map(OsStr::new))],
    )
}

/// `serve` in a directory of its own, with no `.env` at or above it.
fn serve(url: Option<&str>, extra: &[&str]) -> (tempfile::TempDir, Started) {
    let directory = tempfile::tempdir().unwrap();
    let started = serve_in(directory.path(), url, extra);
    (directory, started)
}

fn json(answer: &common::Answer) -> Value {
    serde_json::from_slice(&answer.body).unwrap()
}

/// Poll `condition` every 50ms until it holds, failing with `what` after
/// `patience`.
fn wait_until(what: &str, patience: Duration, mut condition: impl FnMut() -> bool) {
    let deadline = std::time::Instant::now() + patience;
    while !condition() {
        assert!(std::time::Instant::now() < deadline, "{what}");
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// The refusal `started` announced, once it has exited non-zero.
fn refusal(mut started: Started) -> String {
    let status = started.exited();
    assert!(!status.success(), "a refusal exits non-zero: {status:?}");
    match started.announcement.clone() {
        Some(Announcement::Refused(message)) => message,
        other => panic!("expected a refusal, it announced {other:?}"),
    }
}

/// A port on loopback nothing listens on.
fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

mod given_a_database_url_it_cannot_serve {
    use super::*;

    // TypeScript case: omits a database connection when DATABASE_URL is blank
    // TypeScript case: constructs the runtime client without a blank DATABASE_URL binding
    #[test]
    fn refuses_an_unset_or_blank_database_url_before_taking_a_port() {
        // The port it would take is held, so a serve that bound first would
        // refuse naming the port instead.
        let held = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = held.local_addr().unwrap().port().to_string();
        for value in [None, Some(""), Some("   ")] {
            let (_directory, started) = serve(value, &["--port", &port]);
            assert_eq!(
                refusal(started),
                NEEDS_NO_DATABASE_URL,
                "DATABASE_URL {value:?}"
            );
        }
    }

    #[test]
    fn refuses_a_blank_database_url_in_the_nearest_env() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join(".env"), "DATABASE_URL=   \n").unwrap();
        let nested = directory.path().join("packages/app");
        std::fs::create_dir_all(&nested).unwrap();
        assert_eq!(refusal(serve_in(&nested, None, &[])), NEEDS_NO_DATABASE_URL);
    }

    #[test]
    fn refuses_what_is_not_a_url_without_writing_it_out() {
        let (_directory, started) = serve(Some("not a url, secret"), &[]);
        let message = refusal(started);
        assert!(
            message.starts_with("DATABASE_URL is not a PostgreSQL URL"),
            "{message}"
        );
        assert!(!message.contains("secret"), "{message}");
    }
}

mod given_a_database_that_does_not_answer {
    use super::*;

    // TypeScript case: composes an application when the repository cannot be reached
    // TypeScript case: trims a configured DATABASE_URL
    #[test]
    fn announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(
            directory.path().join(".env"),
            format!(
                "DATABASE_URL=\"  postgres://cube:secret@127.0.0.1:{}/cube  \"\n",
                free_port()
            ),
        )
        .unwrap();
        let mut started = serve_in(directory.path(), None, &[]);
        let port = started.port();
        let answer = get(port, "/api/spaces");
        assert_eq!(answer.status, 503, "persistence unavailable");
        assert_eq!(
            json(&answer)["type"],
            "urn:infinity-cube:problem:persistence-unavailable"
        );
        started.signal("INT");
        assert_eq!(started.exited().code(), Some(0));
        let said = started.stderr();
        assert!(
            said.contains("the PostgreSQL database DATABASE_URL names"),
            "{said}"
        );
        assert!(!said.contains("secret"), "the URL is never written: {said}");
    }
}

/// The variable naming the test server.
const SERVER: &str = "INFINITY_CUBE_POSTGRES_TEST_URL";

/// A database of its own on the test server, dropped when this is.
struct Database {
    name: String,
    server: url::Url,
    url: url::Url,
}

impl Database {
    /// A new, empty database: no table at all.
    fn unmigrated() -> Self {
        let server = url::Url::parse(
            std::env::var(SERVER)
                .unwrap_or_else(|_| panic!("{SERVER} must name a PostgreSQL server"))
                .trim(),
        )
        .unwrap();
        let name = format!(
            "cube_cli_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let mut url = server.clone();
        url.set_path(&format!("/{name}"));
        let database = Self { name, server, url };
        database.administer(&format!("CREATE DATABASE {}", database.name));
        database
    }

    /// A new database migrated as `pnpm db:migrate` leaves it, holding nothing.
    fn migrated() -> Self {
        let database = Self::unmigrated();
        runtime().block_on(async {
            let mut connection = PgConnection::connect(database.url.as_str()).await.unwrap();
            sqlx::migrate::Migrator::new(common::repository().join("migrations-sql/postgres"))
                .await
                .unwrap()
                .run(&mut connection)
                .await
                .unwrap();
            connection.close().await.unwrap();
        });
        database
    }

    /// A migrated database holding the tracked fixture, stored through the
    /// first lifecycle door by Import.
    fn fixture() -> Self {
        let database = Self::migrated();
        runtime().block_on(async {
            let store = PostgresSpaceRepository::open(
                &DatabaseUrl::parse(Some(database.url.as_str())).unwrap(),
            )
            .unwrap();
            import_directory(
                &store,
                &TokioFilesystem,
                &common::repository().join("packages/app/fixture"),
                &RandomIds,
            )
            .await
            .unwrap();
            store.close().await;
        });
        database
    }

    fn administer(&self, statement: &str) {
        let statement = statement.to_owned();
        runtime().block_on(async {
            let mut connection = PgConnection::connect(self.server.as_str()).await.unwrap();
            sqlx::raw_sql(sqlx::AssertSqlSafe(statement))
                .execute(&mut connection)
                .await
                .unwrap();
            connection.close().await.unwrap();
        });
    }

    /// How many tables the database holds.
    fn tables(&self) -> i64 {
        runtime().block_on(async {
            let mut connection = PgConnection::connect(self.url.as_str()).await.unwrap();
            let count = sqlx::query_scalar(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
            )
            .fetch_one(&mut connection)
            .await
            .unwrap();
            connection.close().await.unwrap();
            count
        })
    }

    fn serve(&self, extra: &[&str]) -> (tempfile::TempDir, Started) {
        serve(Some(self.url.as_str()), extra)
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        let statement = format!("DROP DATABASE IF EXISTS {} WITH (FORCE)", self.name);
        let server = self.server.clone();
        let _ = std::thread::spawn(move || {
            runtime().block_on(async {
                if let Ok(mut connection) = PgConnection::connect(server.as_str()).await {
                    let _ = sqlx::raw_sql(sqlx::AssertSqlSafe(statement))
                        .execute(&mut connection)
                        .await;
                    let _ = connection.close().await;
                }
            });
        })
        .join();
    }
}

mod given_a_migrated_database_holding_nothing {
    use super::*;

    // TypeScript case: establishes Default Content and serves the collection and Meta Space
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn initializes_it_from_default_content_and_serves_it() {
        let database = Database::migrated();
        let (_directory, started) = database.serve(&[]);
        let port = started.port();
        let mut spaces = Value::Null;
        wait_until(
            "the database is initialized from Default Content",
            common::PATIENCE,
            || {
                let answer = get(port, "/api/spaces");
                if answer.status == 200 {
                    spaces = json(&answer);
                }
                spaces.as_array().is_some_and(|listed| !listed.is_empty())
            },
        );
        let listed = spaces.as_array().unwrap();
        assert_eq!(listed.len(), 1, "one Space: {spaces}");
        assert_eq!(listed[0]["title"], "New space", "the new Space: {spaces}");
        let meta = get(port, "/api/aggregate");
        assert_eq!(meta.status, 200);
        assert_eq!(json(&meta)["aggregate"]["metaSpaceId"], listed[0]["id"]);
    }

    // The database does not answer when `serve` starts; start-up retries it
    // after its first wait and initializes it once it does.
    // TypeScript case: recovers through the shared retry after a transient startup failure
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn announces_before_the_database_answers_and_initializes_it_once_it_does() {
        let database = Database::migrated();
        let port_of_database = free_port();
        let mut through = database.url.clone();
        through.set_host(Some("127.0.0.1")).unwrap();
        through.set_port(Some(port_of_database)).unwrap();
        let (_directory, started) = serve(Some(through.as_str()), &[]);
        let port = started.port();
        assert_eq!(get(port, "/api/spaces").status, 503, "not answering yet");
        let upstream = format!(
            "{}:{}",
            database.url.host_str().unwrap(),
            database.url.port().unwrap_or(5432)
        );
        let _proxy = Proxy::start(port_of_database, upstream);
        wait_until(
            "start-up initializes the database once it answers",
            common::PATIENCE,
            || {
                let answer = get(port, "/api/spaces");
                answer.status == 200
                    && json(&answer)
                        .as_array()
                        .is_some_and(|listed| listed.len() == 1)
            },
        );
    }
}

/// A TCP proxy on `port` passing every connection to `upstream`, stopped
/// when dropped.
struct Proxy {
    runtime: Option<tokio::runtime::Runtime>,
}

impl Proxy {
    fn start(port: u16, upstream: String) -> Self {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .unwrap();
        let listener = runtime
            .block_on(tokio::net::TcpListener::bind(("127.0.0.1", port)))
            .unwrap();
        runtime.spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                let upstream = upstream.clone();
                tokio::spawn(async move {
                    if let Ok(mut server) = tokio::net::TcpStream::connect(upstream).await {
                        let _ = tokio::io::copy_bidirectional(&mut socket, &mut server).await;
                    }
                });
            }
        });
        Self {
            runtime: Some(runtime),
        }
    }
}

impl Drop for Proxy {
    fn drop(&mut self) {
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_background();
        }
    }
}

mod given_an_unmigrated_database {
    use super::*;

    // A missing table is an invariant failure (ADR 0177): start-up stops once
    // a second retry confirms it, says so, and `serve` keeps serving.
    // TypeScript case: gives up through the shared retry after two confirmed invariant failures
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn gives_up_after_two_confirmed_invariant_failures_and_keeps_serving() {
        let database = Database::unmigrated();
        let (_directory, mut started) = database.serve(&[]);
        let port = started.port();
        // Start-up waits 5 s, then 10 s, before its two confirming retries,
        // and gives up after the second; until then and after, each request
        // is answered as the store answers it.
        let deadline = std::time::Instant::now() + Duration::from_secs(20);
        while std::time::Instant::now() < deadline {
            assert_eq!(get(port, "/api/spaces").status, 500, "an invariant failure");
            std::thread::sleep(Duration::from_millis(500));
        }
        assert!(
            started.child.try_wait().unwrap().is_none(),
            "serve keeps serving after start-up gives up"
        );
        started.signal("INT");
        assert_eq!(started.exited().code(), Some(0));
        let stderr = started.stderr();
        assert!(
            stderr.contains("Gave up establishing the Meta Space"),
            "{stderr}"
        );
        assert_eq!(database.tables(), 0, "serve migrates nothing");
    }
}

mod given_a_database_seeded_with_the_fixture {
    use super::*;

    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn serves_it_without_reseeding() {
        let database = Database::fixture();
        let (_directory, mut started) = database.serve(&[]);
        // Start-up runs after the announcement; read once it has run.
        started.wait_for_stderr_line("Established the Meta Space.");
        let answer = get(started.port(), "/api/aggregate");
        assert_eq!(answer.status, 200, "the aggregate is read");
        let aggregate = json(&answer);
        assert_eq!(
            aggregate["aggregate"]["metaSpaceId"], "00000000-0000-4000-8000-000000000040",
            "the fixture's Meta Space"
        );
        assert_eq!(
            aggregate["aggregate"]["spaces"].as_array().map(Vec::len),
            Some(4),
            "the fixture's four Spaces, and no Default Content beside them"
        );
    }

    // Case: answers 421 to a request naming any Host but its own
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn answers_421_to_a_request_naming_any_host_but_its_own() {
        let database = Database::fixture();
        let (_directory, started) = database.serve(&[]);
        let port = started.port();
        for other in [
            format!("localhost:{port}"),
            format!("127.0.0.1:{}", port.wrapping_add(1)),
            "attacker.example".to_owned(),
        ] {
            let answer = exchange(port, "GET", "/api/spaces", &[("Host", &other)], &[]);
            assert_eq!(answer.status, 421, "{other}");
        }
        assert_eq!(
            exchange(port, "GET", "/api/spaces", &[], &[]).status,
            421,
            "no Host at all"
        );
        assert_eq!(get(port, "/api/spaces").status, 200, "its own Host");
    }

    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn serves_on_the_port_port_names() {
        let database = Database::fixture();
        let chosen = free_port();
        let (_directory, started) = database.serve(&["--port", &chosen.to_string()]);
        assert_eq!(started.port(), chosen);
        assert_eq!(get(chosen, "/api/spaces").status, 200);
    }

    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn exits_zero_on_sigint_sigterm_or_sighup() {
        let database = Database::fixture();
        for signal in ["INT", "TERM", "HUP"] {
            let (_directory, mut started) = database.serve(&[]);
            assert_eq!(get(started.port(), "/api/spaces").status, 200, "serving");
            started.signal(signal);
            assert_eq!(
                started.exited().code(),
                Some(0),
                "exits zero on SIG{signal}: {}",
                started.stderr()
            );
        }
    }

    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn exits_at_once_non_zero_on_a_second_signal_while_it_is_stopping() {
        let database = Database::fixture();
        let (_directory, mut started) = database.serve(&[]);
        let port = started.port();
        // A request still arriving keeps the stop waiting for it.
        let mut slow = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            slow,
            "POST /api/spaces HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{{"
        )
        .unwrap();
        assert_eq!(get(port, "/api/spaces").status, 200);
        started.signal("INT");
        assert!(
            started.still_running_after(Duration::from_millis(300)),
            "the first signal waits for the request being answered"
        );
        started.signal("INT");
        assert_eq!(
            started.exited().code(),
            Some(1),
            "the second exits at once, one"
        );
        assert!(
            started
                .stderr()
                .contains("Exiting without waiting for open requests."),
            "says so"
        );
    }
}
