//! `infinity-cube serve --store postgres`, started as a process: the
//! refusals of `DATABASE_URL` it announces before taking a port, announcing
//! before the database answers, start-up from Default Content in the
//! background (ST-10), serving a database seeded through the lifecycle doors
//! without reseeding it, the `Host` check and the stop signals.
//!
//! The refusals and the unreachable database need no server. The rest need
//! the server `INFINITY_CUBE_POSTGRES_TEST_URL` names, whose role may create
//! databases, and are ignored by default. These need no more of the role;
//! the host's PostgreSQL tests, which CI runs against the same variable, also
//! need it to create roles and own the template it clones
//! (`crates/host/tests/postgres_support/mod.rs`). Each makes a database of its own,
//! migrated by `sqlx`'s migrator from `migrations-sql/postgres/` as test
//! setup, standing in for `pnpm db:migrate`; `serve` migrates nothing.
//!
//! `// Case:` marks an HTTP conformance case, which
//! `test/unit/http-conformance-rust-ports.test.ts` holds to the case lists;
//! `// TypeScript case:` marks a case of the TypeScript database host's own
//! tests, which `test/unit/repository-contract-rust-ports.test.ts` holds to
//! its PostgreSQL adapter.

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
use host::{
    DatabaseUrl, PostgresSpaceRepository, RandomIds, TokioFilesystem, import_directory,
    postgres_connect_options,
};
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

/// `serve` in a directory of its own holding an empty `.env`, which is the
/// nearest, so no `.env` above it is read.
fn serve(url: Option<&str>, extra: &[&str]) -> (tempfile::TempDir, Started) {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(directory.path().join(".env"), "").unwrap();
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

    // The environment's DATABASE_URL needs no `.env`, so where the process
    // runs is not asked.
    #[test]
    fn serves_the_environments_database_url_from_a_directory_it_cannot_name() {
        let url = format!("postgres://cube@127.0.0.1:{}/cube", free_port());
        let (mut child, first) = serve_from_a_removed_directory(&url);
        let _killed = child.kill();
        let _reaped = child.wait();
        let announced: Value = serde_json::from_str(first.trim()).unwrap_or(Value::Null);
        assert_eq!(
            announced["kind"], "listening",
            "announces it is listening: {first}"
        );
    }
}

