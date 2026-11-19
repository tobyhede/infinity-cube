//! A run's writer under tokio's paused time: Export once Edits have been
//! quiet, never without an Edit, never for a read, again after a failure, and
//! on stop (`src/run/run.ts`, Storage ST-65). A test porting a case of
//! `conformance/http/process-cases.ts` carries `// Case: <its name>`, which
//! `test/unit/http-conformance-rust-ports.test.ts` holds to the case list.

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
    EntryKind, Filesystem, ImportError, LOCK_FILE_NAME, MemorySpaceRepository, Run, RunApplication,
    RunEvent, RunStopped, Shell, TokioClock, TokioFilesystem, import_directory,
};
use http::Request;
use http_body::Frame;
use http_conformance::{Counted, FIXTURE_SPACES, META, META_ADDRESS};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio::time::Instant;

/// The last of the fixture's Spaces.
const OTHER_SPACE: &str = FIXTURE_SPACES[3];

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

/// A fresh copy of the tracked fixture, in a temporary directory of its own.
fn fixture_copy() -> (tempfile::TempDir, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("space");
    copy_tree(
        Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/app/fixture"
        )),
        &directory,
    );
    (temporary, directory)
}

async fn start(fs: Flaky) -> Started {
    let (temporary, directory) = fixture_copy();
    let (run, events) = start_on(&directory, fs).await;
    Started {
        _temporary: temporary,
        directory,
        run,
        events,
        started: Instant::now(),
    }
}

