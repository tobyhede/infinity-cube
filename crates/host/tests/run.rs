//! A run's writer under tokio's paused time: Export once Edits have been
//! quiet, never without an Edit, never for a read, again after a failure, and
//! on stop (`src/run/run.ts`, Storage ST-65).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::{BTreeMap, VecDeque};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::task::{Context, Poll};
use std::time::Duration;

use bytes::Bytes;
use host::{
    EntryKind, Filesystem, IdSource, ImportError, Run, RunApplication, RunEvent, RunStopped, Shell,
    TokioClock, TokioFilesystem,
};
use http::Request;
use http_body::Frame;
use intake::Uuid;
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio::time::Instant;

const META: &str = "00000000-0000-4000-8000-000000000040";

#[derive(Default)]
struct Counted(AtomicUsize);

impl IdSource for Counted {
    fn new_id(&self) -> Uuid {
        let next = self.0.fetch_add(1, Ordering::SeqCst) + 1;
        Uuid::parse(&format!("00000000-0000-4000-8000-{next:012x}")).unwrap()
    }
}

/// The real filesystem, except that the next `failures` new files fail.
#[derive(Clone, Default)]
struct Flaky {
    failures: Arc<AtomicUsize>,
    /// Hold the next new file until `release`, announcing it on `entered`.
    holding: Arc<std::sync::atomic::AtomicBool>,
    entered: Arc<tokio::sync::Notify>,
    release: Arc<tokio::sync::Notify>,
}

impl Filesystem for Flaky {
    async fn list(&self, directory: &Path) -> io::Result<Vec<(String, EntryKind)>> {
        TokioFilesystem.list(directory).await
    }
    async fn kind(&self, path: &Path) -> io::Result<Option<EntryKind>> {
        TokioFilesystem.kind(path).await
    }
    async fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        TokioFilesystem.read(path).await
    }
    async fn create_dir_all(&self, directory: &Path) -> io::Result<()> {
        TokioFilesystem.create_dir_all(directory).await
    }
    async fn create_new(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        let failing = self
            .failures
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                left.checked_sub(1)
            })
            .is_ok();
        if failing {
            return Err(io::Error::other("the disk is full"));
        }
        if self.holding.swap(false, Ordering::SeqCst) {
            self.entered.notify_one();
            self.release.notified().await;
        }
        TokioFilesystem.create_new(path, bytes).await
    }
    async fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        TokioFilesystem.rename(from, to).await
    }
    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        TokioFilesystem.remove_file(path).await
    }
    async fn remove_dir(&self, path: &Path) -> io::Result<()> {
        TokioFilesystem.remove_dir(path).await
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Seen {
    Written,
    Failed,
}

type Built = BTreeMap<String, Bytes>;
type App = RunApplication<Counted, Built>;

fn copy_tree(from: &Path, to: &Path) {
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

struct Started {
    _temporary: tempfile::TempDir,
    directory: PathBuf,
    run: Run<Counted, Built>,
    events: mpsc::UnboundedReceiver<Seen>,
    started: Instant,
}

async fn start(fs: Flaky) -> Started {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("talk");
    copy_tree(
        Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/app/fixture"
        )),
        &directory,
    );
    let (sender, events) = mpsc::unbounded_channel();
    let run = Run::builder()
        .directory(&directory)
        .ids(Counted::default())
        .clock(TokioClock)
        .filesystem(fs)
        .on_event(move |event| {
            let seen = match event {
                RunEvent::Written => Seen::Written,
                _ => Seen::Failed,
            };
            sender.send(seen).unwrap();
        })
        .start(Shell::new("<!doctype html>", Built::new()))
        .await
        .unwrap();
    Started {
        _temporary: temporary,
        directory,
        run,
        events,
        started: Instant::now(),
    }
}

struct Chunks(VecDeque<Bytes>);

