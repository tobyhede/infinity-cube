//! A last write that never ends, as the desktop shell's "Close without
//! saving" leaves one for the process's exit to cut short (Storage ST-122):
//! wherever Export stops, every file Import reads holds either the bytes it
//! had or the bytes Export meant to write, never a part of them, and the
//! directory still Imports. A file being written is a dot-prefixed temporary
//! file until it is renamed over its target (ST-55), and only that
//! temporary file can be left part-written.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use bytes::Bytes;
use host::{
    EntryKind, Filesystem, MemorySpaceRepository, RandomIds, Run, RunApplication, Shell,
    TokioClock, TokioFilesystem, import_directory,
};
use http_body_util::Full;
use serde_json::{Value, json};
use tokio::sync::Notify;

const META: &str = "00000000-0000-4000-8000-000000000040";

type Built = BTreeMap<String, Bytes>;

/// The real filesystem, except that once armed, its change number `stop_at`
/// (counting each file created, renamed or removed and each directory
/// created or removed) never ends; a file being created has half its bytes
/// written first, as a process cut short mid-write leaves it.
#[derive(Clone)]
struct Stalling {
    changes: Arc<AtomicUsize>,
    armed: Arc<std::sync::atomic::AtomicBool>,
    stop_at: usize,
    stalled: Arc<Notify>,
}

impl Stalling {
    fn new(stop_at: usize) -> Self {
        Self {
            changes: Arc::default(),
            armed: Arc::default(),
            stop_at,
            stalled: Arc::new(Notify::new()),
        }
    }

    /// Whether this change is the one that never ends.
    fn stalls(&self) -> bool {
        self.armed.load(Ordering::SeqCst)
            && self.changes.fetch_add(1, Ordering::SeqCst) == self.stop_at
    }

    async fn stall(&self) -> ! {
        self.stalled.notify_one();
        std::future::pending().await
    }
}

impl Filesystem for Stalling {
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
        if self.stalls() {
            self.stall().await;
        }
        TokioFilesystem.create_dir_all(directory).await
    }
    async fn create_new(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        if self.stalls() {
            TokioFilesystem
                .create_new(path, &bytes[..bytes.len() / 2])
                .await?;
            self.stall().await;
        }
        TokioFilesystem.create_new(path, bytes).await
    }
    async fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        if self.stalls() {
            self.stall().await;
        }
        TokioFilesystem.rename(from, to).await
    }
    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        if self.stalls() {
            self.stall().await;
        }
        TokioFilesystem.remove_file(path).await
    }
    async fn remove_dir(&self, path: &Path) -> io::Result<()> {
        if self.stalls() {
            self.stall().await;
        }
        TokioFilesystem.remove_dir(path).await
    }
}

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

/// Every file below `directory` that is not dot-prefixed (what Import may
/// read), with its bytes, and the dot-prefixed ones apart.
fn files(directory: &Path) -> (BTreeMap<PathBuf, Vec<u8>>, Vec<PathBuf>) {
    let mut read = BTreeMap::new();
    let mut hidden = Vec::new();
    let mut pending = vec![directory.to_path_buf()];
    while let Some(next) = pending.pop() {
        for entry in fs::read_dir(&next).unwrap() {
            let path = entry.unwrap().path();
            let relative = path.strip_prefix(directory).unwrap().to_path_buf();
            if path.file_name().unwrap().to_string_lossy().starts_with('.') {
                hidden.push(relative);
            } else if path.is_dir() {
                pending.push(path);
            } else {
                let _ = read.insert(relative, fs::read(&path).unwrap());
            }
        }
    }
    (read, hidden)
}

async fn send(
    app: &RunApplication<RandomIds, Built>,
    method: &str,
    path: &str,
    body: String,
) -> http::Response<Bytes> {
    let request = http::Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body)))
        .unwrap();
    app.handle(request).await
}

/// Rename the Meta Space, as one Edit.
async fn edit(app: &RunApplication<RandomIds, Built>) {
    let loaded: Value = serde_json::from_slice(
        send(app, "GET", &format!("/api/spaces/{META}"), String::new())
            .await
            .body(),
    )
    .unwrap();
    let mut snapshot = loaded["snapshot"].clone();
    snapshot["document"]["title"] = json!("Written or not at all");
    let commit = json!({ "changes": [{
        "kind": "update",
        "spaceId": META,
        "snapshot": snapshot,
        "expectedRevision": loaded["revision"],
    }]});
    let response = send(app, "POST", "/api/spaces", commit.to_string()).await;
    assert_eq!(response.status(), 200, "the edit is committed");
}

struct Outcome {
    _temporary: tempfile::TempDir,
    directory: PathBuf,
    /// Whether the write stalled, rather than ending.
    stalled: bool,
}

/// Run a copy of the fixture, edit it, and stop the run, its filesystem
/// never ending change number `stop_at` (`usize::MAX` for none).
async fn edit_and_stop(stop_at: usize) -> Outcome {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("talk");
    copy_tree(
        Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/app/fixture"
        )),
        &directory,
    );
    let fs = Stalling::new(stop_at);
    let run = Run::builder()
        .directory(&directory)
        .ids(RandomIds)
        .clock(TokioClock)
        .filesystem(fs.clone())
        .start(Shell::new("<!doctype html>", Built::new()))
        .await
        .unwrap();
    fs.armed.store(true, Ordering::SeqCst);
    edit(run.application()).await;
    let stalled = tokio::select! {
        () = fs.stalled.notified() => true,
        _stopped = run.stop() => false,
    };
    Outcome {
        _temporary: temporary,
        directory,
        stalled,
    }
}

mod given_a_write_that_never_ends {
    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn leaves_no_file_part_written() {
        let fixture = Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/app/fixture"
        ));
        let (before, _) = files(fixture);
        let finished = edit_and_stop(usize::MAX).await;
        assert!(!finished.stalled, "with no stall the write ends");
        let (after, _) = files(&finished.directory);
        assert_ne!(before, after, "the edit changes the directory");

        let mut stalled_somewhere = 0;
        for stop_at in 0.. {
            let outcome = edit_and_stop(stop_at).await;
            if !outcome.stalled {
                break;
            }
            stalled_somewhere += 1;
            let (now, hidden) = files(&outcome.directory);
            for (path, bytes) in &now {
                assert!(
                    before.get(path) == Some(bytes) || after.get(path) == Some(bytes),
                    "stalled at change {stop_at}: {} holds bytes neither before nor after the write",
                    path.display()
                );
            }
            for path in before.keys().filter(|path| after.contains_key(*path)) {
                assert!(
                    now.contains_key(path),
                    "stalled at change {stop_at}: {} is gone",
                    path.display()
                );
            }
            for path in &hidden {
                assert!(
                    path.to_string_lossy().ends_with(".export-write"),
                    "stalled at change {stop_at}: only Export's own temporary file is left beside, got {}",
                    path.display()
                );
            }
            let repository = MemorySpaceRepository::new();
            assert!(
                import_directory(
                    &repository,
                    &TokioFilesystem,
                    &outcome.directory,
                    &RandomIds
                )
                .await
                .is_ok(),
                "stalled at change {stop_at}: the directory still Imports"
            );
        }
        assert!(stalled_somewhere > 0, "the write was stalled at least once");
    }
}
