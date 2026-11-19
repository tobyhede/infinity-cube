//! `infinity-cube run`, started as a process: its one JSON announcement, the
//! `Host` check, the stop signals and the write on stop, the port it takes,
//! and opening the browser. The HTTP conformance suite
//! (`conformance/http/README.md`) holds the rest of its wire.

#![cfg(unix)]
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod common;

use std::fs;
use std::io::Write as _;
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::time::Duration;

use common::{Announcement, copy_of, corpus, exchange, get, read_tree, start, start_with};

fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
    copy_of(&common::repository().join("packages/app/fixture"))
}

/// A loopback port free when this answers.
fn free_port() -> u16 {
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

/// Poll `condition` every 20ms until it holds, failing with `what` after
/// [`common::PATIENCE`].
fn wait_until(what: &str, mut condition: impl FnMut() -> bool) {
    let deadline = std::time::Instant::now() + common::PATIENCE;
    while !condition() {
        assert!(std::time::Instant::now() < deadline, "{what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

mod given_a_directory_it_can_run {
    use super::*;

    #[test]
    fn announces_the_port_it_listens_on_as_one_json_line() {
        let (_temporary, directory) = fixture();
        // A port free when asked can be taken before the run binds it, by
        // another test's connection among them, so a refusal tries another.
        let (port, run) = (0..5)
            .find_map(|_| {
                let port = free_port();
                let run = start(&[
                    "run",
                    directory.to_str().unwrap(),
                    "--port",
                    &port.to_string(),
                    "--no-open",
                ]);
                matches!(run.announcement, Some(Announcement::Listening(_))).then_some((port, run))
            })
            .expect("a free port within five tries");
        assert_eq!(
            run.announcement,
            Some(Announcement::Listening(port)),
            "the announcement names the port it was given"
        );
        assert_eq!(get(port, "/api/spaces").status, 200, "reachable at once");
    }

    #[test]
    fn answers_421_to_a_request_naming_any_host_but_its_own() {
        let (_temporary, directory) = fixture();
        let run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let port = run.port();
        for other in [
            format!("localhost:{port}"),
            "127.0.0.1".to_owned(),
            format!("127.0.0.1:{}", port.wrapping_add(1)),
            "attacker.example".to_owned(),
        ] {
            let answer = exchange(port, "GET", "/api/spaces", &[("Host", &other)], &[]);
            assert_eq!(answer.status, 421, "{other}");
            assert_eq!(
                answer.header("content-type"),
                Some("text/plain; charset=utf-8"),
                "plain text for {other}"
            );
            assert_eq!(
                answer.header("cache-control"),
                Some("no-store"),
                "never cached"
            );
        }
        let none = exchange(port, "GET", "/api/spaces", &[], &[]);
        assert_eq!(none.status, 421, "no Host at all");
    }

    #[test]
    fn answers_head_with_no_body_and_no_content_length_as_the_node_host_does() {
        let (_temporary, directory) = fixture();
        let run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let port = run.port();
        let host = format!("127.0.0.1:{port}");
        let got = exchange(port, "GET", "/a-page", &[("Host", &host)], &[]);
        assert!(
            got.header("content-length").is_some(),
            "GET carries its length: {:?}",
            got.headers
        );
        let head = exchange(port, "HEAD", "/a-page", &[("Host", &host)], &[]);
        assert_eq!(head.status, got.status, "HEAD answers as GET does");
        assert_eq!(
            head.header("content-length"),
            None,
            "no Content-Length on HEAD: {:?}",
            head.headers
        );
        assert!(head.body.is_empty(), "no body on HEAD");
    }

    #[test]
    fn takes_the_default_port_or_the_next_free_one_without_port() {
        let (_temporary, directory) = fixture();
        let (_other_temporary, other) = fixture();
        let first = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let second = start(&["run", other.to_str().unwrap(), "--no-open"]);
        assert!(first.port() >= 4173, "from 4173 up: {}", first.port());
        // Other tests take ports from 4173 up at the same time, so the
        // second is another free one from 4173 up, not always the next.
        assert!(
            second.port() >= 4173 && second.port() != first.port(),
            "another free one: {} beside {}",
            second.port(),
            first.port()
        );
    }

    #[test]
    fn writes_an_edit_not_yet_on_disk_when_stopped_by_sigint_and_exits_zero() {
        let case = corpus().join("commit/accepted-update");
        let (_temporary, directory) = copy_of(&corpus().join("directory/accepted-ur/aggregate"));
        let mut run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let port = run.port();
        let host = format!("127.0.0.1:{port}");
        let answer = exchange(
            port,
            "POST",
            "/api/spaces",
            &[("Host", &host), ("Content-Type", "application/json")],
            &fs::read(case.join("commit.json")).unwrap(),
        );
        assert_eq!(
            answer.status,
            200,
            "the commit lands: {:?}",
            String::from_utf8_lossy(&answer.body)
        );
        run.signal("INT");
        assert_eq!(run.exited().code(), Some(0), "exits zero: {}", run.stderr());
        assert_eq!(
            read_tree(&directory),
            read_tree(&case.join("next")),
            "the directory holds the edit, as the TypeScript Export writes it"
        );
    }

    #[test]
    fn writes_the_pending_edit_and_exits_zero_on_one_sigint_while_a_request_body_stalls() {
        let case = corpus().join("commit/accepted-update");
        let (_temporary, directory) = copy_of(&corpus().join("directory/accepted-ur/aggregate"));
        let mut run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let port = run.port();
        let host = format!("127.0.0.1:{port}");
        let answer = exchange(
            port,
            "POST",
            "/api/spaces",
            &[("Host", &host), ("Content-Type", "application/json")],
            &fs::read(case.join("commit.json")).unwrap(),
        );
        assert_eq!(answer.status, 200, "the commit lands");
        // A client that sends one byte of a 100-byte body and then nothing.
        let mut stalled = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            stalled,
            "POST /api/spaces HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{{"
        )
        .unwrap();
        // The run accepts connections in order, so its answer on a later
        // connection means it has already accepted the stalled one.
        assert_eq!(
            get(port, "/api/spaces").status,
            200,
            "a later request is answered once the stalled connection is accepted"
        );
        let signalled = std::time::Instant::now();
        run.signal("INT");
        let status = run.exited();
        let took = signalled.elapsed();
        assert_eq!(status.code(), Some(0), "exits zero: {}", run.stderr());
        assert!(
            took < Duration::from_secs(10),
            "the stop is bounded, not held by the stalled client: {took:?}"
        );
        assert_eq!(
            read_tree(&directory),
            read_tree(&case.join("next")),
            "the pending edit is written"
        );
        drop(stalled);
    }

    #[test]
    fn stops_on_sigterm_and_on_sighup_as_on_sigint_leaving_the_directory_unchanged() {
        for signal in ["TERM", "HUP"] {
            let (_temporary, directory) = fixture();
            let before = read_tree(&directory);
            let mut run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
            let _port = run.port();
            run.signal(signal);
            assert_eq!(run.exited().code(), Some(0), "SIG{signal} exits zero");
            assert_eq!(
                read_tree(&directory),
                before,
                "nothing written after SIG{signal}"
            );
        }
    }

    #[test]
    fn exits_at_once_non_zero_on_a_second_signal_while_it_is_stopping() {
        let (_temporary, directory) = fixture();
        let mut run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let port = run.port();
        // A request still arriving keeps the stop waiting for it.
        let mut slow = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            slow,
            "POST /api/spaces HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{{"
        )
        .unwrap();
        assert_eq!(
            get(port, "/api/spaces").status,
            200,
            "a later request is answered once the slow connection is accepted"
        );
        run.signal("INT");
        assert!(
            run.still_running_after(Duration::from_millis(300)),
            "the first signal waits for the request being answered (still running after a 300ms window)"
        );
        run.signal("INT");
        assert_eq!(
            run.exited().code(),
            Some(1),
            "the second exits at once, one"
        );
        assert!(
            run.stderr()
                .contains("Exiting without waiting for the last write."),
            "says why"
        );
    }

    #[test]
    fn opens_the_browser_at_its_own_address_unless_no_open() {
        let (temporary, directory) = fixture();
        // A stand-in opener on PATH, so no browser is opened.
        let bin = temporary.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        let opened = temporary.path().join("opened");
        let opener = bin.join(if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        });
        fs::write(
            &opener,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$1\" >> '{}'\n",
                opened.display()
            ),
        )
        .unwrap();
        let mut permissions = fs::metadata(&opener).unwrap().permissions();
        std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o755);
        fs::set_permissions(&opener, permissions).unwrap();

        let quiet = start_with(
            &["run", directory.to_str().unwrap(), "--no-open"],
            Some(bin.as_os_str()),
        );
        let _port = quiet.port();
        // A sleep, not a poll: the assertion is that nothing happens in the window.
        std::thread::sleep(Duration::from_millis(300));
        assert!(
            !opened.exists(),
            "--no-open opens nothing within 300ms of listening"
        );
        drop(quiet);

        let run = start_with(&["run", directory.to_str().unwrap()], Some(bin.as_os_str()));
        let port = run.port();
        wait_until("the opener should run and write the address", || {
            fs::read_to_string(&opened).is_ok_and(|text| text.ends_with('\n'))
        });
        assert_eq!(
            fs::read_to_string(&opened).unwrap(),
            format!("http://127.0.0.1:{port}/\n"),
            "opened at its own address, the one its Host check admits"
        );
    }
}

