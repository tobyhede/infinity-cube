//! `infinity-cube serve --store sqlite`, started as a process: the refusals
//! of `SQLITE_PATH` it announces (Storage ST-126), start-up from Default
//! Content in the background (ST-10), serving a file seeded through the
//! lifecycle doors across a restart, the `Host` check and the stop signals.
//! Every file is migrated by `sqlx`'s migrator from `migrations-sql/sqlite/`
//! as test setup, standing in for `pnpm db:migrate:sqlite`; `serve` migrates
//! nothing.

#![cfg(unix)]
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod common;

use std::ffi::OsStr;
use std::io::{BufRead as _, BufReader, Write as _};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use common::{Announcement, Started, corpus, exchange, get, start_from, start_in};
use host::{RandomIds, SqlitePath, SqliteSpaceRepository, TokioFilesystem, import_directory};
use serde_json::Value;
use sqlx::ConnectOptions as _;

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

/// A file in a temporary directory of its own, migrated as
/// `pnpm db:migrate:sqlite` would leave it, holding no Spaces.
struct Migrated {
    _directory: tempfile::TempDir,
    file: PathBuf,
}

impl Migrated {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("cube.db");
        runtime().block_on(async {
            let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(&file)
                .create_if_missing(true)
                .connect()
                .await
                .unwrap();
            let migrations = common::repository().join("migrations-sql/sqlite");
            sqlx::migrate::Migrator::new(migrations)
                .await
                .unwrap()
                .run(&mut connection)
                .await
                .unwrap();
            sqlx::Connection::close(connection).await.unwrap();
        });
        Self {
            _directory: directory,
            file,
        }
    }

    /// A migrated file holding the Aggregate `directory` holds, stored
    /// through the first lifecycle door by Import.
    fn seeded_from(directory: &Path) -> Self {
        let migrated = Self::new();
        runtime().block_on(async {
            let path = SqlitePath::from_variable(migrated.file.to_str()).unwrap();
            let store = SqliteSpaceRepository::open(&path);
            import_directory(&store, &TokioFilesystem, directory, &RandomIds)
                .await
                .unwrap();
            store.close().await;
        });
        migrated
    }

    /// A migrated file holding the tracked fixture.
    fn fixture() -> Self {
        Self::seeded_from(&common::repository().join("packages/app/fixture"))
    }
}

/// `serve --store sqlite` with `SQLITE_PATH` set to `path`, or unset for `None`.
fn serve(path: Option<&OsStr>) -> Started {
    start_in(&["serve", "--store", "sqlite"], &[("SQLITE_PATH", path)])
}

fn serve_file(file: &Path) -> Started {
    serve(Some(file.as_os_str()))
}

fn json(answer: &common::Answer) -> Value {
    serde_json::from_slice(&answer.body).unwrap()
}