impl http_body::Body for Chunks {
    type Data = Bytes;
    type Error = std::convert::Infallible;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        _: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Self::Error>>> {
        Poll::Ready(self.0.pop_front().map(|chunk| Ok(Frame::data(chunk))))
    }
}

async fn send(app: &App, method: &str, path: &str, body: String) -> http::Response<Bytes> {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(Chunks(VecDeque::from([Bytes::from(body)])))
        .unwrap();
    app.handle(request).await
}

/// Rename the Meta Space through the API, as one Edit.
async fn rename(app: &App, title: &str) {
    let loaded: Value = serde_json::from_slice(
        send(app, "GET", &format!("/api/spaces/{META}"), String::new())
            .await
            .body(),
    )
    .unwrap();
    let mut snapshot = loaded["snapshot"].clone();
    snapshot["document"]["title"] = json!(title);
    let commit = json!({ "changes": [{
        "kind": "update",
        "spaceId": META,
        "snapshot": snapshot,
        "expectedRevision": loaded["revision"],
    }]});
    let response = send(app, "POST", "/api/spaces", commit.to_string()).await;
    assert_eq!(response.status(), 200, "renamed to {title}");
}

fn meta_title(directory: &Path) -> String {
    let text = fs::read_to_string(directory.join(META).join("space.json")).unwrap();
    serde_json::from_str::<Value>(&text).unwrap()["title"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn elapsed(started: Instant) -> Duration {
    Instant::now() - started
}

#[tokio::test(start_paused = true)]
async fn writes_nothing_without_an_edit_and_nothing_for_a_read() {
    let mut started = start(Flaky::default()).await;
    let app = Arc::clone(started.run.application());
    let before = meta_title(&started.directory);
    send(&app, "GET", &format!("/api/spaces/{META}"), String::new()).await;
    send(&app, "GET", "/spaces/AAAAAAAAQACAAAAAAAAAQA", String::new()).await;
    tokio::time::sleep(Duration::from_secs(10)).await;
    assert!(started.events.try_recv().is_err(), "no write");
    assert!(
        matches!(started.run.stop().await, RunStopped::Stopped),
        "stopped cleanly"
    );
    assert!(started.events.try_recv().is_err(), "no write on stop");
    assert_eq!(
        meta_title(&started.directory),
        before,
        "the file is untouched"
    );
}

#[tokio::test(start_paused = true)]
async fn writes_once_edits_have_been_quiet_for_a_second() {
    let mut started = start(Flaky::default()).await;
    let app = Arc::clone(started.run.application());
    rename(&app, "First").await;
    tokio::time::sleep(Duration::from_millis(500)).await;
    rename(&app, "Second").await;
    tokio::time::sleep(Duration::from_millis(900)).await;
    assert!(
        started.events.try_recv().is_err(),
        "the second Edit restarted the quiet period"
    );
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Written),
        "one write"
    );
    assert!(
        elapsed(started.started) >= Duration::from_millis(1500),
        "a second after the last Edit: {:?}",
        elapsed(started.started)
    );
    assert_eq!(
        meta_title(&started.directory),
        "Second",
        "the last Edit is on disk"
    );
    tokio::time::sleep(Duration::from_secs(5)).await;
    assert!(started.events.try_recv().is_err(), "no further write");
    assert!(
        matches!(started.run.stop().await, RunStopped::Stopped),
        "stopped"
    );
}

#[tokio::test(start_paused = true)]
async fn stop_writes_the_edit_not_yet_on_disk() {
    let mut started = start(Flaky::default()).await;
    let app = Arc::clone(started.run.application());
    rename(&app, "Flushed").await;
    assert!(
        matches!(started.run.stop().await, RunStopped::Stopped),
        "stopped"
    );
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Written),
        "written on stop"
    );
    assert!(
        elapsed(started.started) < Duration::from_secs(1),
        "without waiting out the quiet period"
    );
    assert_eq!(meta_title(&started.directory), "Flushed", "on disk");
}