/// A run of `directory`, and what its writer reports.
async fn start_on(
    directory: &Path,
    fs: Flaky,
) -> (Run<Counted, Built>, mpsc::UnboundedReceiver<Seen>) {
    let (sender, events) = mpsc::unbounded_channel();
    let run = Run::builder()
        .directory(directory)
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
    (run, events)
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

/// A Space as the API answers it.
async fn load(app: &App, id: &str) -> Value {
    let response = send(app, "GET", &format!("/api/spaces/{id}"), String::new()).await;
    assert_eq!(response.status(), 200, "{id} loads");
    serde_json::from_slice(response.body()).unwrap()
}

/// Rename the Meta Space through the API, as one Edit.
async fn rename(app: &App, title: &str) {
    rename_space(app, META, title).await;
}

/// Rename a Space through the API, as one Edit.
async fn rename_space(app: &App, id: &str, title: &str) {
    let loaded = load(app, id).await;
    let mut snapshot = loaded["snapshot"].clone();
    snapshot["document"]["title"] = json!(title);
    let commit = json!({ "changes": [{
        "kind": "update",
        "spaceId": id,
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

mod given_a_run_with_no_edit {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn writes_nothing_for_a_read_or_on_stop() {
        let mut started = start(Flaky::default()).await;
        let app = Arc::clone(started.run.application());
        let before = meta_title(&started.directory);
        send(&app, "GET", &format!("/api/spaces/{META}"), String::new()).await;
        send(&app, "GET", META_ADDRESS, String::new()).await;
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
}

mod given_an_edit {
    use super::*;

    // Case: writes an edit once edits have been quiet, and keeps it on SIGINT
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
        assert!(
            started.events.try_recv().is_err(),
            "the stop writes nothing already on disk"
        );
        assert_eq!(
            meta_title(&started.directory),
            "Second",
            "the written Edit is kept through the stop"
        );
    }

    // Case: writes an edit not yet written when stopped by SIGINT, and exits zero
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
    async fn a_dropped_run_still_writes_the_edit_not_yet_on_disk() {
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
}

mod given_a_write_that_fails {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn tries_again_after_the_quiet_period() {
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
    async fn reports_no_retry_for_a_last_write_that_fails() {
        let flaky = Flaky::default();
        let mut started = start(flaky.clone()).await;
        let app = Arc::clone(started.run.application());
        flaky.failures.store(usize::MAX, Ordering::SeqCst);
        rename(&app, "Lost").await;
        assert!(
            matches!(started.run.stop().await, RunStopped::Unwritten(_)),
            "the failure is answered"
        );
        assert_eq!(
            started.events.try_recv().ok(),
            None,
            "nothing is tried again once the run has stopped, so no failure is reported as one that will be"
        );
    }
}

mod given_an_empty_directory {
    use super::*;

    #[tokio::test]
    async fn refuses_to_start() {
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
        assert!(
            !temporary.path().join(LOCK_FILE_NAME).exists(),
            "refused before any lock is taken, so no lock file is created"
        );
    }
}

/// A run of `directory` with nothing to hear, or why it did not start.
async fn try_start(directory: &Path) -> Result<Run<Counted, Built>, ImportError> {
    Run::builder()
        .directory(directory)
        .ids(Counted::default())
        .clock(TokioClock)
        .start(Shell::new("<!doctype html>", Built::new()))
        .await
}

/// ADR 0162: a run holds its directory's lock from before Import until its
/// last write has landed.
mod given_a_directory_a_run_holds {
    use super::*;

    #[tokio::test]
    async fn refuses_a_second_run_until_the_first_has_stopped() {
        let (_temporary, directory) = fixture_copy();
        let first = try_start(&directory).await.unwrap();

        let second = try_start(&directory).await;
        assert!(
            matches!(second, Err(ImportError::Locked)),
            "the directory is held: {second:?}"
        );

        assert!(matches!(first.stop().await, RunStopped::Stopped));
        let third = try_start(&directory).await.unwrap();
        assert!(matches!(third.stop().await, RunStopped::Stopped));
    }

    #[tokio::test]
    async fn runs_another_directory_beside_it() {
        let (_held_temporary, held) = fixture_copy();
        let (_other_temporary, other) = fixture_copy();
        let first = try_start(&held).await.unwrap();

        let second = try_start(&other).await.unwrap();

        assert!(matches!(second.stop().await, RunStopped::Stopped));
        assert!(matches!(first.stop().await, RunStopped::Stopped));
    }

    #[tokio::test]
    async fn holds_the_lock_until_the_last_write_has_landed() {
        let flaky = Flaky::default();
        let (_temporary, directory) = fixture_copy();
        let (run, _events) = start_on(&directory, flaky.clone()).await;
        rename(run.application(), "Written on stop").await;
        flaky.holding.store(true, Ordering::SeqCst);
        let stopping = tokio::spawn(run.stop());
        flaky.entered.notified().await;

        let during = try_start(&directory).await;
        assert!(
            matches!(during, Err(ImportError::Locked)),
            "held while the last write is under way: {during:?}"
        );

        flaky.release.notify_one();
        assert!(matches!(stopping.await.unwrap(), RunStopped::Stopped));
        assert_eq!(meta_title(&directory), "Written on stop", "on disk");
        let after = try_start(&directory).await.unwrap();
        assert!(matches!(after.stop().await, RunStopped::Stopped));
    }

    #[tokio::test]
    async fn keeps_its_lock_file_out_of_what_import_and_export_read_and_write() {
        let (_temporary, directory) = fixture_copy();
        let run = try_start(&directory).await.unwrap();
        rename(run.application(), "Written beside the lock file").await;
        assert!(matches!(run.stop().await, RunStopped::Stopped));

        assert_eq!(
            fs::read(directory.join(LOCK_FILE_NAME)).unwrap(),
            Vec::<u8>::new(),
            "the lock file stays, empty"
        );
        assert_eq!(meta_title(&directory), "Written beside the lock file");
        let store = MemorySpaceRepository::new();
        import_directory(&store, &TokioFilesystem, &directory, &Counted::default())
            .await
            .unwrap();
    }
}

/// Every file under `directory`, by its path relative to it, with its bytes,
/// but for the lock file a run creates on starting (ADR 0162), which is no
/// Export's.
fn tree(directory: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn walk(root: &Path, directory: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else if path != root.join(LOCK_FILE_NAME) {
                let bytes = fs::read(&path).unwrap();
                files.insert(path.strip_prefix(root).unwrap().to_owned(), bytes);
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(directory, directory, &mut files);
    files
}

/// The fixture with its Meta Space's Maps removed, so opening it initializes
/// the Space's first Map (Storage ST-65, as `withMaplessMeta` in
/// `conformance/http/process-cases.ts`).
fn mapless_meta_copy() -> (tempfile::TempDir, PathBuf) {
    let (temporary, directory) = fixture_copy();
    let path = directory.join(META).join("space.json");
    let mut space: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let document = space.as_object_mut().unwrap();
    document.remove("maps");
    document.remove("defaultMap");
    fs::write(
        &path,
        format!("{}\n", serde_json::to_string_pretty(&space).unwrap()),
    )
    .unwrap();
    (temporary, directory)
}

fn first_map_titles(loaded: &Value) -> Vec<String> {
    loaded["snapshot"]["document"]["maps"]
        .as_array()
        .unwrap()
        .iter()
        .map(|map_entry| map_entry["title"].as_str().unwrap().to_owned())
        .collect()
}

mod given_a_meta_space_with_no_map {
    use super::*;

    // Case: leaves the directory byte for byte unchanged when opening a Space initializes it (ST-65)
    #[tokio::test(start_paused = true)]
    async fn leaves_the_directory_unchanged_when_opening_it() {
        let (_temporary, directory) = mapless_meta_copy();
        let before = tree(&directory);
        let (run, mut events) = start_on(&directory, Flaky::default()).await;
        let app = Arc::clone(run.application());
        assert_eq!(
            first_map_titles(&load(&app, META).await),
            vec!["Map 1"],
            "opening the Space initializes its first Map"
        );
        assert_eq!(
            send(&app, "GET", META_ADDRESS, String::new())
                .await
                .status(),
            200,
            "its product address"
        );
        assert_eq!(
            send(&app, "HEAD", META_ADDRESS, String::new())
                .await
                .status(),
            200,
            "and HEAD of it"
        );
        tokio::time::sleep(Duration::from_secs(10)).await;
        assert!(events.try_recv().is_err(), "no write past the quiet period");
        assert!(tree(&directory) == before, "unchanged before the stop");
        assert!(
            matches!(run.stop().await, RunStopped::Stopped),
            "stopped cleanly"
        );
        assert!(events.try_recv().is_err(), "no write on stop");
        assert!(tree(&directory) == before, "byte for byte unchanged");
    }

    // Case: initializes the Space again on a second run over the directory the first run left unchanged (ST-65)
    #[tokio::test(start_paused = true)]
    async fn initializes_it_again_on_a_second_run() {
        let (_temporary, directory) = mapless_meta_copy();
        let before = tree(&directory);
        for pass in ["first run", "second run"] {
            let (run, _events) = start_on(&directory, Flaky::default()).await;
            let app = Arc::clone(run.application());
            assert_eq!(
                first_map_titles(&load(&app, META).await),
                vec!["Map 1"],
                "{pass} initializes the first Map"
            );
            assert!(
                matches!(run.stop().await, RunStopped::Stopped),
                "{pass} stops"
            );
            assert!(
                tree(&directory) == before,
                "{pass} leaves the directory unchanged"
            );
        }
    }

    // Case: writes the initialization with the next Edit (ST-65)
    #[tokio::test(start_paused = true)]
    async fn writes_the_initialization_with_the_next_edit() {
        let (_temporary, directory) = mapless_meta_copy();
        let before = tree(&directory);
        let (run, _events) = start_on(&directory, Flaky::default()).await;
        let app = Arc::clone(run.application());
        let opened = load(&app, META).await;
        rename_space(&app, OTHER_SPACE, "Edited after opening").await;
        assert!(matches!(run.stop().await, RunStopped::Stopped), "stopped");
        let written = tree(&directory);
        let meta = Path::new(META).join("space.json");
        let other = Path::new(OTHER_SPACE).join("space.json");
        let meta_file: Value = serde_json::from_slice(&written[&meta]).unwrap();
        let initialized = &opened["snapshot"]["document"];
        assert_eq!(
            meta_file["maps"], initialized["maps"],
            "the Meta Space's file holds the Map its opening initialized"
        );
        assert_eq!(
            meta_file["defaultMap"], meta_file["maps"][0]["id"],
            "and defaults to it"
        );
        let other_file: Value = serde_json::from_slice(&written[&other]).unwrap();
        assert_eq!(
            other_file["title"], "Edited after opening",
            "the Edit is written"
        );
        // The fixture's files are not in Export's key order, so its first write
        // rewrites them: what each holds is compared, not its bytes.
        let parsed = |bytes: &[u8]| serde_json::from_slice::<Value>(bytes).ok();
        let changed: Vec<&PathBuf> = before
            .iter()
            .filter(|(path, _)| **path != meta && **path != other)
            .filter(|(path, bytes)| {
                let now = written.get(*path);
                let same_bytes = now.map(Vec::as_slice) == Some(bytes.as_slice());
                let same_value = matches!(
                    (now.and_then(|now| parsed(now)), parsed(bytes)),
                    (Some(now), Some(then)) if now == then
                );
                !same_bytes && !same_value
            })
            .map(|(path, _)| path)
            .collect();
        assert!(
            changed.is_empty(),
            "no other file holds anything new: {changed:?}"
        );
        assert_eq!(written.len(), before.len(), "no file is added or removed");
    }
}