mod given_a_directory_it_cannot_run {
    use super::*;

    #[test]
    fn announces_a_missing_one_refused_naming_pnpm_cube_init_and_exits_one() {
        let temporary = tempfile::tempdir().unwrap();
        let missing = temporary.path().join("missing");
        let mut run = start(&["run", missing.to_str().unwrap(), "--no-open"]);
        let Some(Announcement::Refused(message)) = run.announcement.clone() else {
            panic!("expected a refusal, got {:?}", run.announcement);
        };
        // Single-quoted where a shell would split or expand it, as on Windows.
        let shown = missing.display();
        assert!(
            message.contains(&format!("pnpm cube init {shown}"))
                || message.contains(&format!("pnpm cube init '{shown}'")),
            "names init: {message}"
        );
        assert_eq!(run.exited().code(), Some(1), "exits one");
    }

    #[test]
    fn announces_intake_refusals_with_their_kind_and_location() {
        let (_temporary, directory) =
            copy_of(&corpus().join("directory/meta-space-missing/aggregate"));
        let mut run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let Some(Announcement::Refused(message)) = run.announcement.clone() else {
            panic!("expected a refusal, got {:?}", run.announcement);
        };
        assert!(
            message.contains("(meta-space-missing at aggregate.json, field metaSpaceId)"),
            "kind and location: {message}"
        );
        assert_eq!(run.exited().code(), Some(1), "exits one");
    }