#[tokio::test(start_paused = true)]
async fn tries_a_failed_write_again_after_the_quiet_period() {
    let flaky = Flaky::default();
    let mut started = start(flaky.clone()).await;
    let app = Arc::clone(started.run.application());
    flaky.failures.store(1, Ordering::SeqCst);
    rename(&app, "Retried").await;
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Failed),
        "the first write fails"
    );
    let failed_at = elapsed(started.started);
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Written),
        "the retry lands"
    );
    assert!(
        elapsed(started.started) - failed_at >= Duration::from_secs(1),
        "after the quiet period"
    );
    assert_eq!(meta_title(&started.directory), "Retried", "on disk");
    assert!(
        matches!(started.run.stop().await, RunStopped::Stopped),
        "stopped"
    );
}

#[tokio::test(start_paused = true)]
async fn stop_answers_unwritten_when_the_last_write_fails() {
    let flaky = Flaky::default();
    let started = start(flaky.clone()).await;
    let app = Arc::clone(started.run.application());
    flaky.failures.store(usize::MAX, Ordering::SeqCst);
    rename(&app, "Lost").await;
    assert!(
        matches!(started.run.stop().await, RunStopped::Unwritten(_)),
        "the failure is answered"
    );
}

#[tokio::test(start_paused = true)]
async fn writes_once_more_for_an_edit_made_during_a_write() {
    let flaky = Flaky::default();
    let mut started = start(flaky.clone()).await;
    let app = Arc::clone(started.run.application());
    flaky.holding.store(true, Ordering::SeqCst);
    rename(&app, "During one").await;
    flaky.entered.notified().await;
    rename(&app, "During two").await;
    flaky.release.notify_one();
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Written),
        "the write in flight"
    );
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Written),
        "one more write"
    );
    tokio::time::sleep(Duration::from_secs(5)).await;
    assert!(started.events.try_recv().is_err(), "and no third");
    assert_eq!(
        meta_title(&started.directory),
        "During two",
        "the last Edit is on disk"
    );
    assert!(
        matches!(started.run.stop().await, RunStopped::Stopped),
        "stopped"
    );
}

#[tokio::test(start_paused = true)]
async fn stop_writes_an_edit_made_during_its_own_write_before_it_answers() {
    let flaky = Flaky::default();
    let started = start(flaky.clone()).await;
    let app = Arc::clone(started.run.application());
    flaky.holding.store(true, Ordering::SeqCst);
    rename(&app, "Before stop").await;
    let stopping = tokio::spawn(started.run.stop());
    flaky.entered.notified().await;
    rename(&app, "During stop").await;
    flaky.release.notify_one();
    assert!(
        matches!(stopping.await.unwrap(), RunStopped::Stopped),
        "stopped"
    );
    assert_eq!(
        meta_title(&started.directory),
        "During stop",
        "the Edit made during the stop's write is on disk"
    );
}

#[tokio::test]
async fn refuses_an_empty_directory() {
    let temporary = tempfile::tempdir().unwrap();
    fs::create_dir(temporary.path().join(".git")).unwrap();
    let refused = Run::builder()
        .directory(temporary.path())
        .ids(Counted::default())
        .clock(TokioClock)
        .start(Shell::new("", Built::new()))
        .await;
    assert!(
        matches!(refused, Err(ImportError::Empty)),
        "dot-entries do not count: {refused:?}"
    );
}

#[tokio::test(start_paused = true)]
async fn a_run_dropped_without_stop_still_writes_the_edit_not_yet_on_disk() {
    let mut started = start(Flaky::default()).await;
    let app = Arc::clone(started.run.application());
    rename(&app, "Dropped").await;
    drop(started.run);
    assert_eq!(
        started.events.recv().await,
        Some(Seen::Written),
        "written on the writer's own task"
    );
    assert_eq!(meta_title(&started.directory), "Dropped", "on disk");
}