/// `serve --store postgres` with `DATABASE_URL` set to `url`, run from a
/// working directory that is removed before the binary starts, so it cannot
/// say where it runs. A shell removes it and then runs the binary in its
/// place. Answers the process and its first line of standard output, or
/// kills and reaps it and fails when no line comes within
/// [`common::PATIENCE`].
fn serve_from_a_removed_directory(url: &str) -> (std::process::Child, String) {
    use std::io::BufRead as _;
    let parent = tempfile::tempdir().unwrap();
    let directory = parent.path().join("removed");
    std::fs::create_dir(&directory).unwrap();
    let mut child = std::process::Command::new("sh")
        .args([
            "-c",
            r#"cd "$1" && rmdir "$1" && exec "$2" serve --store postgres"#,
            "sh",
        ])
        .arg(&directory)
        .arg(common::BINARY)
        .env("DATABASE_URL", url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let (sender, line) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut first = String::new();
        let read = std::io::BufReader::new(stdout).read_line(&mut first);
        let _gone = sender.send(read.map(|_| first));
    });
    match line.recv_timeout(common::PATIENCE) {
        Ok(Ok(first)) => (child, first),
        answered => {
            let _killed = child.kill();
            let _reaped = child.wait();
            panic!("the binary did not announce itself: {answered:?}");
        }
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
        // A `dbname` pair would name a database in place of the path, so the
        // test's own database is named by the path alone; `server` keeps it
        // for the administrative connections.
        let mut url = without_query(&server, &["dbname"]);
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

    // TypeScript case: establishes Default Content and serves the collection and Meta Space (PostgreSQL)
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
    // after its first wait and initializes it once it does. It asserts the
    // 503 before and the listing of one Space after, but not the one report
    // of the transient failure that the TypeScript case asserts: the outage
    // here is real, so how many attempts fail before the database answers
    // depends on timing, and `serve` reports each to standard error, which
    // this test does not read. That each failed attempt is reported once is
    // held at the host's seam by `crates/host/tests/startup.rs` ›
    // `given_an_unreachable_store` › `backs_off_up_to_a_bound_it_then_holds`.
    // TypeScript case: recovers through the shared retry after a transient startup failure (PostgreSQL)
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn announces_before_the_database_answers_and_initializes_it_once_it_does() {
        let database = Database::migrated();
        let port_of_database = free_port();
        // The driver dials the proxy by `hostaddr` and its port, which a
        // query `hostaddr` or `port` would override, so those go, and still
        // verifies TLS against the host the URL names, which stays.
        let mut through = without_query(&database.url, &["hostaddr", "port"]);
        through.set_port(Some(port_of_database)).unwrap();
        through
            .query_pairs_mut()
            .append_pair("hostaddr", "127.0.0.1");
        let (_directory, started) = serve(Some(through.as_str()), &[]);
        let port = started.port();
        assert_eq!(get(port, "/api/spaces").status, 503, "not answering yet");
        let _proxy = Proxy::start(port_of_database, upstream(&database.url));
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

/// The server `url` reaches, a query `host`, `hostaddr` or `port` overriding
/// its authority, as the driver reads it: the driver dials `hostaddr` when
/// there is one and resolves the host only otherwise.
fn upstream(url: &url::Url) -> std::net::SocketAddr {
    use sqlx::ConnectOptions as _;
    use std::net::ToSocketAddrs as _;
    let options = postgres_connect_options(url.as_str(), None).unwrap();
    let hostaddr = options
        .to_url_lossy()
        .query_pairs()
        .find(|(name, _)| name == "hostaddr")
        .map(|(_, address)| address.parse::<std::net::IpAddr>().unwrap());
    match hostaddr {
        Some(address) => std::net::SocketAddr::new(address, options.get_port()),
        None => (options.get_host(), options.get_port())
            .to_socket_addrs()
            .unwrap()
            .next()
            .unwrap(),
    }
}

/// `url` without any query pair named in `names`.
fn without_query(url: &url::Url, names: &[&str]) -> url::Url {
    let mut kept = url.clone();
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| !names.contains(&key.as_ref()))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    if pairs.is_empty() {
        kept.set_query(None);
    } else {
        kept.query_pairs_mut().clear().extend_pairs(pairs);
    }
    kept
}

/// A TCP proxy on `port` passing every connection to `upstream`, stopped
/// when dropped.
struct Proxy {
    runtime: Option<tokio::runtime::Runtime>,
}

impl Proxy {
    fn start(port: u16, upstream: std::net::SocketAddr) -> Self {
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

mod given_a_database_holding_the_aggregate_lock {
    use super::*;

    /// How long the stop may take once a store operation is stuck: the bound
    /// on the store's close, with room for the process to exit.
    const STOP_PATIENCE: Duration = Duration::from_secs(15);

    // Another session holds the aggregate's advisory lock and never lets it
    // go, so start-up's operation waits on it with no bound (ADR 0177). The
    // first signal still stops `serve`, zero (ST-120: a database that does
    // not answer delays neither the announcement nor the stop).
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn exits_zero_on_the_first_signal_while_an_operation_waits_on_the_database() {
        let database = Database::migrated();
        let holding = runtime();
        let mut holder = holding.block_on(async {
            let mut holder = PgConnection::connect(database.url.as_str()).await.unwrap();
            sqlx::raw_sql("BEGIN").execute(&mut holder).await.unwrap();
            sqlx::query("SELECT pg_advisory_xact_lock($1, $2)::text")
                .bind(host::AGGREGATE_LOCK_KEY.0)
                .bind(host::AGGREGATE_LOCK_KEY.1)
                .execute(&mut holder)
                .await
                .unwrap();
            holder
        });
        let (_directory, mut started) = database.serve(&[]);
        let _port = started.port();
        wait_until(
            "start-up waits on the aggregate lock",
            common::PATIENCE,
            || {
                holding.block_on(async {
                    let waiting: i64 = sqlx::query_scalar(
                        "SELECT count(*) FROM pg_locks l JOIN pg_database d ON d.oid = l.database \
                         WHERE l.locktype = 'advisory' AND NOT l.granted AND d.datname = $1",
                    )
                    .bind(&database.name)
                    .fetch_one(&mut holder)
                    .await
                    .unwrap();
                    waiting > 0
                })
            },
        );
        started.signal("INT");
        let deadline = std::time::Instant::now() + STOP_PATIENCE;
        let status = loop {
            if let Some(status) = started.child.try_wait().unwrap() {
                break Some(status);
            }
            if std::time::Instant::now() >= deadline {
                break None;
            }
            std::thread::sleep(Duration::from_millis(50));
        };
        if status.is_none() {
            // Standard error ends only once the process does.
            let _killed = started.child.kill();
            let _reaped = started.child.wait();
        }
        // Standard error is read once: the read takes it to its end.
        let said = started.stderr();
        assert_eq!(
            status.and_then(|status| status.code()),
            Some(0),
            "the first signal stops serve within {STOP_PATIENCE:?}, zero, though an operation \
             still waits on the database: {said}"
        );
        assert!(
            said.contains("Stopped without waiting for the operations still under way"),
            "serve says it stopped without the operation still waiting: {said}"
        );
        holding.block_on(async { holder.close().await.unwrap() });
    }

    /// The bound ADR 0177 sets on the stop: the store's close waits at most
    /// five seconds after the first stop signal (ST-120).
    const STOP_BOUND: Duration = Duration::from_secs(5);

    // The connection drain and the store's close each have a bound; together
    // they still stop within the one bound on the stop, though a request
    // stalls the drain and an operation waiting on the database stalls the
    // close.
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn stops_within_five_seconds_of_the_first_signal_while_a_request_and_an_operation_stall() {
        let database = Database::migrated();
        let holding = runtime();
        let mut holder = holding.block_on(async {
            let mut holder = PgConnection::connect(database.url.as_str()).await.unwrap();
            sqlx::raw_sql("BEGIN").execute(&mut holder).await.unwrap();
            sqlx::query("SELECT pg_advisory_xact_lock($1, $2)::text")
                .bind(host::AGGREGATE_LOCK_KEY.0)
                .bind(host::AGGREGATE_LOCK_KEY.1)
                .execute(&mut holder)
                .await
                .unwrap();
            holder
        });
        let (_directory, mut started) = database.serve(&[]);
        let port = started.port();
        wait_until(
            "start-up waits on the aggregate lock",
            common::PATIENCE,
            || {
                holding.block_on(async {
                    let waiting: i64 = sqlx::query_scalar(
                        "SELECT count(*) FROM pg_locks l JOIN pg_database d ON d.oid = l.database \
                         WHERE l.locktype = 'advisory' AND NOT l.granted AND d.datname = $1",
                    )
                    .bind(&database.name)
                    .fetch_one(&mut holder)
                    .await
                    .unwrap();
                    waiting > 0
                })
            },
        );
        // A client that sends one byte of a 100-byte body and then nothing.
        let mut stalled = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            stalled,
            "POST /api/spaces HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{{"
        )
        .unwrap();
        // Connections are accepted in order, so an answer on a later one
        // means the stalled one is accepted.
        let _answered = get(port, "/api/spaces");
        let signalled = std::time::Instant::now();
        started.signal("INT");
        let status = started.exited();
        let took = signalled.elapsed();
        let said = started.stderr();
        assert_eq!(status.code(), Some(0), "exits zero: {said}");
        // A second of room for the process to exit.
        assert!(
            took < STOP_BOUND + Duration::from_secs(1),
            "the stop ends within {STOP_BOUND:?} of the first signal, the drain and the close \
             sharing it; it took {took:?}: {said}"
        );
        drop(stalled);
        holding.block_on(async { holder.close().await.unwrap() });
    }
}

mod given_an_unmigrated_database {
    use super::*;

    // A missing table is an invariant failure (ADR 0177): start-up stops once
    // a second retry confirms it, says so, and `serve` keeps serving.
    // TypeScript case: gives up through the shared retry after two confirmed invariant failures (PostgreSQL)
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
        let gave_up = stderr
            .find("Gave up establishing the Meta Space")
            .unwrap_or_else(|| panic!("start-up says it gave up: {stderr}"));
        assert_eq!(
            stderr
                .get(..gave_up)
                .unwrap_or_default()
                .matches("Failed to establish the Meta Space at startup")
                .count(),
            3,
            "the first attempt and its two confirming retries each fail before start-up \
             gives up: {stderr}"
        );
        assert_eq!(
            stderr
                .matches("Failed to establish the Meta Space at startup")
                .count(),
            3,
            "start-up tries no more once it has given up: {stderr}"
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