    #[test]
    fn announces_a_port_it_cannot_take_refused() {
        let (_temporary, directory) = fixture();
        let taken = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = taken.local_addr().unwrap().port();
        let mut run = start(&[
            "run",
            directory.to_str().unwrap(),
            "--port",
            &port.to_string(),
            "--no-open",
        ]);
        assert!(
            matches!(&run.announcement, Some(Announcement::Refused(message)) if message.contains(&port.to_string())),
            "refused naming the port: {:?}",
            run.announcement
        );
        assert_eq!(run.exited().code(), Some(1), "exits one");
    }

    #[test]
    fn announces_a_built_directory_with_no_page_refused() {
        let (temporary, directory) = fixture();
        let built = temporary.path().join("built");
        fs::create_dir_all(&built).unwrap();
        let mut run = start(&[
            "run",
            directory.to_str().unwrap(),
            "--no-open",
            "--built",
            built.to_str().unwrap(),
        ]);
        assert!(
            matches!(&run.announcement, Some(Announcement::Refused(message)) if message.contains("index.html")),
            "refused naming the page: {:?}",
            run.announcement
        );
        assert_eq!(run.exited().code(), Some(1), "exits one");
    }
}

/// What the binary announces for a directory another run holds (ADR 0162).
fn locked(directory: &std::path::Path) -> Option<Announcement> {
    Some(Announcement::Refused(format!(
        "{} is open in another run of InfinityCube: stop that run before starting this one.",
        directory.display()
    )))
}

