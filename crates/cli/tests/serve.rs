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
use std::path::{Path, PathBuf};
use std::time::Duration;

use common::{Announcement, Started, corpus, exchange, get, start_in};
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

    #[test]
    fn refuses_an_unset_or_blank_sqlite_path() {
        for value in [None, Some(OsStr::new("")), Some(OsStr::new("   "))] {
            assert_eq!(
                refusal(serve(value)),
                "SQLITE_PATH must name the SQLite database file",
                "SQLITE_PATH {value:?}"
            );
        }
    }

    #[test]
    fn refuses_a_relative_sqlite_path() {
        assert_eq!(
            refusal(serve(Some(OsStr::new("cube.db")))),
            "SQLITE_PATH must be an absolute path: cube.db",
            "a relative path"
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

    #[test]
    fn answers_421_to_a_request_naming_any_host_but_its_own() {
        let migrated = Migrated::fixture();
        let started = serve_file(&migrated.file);
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
}
