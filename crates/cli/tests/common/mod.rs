//! What the binary's tests share: the corpus, trees of files, the binary
//! started as a process, and HTTP/1.1 spoken over a plain socket so a test
//! chooses every header, `Host` included.

#![allow(dead_code, reason = "each test file uses its own share of these")]

use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead as _, BufReader, Read as _, Write as _};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde_json::Value;

pub const BINARY: &str = env!("CARGO_BIN_EXE_infinity-cube");

/// Long enough for a debug binary to start or stop on a loaded machine.
pub const PATIENCE: Duration = Duration::from_secs(30);

pub fn repository() -> PathBuf {
    PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
}

pub fn corpus() -> PathBuf {
    repository().join("conformance/intake")
}

pub fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let path = entry.unwrap().path();
        let target = to.join(path.file_name().unwrap());
        if path.is_dir() {
            copy_tree(&path, &target);
        } else {
            fs::copy(&path, &target).unwrap();
        }
    }
}

/// Every file below `root`, by path relative to it with `/` between segments,
/// but for the lock file a run creates on starting (ADR 0162), which is no
/// Export's.
pub fn read_tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path == root.join(host::LOCK_FILE_NAME) {
                continue;
            }
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                let relative = path
                    .strip_prefix(root)
                    .unwrap()
                    .components()
                    .map(|part| part.as_os_str().to_str().unwrap().to_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                files.insert(relative, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(root, root, &mut files);
    files
}

/// A fresh copy of `aggregate` in a temporary directory of its own.
pub fn copy_of(aggregate: &Path) -> (tempfile::TempDir, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("space");
    copy_tree(aggregate, &directory);
    (temporary, directory)
}

/// What a run announced on standard output.
#[derive(Debug, Clone, PartialEq)]
pub enum Announcement {
    Listening(u16),
    Refused(String),
}

fn announcement(line: &str) -> Option<Announcement> {
    let value: Value = serde_json::from_str(line).ok()?;
    match value["kind"].as_str()? {
        "listening" => Some(Announcement::Listening(
            u16::try_from(value["port"].as_u64()?).ok()?,
        )),
        "refused" => Some(Announcement::Refused(value["message"].as_str()?.to_owned())),
        _ => None,
    }
}

/// The binary, started with `args`, and what it announced.
pub struct Started {
    pub child: Child,
    /// `None` when standard output ended without an announcement.
    pub announcement: Option<Announcement>,
    /// Every line of standard output, the announcement among them.
    pub lines: mpsc::Receiver<String>,
}

impl Started {
    pub fn port(&self) -> u16 {
        match self.announcement {
            Some(Announcement::Listening(port)) => port,
            ref other => panic!("expected the run to listen, it announced {other:?}"),
        }
    }

    #[cfg(unix)]
    pub fn signal(&self, name: &str) {
        let status = Command::new("kill")
            .arg(format!("-{name}"))
            .arg(self.child.id().to_string())
            .status()
            .unwrap();
        assert!(status.success(), "kill -{name} should be sent");
    }

    /// The exit status, waiting at most [`PATIENCE`].
    pub fn exited(&mut self) -> ExitStatus {
        let deadline = Instant::now() + PATIENCE;
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                return status;
            }
            assert!(Instant::now() < deadline, "the binary should exit");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    /// Whether the binary is still running after `duration`.
    pub fn still_running_after(&mut self, duration: Duration) -> bool {
        std::thread::sleep(duration);
        self.child.try_wait().unwrap().is_none()
    }

    pub fn stderr(&mut self) -> String {
        let mut text = String::new();
        if let Some(stderr) = self.child.stderr.as_mut() {
            let _read = stderr.read_to_string(&mut text);
        }
        text
    }
}

impl Drop for Started {
    fn drop(&mut self) {
        let _killed = self.child.kill();
        let _reaped = self.child.wait();
    }
}

/// Start the binary with `args` and `path` as its `PATH` when given, and
/// wait for its announcement.
pub fn start_with(args: &[&str], path: Option<&std::ffi::OsStr>) -> Started {
    match path {
        Some(path) => start_in(args, &[("PATH", Some(path))]),
        None => start_in(args, &[]),
    }
}

/// Start the binary with `args`, each variable of `environment` set to its
/// value or, for `None`, removed, and wait for its announcement.
pub fn start_in(args: &[&str], environment: &[(&str, Option<&std::ffi::OsStr>)]) -> Started {
    start_from(None, args, environment)
}

/// [`start_in`], with `directory` as the working directory when given.
pub fn start_from(
    directory: Option<&Path>,
    args: &[&str],
    environment: &[(&str, Option<&std::ffi::OsStr>)],
) -> Started {
    let mut command = Command::new(BINARY);
    if let Some(directory) = directory {
        command.current_dir(directory);
    }
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, value) in environment {
        match value {
            Some(value) => command.env(name, value),
            None => command.env_remove(name),
        };
    }
    let mut child = command.spawn().unwrap();
    let stdout = child.stdout.take().unwrap();
    let (sender, lines) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let deadline = Instant::now() + PATIENCE;
    let mut found = None;
    while found.is_none() {
        let left = deadline.saturating_duration_since(Instant::now());
        match lines.recv_timeout(left) {
            Ok(line) => found = announcement(&line),
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => panic!("the binary did not announce itself"),
        }
    }
    Started {
        child,
        announcement: found,
        lines,
    }
}

pub fn start(args: &[&str]) -> Started {
    start_with(args, None)
}

/// A response: its status, its headers (names in lower case) and its body.
#[derive(Debug)]
pub struct Answer {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Answer {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(found, _)| found == name)
            .map(|(_, value)| value.as_str())
    }
}

/// Send one request on a connection of its own, with exactly `headers`
/// (and a `Content-Length` for a body), and read the whole response.
pub fn exchange(
    port: u16,
    method: &str,
    target: &str,
    headers: &[(&str, &str)],
    body: &[u8],
) -> Answer {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.set_read_timeout(Some(PATIENCE)).unwrap();
    let mut request = format!("{method} {target} HTTP/1.1\r\nConnection: close\r\n");
    for (name, value) in headers {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    if !body.is_empty() {
        request.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).unwrap();
    stream.write_all(body).unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).unwrap();
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .unwrap();
    let head = String::from_utf8(response[..split].to_vec()).unwrap();
    let mut head_lines = head.split("\r\n");
    let status = head_lines
        .next()
        .unwrap()
        .split(' ')
        .nth(1)
        .unwrap()
        .parse()
        .unwrap();
    let headers = head_lines
        .map(|line| {
            let (name, value) = line.split_once(':').unwrap();
            (name.trim().to_ascii_lowercase(), value.trim().to_owned())
        })
        .collect();
    Answer {
        status,
        headers,
        body: response[split + 4..].to_vec(),
    }
}

/// A GET naming the run's own `Host`.
pub fn get(port: u16, target: &str) -> Answer {
    let host = format!("127.0.0.1:{port}");
    exchange(port, "GET", target, &[("Host", &host)], &[])
}