mod given_a_directory_another_run_holds {
    use super::*;

    #[test]
    fn announces_a_second_run_refused_naming_the_directory_and_exits_one() {
        let (_temporary, directory) = fixture();
        let holder = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let _port = holder.port();

        let mut second = start(&["run", directory.to_str().unwrap(), "--no-open"]);

        assert_eq!(
            second.announcement,
            locked(&directory),
            "refused, naming it"
        );
        assert_eq!(second.exited().code(), Some(1), "exits one");
    }

    #[test]
    fn runs_it_once_the_holder_is_killed() {
        let (_temporary, directory) = fixture();
        let mut holder = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let _port = holder.port();

        holder.signal("KILL");
        let _killed = holder.exited();

        let after = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let _listening = after.port();
    }

    #[test]
    fn runs_another_directory_beside_it() {
        let (_temporary, directory) = fixture();
        let (_other_temporary, other) = fixture();
        let holder = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let _port = holder.port();

        let beside = start(&["run", other.to_str().unwrap(), "--no-open"]);
        let _listening = beside.port();
    }
}

/// The TypeScript host's lock, taken by Node through
/// `src/run/directory-lock.ts` itself, which Node 26 runs as TypeScript. It
/// prints `locked` and holds the lock until its standard input closes, or
/// `held` when another run holds it, and exits.
const NODE_LOCK: &str = r"
const [module, directory] = process.argv.slice(1);
const { lockDirectory } = await import(module);
const lock = lockDirectory(directory);
if (lock === 'held') {
  process.stdout.write('held\n');
  process.exit(0);
}
process.stdout.write('locked\n');
process.stdin.on('end', () => {
  lock.release();
  process.exit(0);
});
process.stdin.resume();
";

/// Node taking the TypeScript host's lock on `directory`, and its first line.
fn node_lock(directory: &std::path::Path) -> (std::process::Child, String) {
    use std::io::BufRead as _;
    let module = common::repository().join("src/run/directory-lock.ts");
    let mut child = std::process::Command::new("node")
        .args(["--input-type=module", "--eval", NODE_LOCK])
        .arg(module.canonicalize().unwrap())
        .arg(directory)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("node, as the repository's .node-version names, is on PATH");
    let mut line = String::new();
    std::io::BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    (child, line.trim_end().to_owned())
}

mod given_a_directory_a_node_run_holds {
    use super::*;

    #[test]
    fn announces_the_run_refused_and_runs_it_once_node_lets_go() {
        let (_temporary, directory) = fixture();
        let (mut node, said) = node_lock(&directory);
        assert_eq!(said, "locked", "Node holds the lock");

        let mut refused = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        assert_eq!(
            refused.announcement,
            locked(&directory),
            "refused, naming it"
        );
        assert_eq!(refused.exited().code(), Some(1), "exits one");

        drop(node.stdin.take());
        assert!(node.wait().unwrap().success(), "Node let go");
        let after = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let _listening = after.port();
    }
}

mod given_a_directory_this_binary_runs {
    use super::*;

    #[test]
    fn refuses_node_the_lock_until_the_run_has_stopped() {
        let (_temporary, directory) = fixture();
        let mut run = start(&["run", directory.to_str().unwrap(), "--no-open"]);
        let _port = run.port();

        let (mut refused, said) = node_lock(&directory);
        assert_eq!(said, "held", "the run holds the lock");
        assert!(refused.wait().unwrap().success());

        run.signal("INT");
        assert_eq!(run.exited().code(), Some(0), "stopped");
        let (mut node, said) = node_lock(&directory);
        assert_eq!(
            said, "locked",
            "Node takes the lock once the run has stopped"
        );
        drop(node.stdin.take());
        assert!(node.wait().unwrap().success());
    }
}

mod given_a_usage_error {
    use super::*;

    #[test]
    fn announces_nothing_and_exits_two() {
        let mut run = start(&["run", "--port", "0", "talk"]);
        assert_eq!(run.announcement, None, "no announcement");
        assert_eq!(run.exited().code(), Some(2), "a usage error");
    }
}