/// Poll `condition` every 50ms until it holds, failing with `what` after
/// [`common::PATIENCE`].
fn wait_until(what: &str, mut condition: impl FnMut() -> bool) {
    let deadline = std::time::Instant::now() + common::PATIENCE;
    while !condition() {
        assert!(std::time::Instant::now() < deadline, "{what}");
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Each line `started` writes to standard error from now on, as it writes it.
fn stderr_lines(started: &mut Started) -> mpsc::Receiver<String> {
    let stderr = started.child.stderr.take().unwrap();
    let (sender, lines) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else { break };
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    lines
}

/// The first line of `lines` starting `prefix`, waiting at most `patience`.
fn line_starting(lines: &mpsc::Receiver<String>, prefix: &str, patience: Duration) -> String {
    let deadline = std::time::Instant::now() + patience;
    loop {
        let left = deadline.saturating_duration_since(std::time::Instant::now());
        match lines.recv_timeout(left) {
            Ok(line) if line.starts_with(prefix) => return line,
            Ok(_) => {}
            Err(error) => panic!("no line starting {prefix:?} on standard error: {error}"),
        }
    }
}

/// A loopback port free when this answers.
fn free_port() -> u16 {
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
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

mod given_a_sqlite_path_it_cannot_serve {
    use super::*;

    // Case: refuses to compose when SQLITE_PATH is %s
    #[test]
    fn refuses_an_unset_or_blank_sqlite_path() {
        for value in [None, Some(OsStr::new("")), Some(OsStr::new(" \t "))] {
            assert_eq!(
                refusal(serve(value)),
                "SQLITE_PATH must name the SQLite database file",
                "SQLITE_PATH {value:?}"
            );
        }
    }

    // Case: refuses to compose when SQLITE_PATH is relative
    #[test]
    fn refuses_a_relative_sqlite_path() {
        assert_eq!(
            refusal(serve(Some(OsStr::new("cube.db")))),
            "SQLITE_PATH must be an absolute path: cube.db",
            "a relative path"
        );
        assert_eq!(
            refusal(serve(Some(OsStr::new("x/missing/../y.db")))),
            "SQLITE_PATH must be an absolute path: x/missing/../y.db",
            "a relative path through a directory that does not exist"
        );
    }

    #[test]
    fn refuses_a_parent_that_is_a_regular_file() {
        let directory = tempfile::tempdir().unwrap();
        let parent = directory.path().join("plain");
        std::fs::write(&parent, b"").unwrap();
        assert_eq!(
            refusal(serve_file(&parent.join("cube.db"))),
            format!(
                "SQLite parent directory is missing or unwritable: {}",
                parent.display()
            ),
            "a parent that is a regular file"
        );
    }

    /// `SQLITE_PATH` is the environment's alone: a `.env` beside where it
    /// starts naming a migrated file is not read.
    #[test]
    fn reads_sqlite_path_from_the_environment_alone() {
        let migrated = Migrated::new();
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(
            directory.path().join(".env"),
            format!("SQLITE_PATH={}\n", migrated.file.display()),
        )
        .unwrap();
        let refused = start_from(
            Some(directory.path()),
            &["serve", "--store", "sqlite"],
            &[("SQLITE_PATH", None)],
        );
        assert_eq!(
            refusal(refused),
            "SQLITE_PATH must name the SQLite database file"
        );
    }

    #[test]
    fn refuses_a_missing_parent_directory() {
        let directory = tempfile::tempdir().unwrap();
        let parent = directory.path().join("missing");
        assert_eq!(
            refusal(serve_file(&parent.join("cube.db"))),
            format!(
                "SQLite parent directory is missing or unwritable: {}",
                parent.display()
            ),
            "a missing parent"
        );
    }

    #[test]
    fn refuses_a_file_that_does_not_exist_naming_the_migration_and_creates_nothing() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("cube.db");
        assert_eq!(
            refusal(serve_file(&file)),
            format!(
                "SQLite database file does not exist: {}. Run pnpm db:migrate:sqlite first.",
                file.display()
            ),
            "a missing file"
        );
        assert_eq!(
            std::fs::read_dir(directory.path()).unwrap().count(),
            0,
            "nothing is created beside it"
        );
    }

    #[test]
    fn refuses_a_path_that_is_not_a_regular_file() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("cube.db");
        std::fs::create_dir(&folder).unwrap();
        assert_eq!(
            refusal(serve_file(&folder)),
            format!("SQLITE_PATH must name a regular file: {}", folder.display()),
            "a directory"
        );
    }

    // Read lossily, the value would name the file of the mangled name beside it.
    #[test]
    fn refuses_a_path_that_is_not_utf8_beside_a_file_of_its_lossy_name() {
        use std::os::unix::ffi::OsStrExt as _;
        let migrated = Migrated::new();
        let directory = migrated.file.parent().unwrap();
        let mangled = directory.join("cube\u{fffd}.db");
        std::fs::copy(&migrated.file, &mangled).unwrap();
        let mut given = directory.as_os_str().as_bytes().to_vec();
        given.extend_from_slice(b"/cube\xff.db");
        let message = refusal(serve(Some(OsStr::from_bytes(&given))));
        assert!(
            message.starts_with("SQLITE_PATH must be UTF-8: "),
            "a value that is not UTF-8: {message}"
        );
    }
}

mod given_a_migrated_file_holding_nothing {
    use super::*;

    // Case: leaves an already-initialized file alone and still serves it after reopen
    #[test]
    fn serves_the_space_start_up_initialized_after_a_restart_without_reseeding() {
        let migrated = Migrated::new();
        let mut first = serve_file(&migrated.file);
        let mut listed = Value::Null;
        wait_until("the file is initialized from Default Content", || {
            let answer = get(first.port(), "/api/spaces");
            if answer.status == 200 {
                listed = json(&answer);
            }
            listed.as_array().is_some_and(|spaces| !spaces.is_empty())
        });
        first.signal("INT");
        assert_eq!(first.exited().code(), Some(0), "{}", first.stderr());

        let second = serve_file(&migrated.file);
        let port = second.port();
        let again = get(port, "/api/spaces");
        assert_eq!(again.status, 200);
        assert_eq!(json(&again), listed, "the same one Space, not reseeded");
        let meta = listed[0]["id"].as_str().unwrap();
        let loaded = get(port, &format!("/api/spaces/{meta}"));
        assert_eq!(loaded.status, 200);
        assert_eq!(json(&loaded)["snapshot"]["id"], meta);
    }

    #[test]
    fn initializes_it_from_default_content_and_serves_it() {
        let migrated = Migrated::new();
        let started = serve_file(&migrated.file);
        let port = started.port();
        let mut spaces = Value::Null;
        wait_until("the file is initialized from Default Content", || {
            let answer = get(port, "/api/spaces");
            if answer.status == 200 {
                spaces = json(&answer);
            }
            spaces.as_array().is_some_and(|listed| !listed.is_empty())
        });
        let listed = spaces.as_array().unwrap();
        assert_eq!(listed.len(), 1, "one Space: {spaces}");
        assert_eq!(listed[0]["title"], "New space", "the new Space: {spaces}");
    }
}

mod given_a_file_seeded_with_the_fixture {
    use super::*;

    #[test]
    fn serves_it_without_reseeding() {
        let migrated = Migrated::fixture();
        let started = serve_file(&migrated.file);
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

    // Case: persists a POST Edit through GET and reopen, and answers a stale revision as 409
    #[test]
    fn keeps_an_edit_across_a_restart() {
        let case = corpus().join("commit/accepted-update");
        let migrated = Migrated::seeded_from(&corpus().join("directory/accepted-ur/aggregate"));
        let mut first = serve_file(&migrated.file);
        let port = first.port();
        let before = get(port, "/api/aggregate").body;
        let host = format!("127.0.0.1:{port}");
        let committed = exchange(
            port,
            "POST",
            "/api/spaces",
            &[("Host", &host), ("Content-Type", "application/json")],
            &std::fs::read(case.join("commit.json")).unwrap(),
        );
        assert_eq!(
            committed.status,
            200,
            "the commit lands: {}",
            String::from_utf8_lossy(&committed.body)
        );
        let edited = get(port, "/api/aggregate").body;
        assert_ne!(edited, before, "the edit changes the aggregate");
        let stale = exchange(
            port,
            "POST",
            "/api/spaces",
            &[("Host", &host), ("Content-Type", "application/json")],
            &std::fs::read(case.join("commit.json")).unwrap(),
        );
        assert_eq!(stale.status, 409, "the same commit again is stale");
        assert_eq!(
            get(port, "/api/aggregate").body,
            edited,
            "the stale commit writes nothing"
        );
        first.signal("INT");
        assert_eq!(
            first.exited().code(),
            Some(0),
            "exits zero: {}",
            first.stderr()
        );

        let second = serve_file(&migrated.file);
        assert_eq!(
            get(second.port(), "/api/aggregate").body,
            edited,
            "a fresh host serves the edit"
        );
    }

    // Case: answers 421 to a request naming any Host but its own
    #[test]
    fn answers_421_to_a_request_naming_any_host_but_its_own() {
        let migrated = Migrated::fixture();
        let started = serve_file(&migrated.file);
        let port = started.port();
        for other in [
            format!("localhost:{port}"),
            "127.0.0.1".to_owned(),
            format!("127.0.0.1:{}", port.wrapping_add(1)),
            "attacker.example".to_owned(),
        ] {
            let answer = exchange(port, "GET", "/api/spaces", &[("Host", &other)], &[]);
            assert_eq!(answer.status, 421, "{other}");
            assert!(
                answer
                    .header("content-type")
                    .is_some_and(|value| value == "text/plain" || value.starts_with("text/plain;")),
                "{other}: a plain-text refusal: {:?}",
                answer.headers
            );
            assert_eq!(answer.header("cache-control"), Some("no-store"), "{other}");
        }
        assert_eq!(
            exchange(port, "GET", "/api/spaces", &[], &[]).status,
            421,
            "no Host at all"
        );
        assert_eq!(get(port, "/api/spaces").status, 200, "its own Host");
    }

    #[test]
    fn serves_the_built_application_built_names_around_the_api() {
        let migrated = Migrated::fixture();
        let built = tempfile::tempdir().unwrap();
        std::fs::write(built.path().join("index.html"), "<p>built page</p>").unwrap();
        let started = start_in(
            &[
                "serve",
                "--store",
                "sqlite",
                "--built",
                built.path().to_str().unwrap(),
            ],
            &[("SQLITE_PATH", Some(migrated.file.as_os_str()))],
        );
        let page = get(started.port(), "/a-page");
        assert_eq!(page.status, 200, "a page address is served");
        assert_eq!(page.body, b"<p>built page</p>", "the page --built names");
    }

    #[test]
    fn listens_on_the_port_port_names() {
        let migrated = Migrated::fixture();
        // A port free when asked can be taken before serve binds it, by
        // another test's connection among them, so a refusal tries another.
        let (port, started) = (0..5)
            .find_map(|_| {
                let port = free_port();
                let started = start_in(
                    &["serve", "--store", "sqlite", "--port", &port.to_string()],
                    &[("SQLITE_PATH", Some(migrated.file.as_os_str()))],
                );
                matches!(started.announcement, Some(Announcement::Listening(_)))
                    .then_some((port, started))
            })
            .expect("a free port within five tries");
        assert_eq!(started.announcement, Some(Announcement::Listening(port)));
        assert_eq!(get(port, "/api/spaces").status, 200, "served there");
    }

    #[test]
    fn serves_the_file_a_path_with_surrounding_whitespace_names() {
        let migrated = Migrated::fixture();
        let mut padded = std::ffi::OsString::from("  ");
        padded.push(migrated.file.as_os_str());
        padded.push(" \t");
        let started = serve(Some(&padded));
        let answer = get(started.port(), "/api/aggregate");
        assert_eq!(answer.status, 200);
        assert_eq!(
            json(&answer)["aggregate"]["metaSpaceId"],
            "00000000-0000-4000-8000-000000000040",
            "the fixture, from the trimmed path"
        );
    }

    #[test]
    fn exits_at_once_non_zero_on_a_second_signal_while_it_is_stopping() {
        let migrated = Migrated::fixture();
        let mut started = serve_file(&migrated.file);
        let port = started.port();
        // A request still arriving keeps the stop waiting for it. Its
        // `100 Continue` is sent once the application reads the body, so the
        // request is being answered, not a connection waiting idle for one,
        // when the first signal lands.
        let mut slow = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            slow,
            "POST /api/spaces HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\nExpect: 100-continue\r\n\r\n"
        )
        .unwrap();
        let mut interim = String::new();
        BufReader::new(&slow).read_line(&mut interim).unwrap();
        assert!(
            interim.starts_with("HTTP/1.1 100"),
            "the body is being read: {interim:?}"
        );
        write!(slow, "{{").unwrap();
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
            "says why"
        );
    }

    #[test]
    fn takes_the_default_port_or_the_next_free_one_without_port() {
        let migrated = Migrated::fixture();
        let started = serve_file(&migrated.file);
        assert!(started.port() >= 4173, "from 4173 up: {}", started.port());
    }

    #[test]
    fn exits_zero_on_sigint_sigterm_or_sighup() {
        let migrated = Migrated::fixture();
        for signal in ["INT", "TERM", "HUP"] {
            let mut started = serve_file(&migrated.file);
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
}

mod given_a_file_another_process_holds {
    use super::*;

    #[test]
    fn announces_before_the_store_answers_and_initializes_it_once_released() {
        let migrated = Migrated::new();
        let held = runtime();
        let lock = held.block_on(async {
            let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(&migrated.file)
                .connect()
                .await
                .unwrap();
            sqlx::raw_sql("BEGIN EXCLUSIVE")
                .execute(&mut connection)
                .await
                .unwrap();
            connection
        });
        let started = serve_file(&migrated.file);
        let port = started.port();
        assert_eq!(
            get(port, "/api/spaces").status,
            503,
            "the held file answers as unavailable"
        );
        held.block_on(sqlx::Connection::close(lock)).unwrap();
        wait_until("start-up initializes the file once it is released", || {
            let answer = get(port, "/api/spaces");
            answer.status == 200
                && json(&answer)
                    .as_array()
                    .is_some_and(|listed| listed.len() == 1)
        });
    }

    /// `serve` opens the file waiting out another holder's lock (ST-127):
    /// a read made while another process holds the file answers once it is
    /// let go, a second later, rather than 503 at once.
    #[test]
    fn waits_out_a_lock_let_go_inside_the_busy_timeout() {
        let migrated = Migrated::fixture();
        let started = serve_file(&migrated.file);
        let port = started.port();
        assert_eq!(get(port, "/api/spaces").status, 200, "the file is served");
        let held = runtime();
        let lock = held.block_on(async {
            let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(&migrated.file)
                .connect()
                .await
                .unwrap();
            sqlx::raw_sql("BEGIN EXCLUSIVE")
                .execute(&mut connection)
                .await
                .unwrap();
            connection
        });
        let read = std::thread::spawn(move || get(port, "/api/spaces").status);
        std::thread::sleep(Duration::from_secs(1));
        held.block_on(sqlx::Connection::close(lock)).unwrap();
        assert_eq!(
            read.join().unwrap(),
            200,
            "the read made under the lock waits for it and answers"
        );
    }
}

mod given_a_file_whose_meta_document_is_not_json {
    use super::*;

    /// A migrated file whose one Space, its Meta Space, is stored as text
    /// that is not JSON.
    fn broken() -> Migrated {
        let migrated = Migrated::new();
        let space = "00000000-0000-4000-8000-0000000000aa";
        runtime().block_on(async {
            let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(&migrated.file)
                .connect()
                .await
                .unwrap();
            sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "INSERT INTO spaces (id, document, updated_at) VALUES ('{space}', 'not json', datetime('now')); \
                 INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, '{space}');"
            )))
            .execute(&mut connection)
            .await
            .unwrap();
            sqlx::Connection::close(connection).await.unwrap();
        });
        migrated
    }

    fn root_problem(port: u16) -> (u16, Value) {
        let host = format!("127.0.0.1:{port}");
        let answer = exchange(
            port,
            "GET",
            "/",
            &[("Host", &host), ("Accept", "application/problem+json")],
            &[],
        );
        (
            answer.status,
            serde_json::from_slice(&answer.body).unwrap_or_default(),
        )
    }

    // Case: answers internal-error for a non-JSON stored Meta document
    #[test]
    fn answers_internal_error_at_its_root_and_says_start_up_failed() {
        let migrated = broken();
        let mut started = serve_file(&migrated.file);
        let lines = stderr_lines(&mut started);
        let (status, problem) = root_problem(started.port());
        assert_eq!(status, 500, "{problem}");
        assert_eq!(problem["type"], "urn:infinity-cube:problem:internal-error");
        line_starting(
            &lines,
            "Failed to establish the Meta Space at startup:",
            common::PATIENCE,
        );
    }

    /// Start-up stops once a second retry confirms a failure no wait cures,
    /// five and then ten seconds after the first attempt (ST-10), says so
    /// on standard error, and leaves `serve` serving.
    #[test]
    fn says_start_up_stopped_on_standard_error_and_keeps_serving() {
        let migrated = broken();
        let mut started = serve_file(&migrated.file);
        let lines = stderr_lines(&mut started);
        line_starting(
            &lines,
            "Gave up establishing the Meta Space; restart the host once it is fixable:",
            common::PATIENCE,
        );
        assert!(
            started.still_running_after(Duration::from_millis(100)),
            "still serving"
        );
        let (status, problem) = root_problem(started.port());
        assert_eq!(status, 500, "{problem}");
        assert_eq!(
            get(started.port(), "/api/spaces").status,
            200,
            "the list answers"
        );
        started.signal("INT");
        assert_eq!(started.exited().code(), Some(0));
    }
}
