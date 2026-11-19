//! Commits sent at once, on a multi-threaded runtime, at the memory store and
//! at the Application in front of it: of the commits made at one revision
//! exactly one lands and every other is answered a conflict, and the
//! revision advances by one for each commit that lands, so no accepted write
//! is lost.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use bytes::Bytes;
use host::{
    Application, CommitResult, MemorySpaceRepository, Revision, Shell, SpaceChange, SpaceCommit,
    SpaceRepository, TokioFilesystem, import_directory,
};
use http::{Request, Response};
use http_body::Frame;
use http_conformance::{Counted, META};
use intake::SpaceId;
use serde_json::{Value, json};
use tokio::sync::Barrier;

/// How many commits are sent at once.
const CONCURRENCY: usize = 32;

type Built = BTreeMap<String, Bytes>;
type Host = Application<MemorySpaceRepository, Counted, Built>;

fn meta() -> SpaceId {
    SpaceId::parse(META).unwrap()
}

/// A memory store holding a fresh Import of the tracked fixture.
async fn imported() -> MemorySpaceRepository {
    let store = MemorySpaceRepository::new();
    let fixture = PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/app/fixture"
    ));
    import_directory(&store, &TokioFilesystem, &fixture, &Counted::default())
        .await
        .unwrap();
    store
}

/// Every task's result, in spawn order.
async fn joined<T: Send + 'static>(handles: Vec<tokio::task::JoinHandle<T>>) -> Vec<T> {
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(handle.await.unwrap());
    }
    results
}

mod store {
    use super::*;

    /// A commit renaming the Meta Space to `title`, read at `expected`.
    async fn rename(store: &MemorySpaceRepository, title: &str, expected: Revision) -> SpaceCommit {
        let mut snapshot = store.load_space(meta()).await.unwrap().unwrap().snapshot;
        snapshot.document.title = title.to_owned();
        SpaceCommit {
            changes: vec![SpaceChange::Update {
                space_id: meta(),
                snapshot,
                expected_revision: expected,
            }],
        }
    }

    async fn stored_revision(store: &MemorySpaceRepository) -> Revision {
        store.load_space(meta()).await.unwrap().unwrap().revision
    }

    mod stress_tests {
        use super::*;

        mod given_commits_sent_at_once_at_one_revision {
            use super::*;

            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn lands_exactly_one_and_refuses_the_rest() {
                let store = Arc::new(imported().await);
                let start = stored_revision(&store).await;
                let mut commits = Vec::with_capacity(CONCURRENCY);
                for writer in 0..CONCURRENCY {
                    commits.push(rename(&store, &format!("Writer {writer}"), start).await);
                }
                let barrier = Arc::new(Barrier::new(CONCURRENCY));
                let handles = commits
                    .into_iter()
                    .map(|commit| {
                        let store = Arc::clone(&store);
                        let barrier = Arc::clone(&barrier);
                        tokio::spawn(async move {
                            barrier.wait().await;
                            store.commit(commit).await.unwrap()
                        })
                    })
                    .collect();
                let results = joined(handles).await;

                let landed: Vec<usize> = results
                    .iter()
                    .enumerate()
                    .filter(|(_, result)| matches!(result, CommitResult::Committed { .. }))
                    .map(|(writer, _)| writer)
                    .collect();
                assert_eq!(landed.len(), 1, "exactly one commit lands: {landed:?}");
                for (writer, result) in results.iter().enumerate() {
                    assert!(
                        matches!(
                            result,
                            CommitResult::Committed { .. } | CommitResult::Conflict(_)
                        ),
                        "writer {writer} is committed or answered a conflict, got {result:?}"
                    );
                }
                let stored = store.load_space(meta()).await.unwrap().unwrap();
                assert_eq!(
                    stored.revision,
                    start.next(),
                    "the revision advances by one for the one commit that landed"
                );
                assert_eq!(
                    stored.snapshot.document.title,
                    format!("Writer {}", landed[0]),
                    "the stored title is the one the landed commit wrote"
                );
            }
        }

        mod given_writers_retrying_each_conflict {
            use super::*;

            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn lands_every_write_at_its_own_revision() {
                let store = Arc::new(imported().await);
                let start = stored_revision(&store).await;
                let barrier = Arc::new(Barrier::new(CONCURRENCY));
                let handles = (0..CONCURRENCY)
                    .map(|writer| {
                        let store = Arc::clone(&store);
                        let barrier = Arc::clone(&barrier);
                        tokio::spawn(async move {
                            barrier.wait().await;
                            loop {
                                let read = stored_revision(&store).await;
                                let commit =
                                    rename(&store, &format!("Writer {writer}"), read).await;
                                match store.commit(commit).await.unwrap() {
                                    CommitResult::Committed { revisions, .. } => {
                                        return revisions;
                                    }
                                    CommitResult::Conflict(_) => {}
                                    other => panic!("writer {writer}: {other:?}"),
                                }
                            }
                        })
                    })
                    .collect();
                let results = joined(handles).await;

                let landed_at: BTreeSet<u64> = results
                    .iter()
                    .map(|revisions| {
                        assert_eq!(revisions.len(), 1, "one Space per commit: {revisions:?}");
                        assert_eq!(revisions[0].0, meta(), "the Meta Space");
                        revisions[0].1.get()
                    })
                    .collect();
                let expected: BTreeSet<u64> =
                    (start.get() + 1..=start.get() + CONCURRENCY as u64).collect();
                assert_eq!(
                    landed_at, expected,
                    "each accepted commit lands at a revision of its own, one after another"
                );
                assert_eq!(
                    stored_revision(&store).await.get(),
                    start.get() + CONCURRENCY as u64,
                    "the revision advances by one per accepted commit"
                );
            }
        }
    }
}

mod application {
    use super::*;

    /// A body that arrives in the chunks given.
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

    async fn open() -> Host {
        let store = imported().await;
        Application::new(
            Arc::new(store),
            Counted::default(),
            Shell::new("<!doctype html>", Built::new()),
        )
    }

    async fn send(host: &Host, method: &str, path: &str, content: String) -> Response<Bytes> {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("content-type", "application/json")
            .body(Chunks(VecDeque::from([Bytes::from(content)])))
            .unwrap();
        host.handle(request).await
    }

    async fn load(host: &Host) -> Value {
        let response = send(host, "GET", &format!("/api/spaces/{META}"), String::new()).await;
        assert_eq!(response.status(), 200, "the Meta Space loads");
        serde_json::from_slice(response.body()).unwrap()
    }

    fn revision(loaded: &Value) -> u64 {
        loaded["revision"].as_str().unwrap().parse().unwrap()
    }

    fn rename_text(loaded: &Value, title: &str) -> String {
        let mut snapshot = loaded["snapshot"].clone();
        snapshot["document"]["title"] = json!(title);
        json!({ "changes": [{
            "kind": "update",
            "spaceId": META,
            "snapshot": snapshot,
            "expectedRevision": loaded["revision"],
        }]})
        .to_string()
    }

    mod stress_tests {
        use super::*;

        mod given_commits_posted_at_once_at_one_revision {
            use super::*;

            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn answers_one_200_and_409_to_the_rest() {
                let host = Arc::new(open().await);
                let loaded = load(&host).await;
                let start = revision(&loaded);
                let barrier = Arc::new(Barrier::new(CONCURRENCY));
                let handles = (0..CONCURRENCY)
                    .map(|writer| {
                        let host = Arc::clone(&host);
                        let barrier = Arc::clone(&barrier);
                        let text = rename_text(&loaded, &format!("Writer {writer}"));
                        tokio::spawn(async move {
                            barrier.wait().await;
                            send(&host, "POST", "/api/spaces", text).await.status()
                        })
                    })
                    .collect();
                let statuses = joined(handles).await;

                let landed: Vec<usize> = statuses
                    .iter()
                    .enumerate()
                    .filter(|(_, status)| **status == 200)
                    .map(|(writer, _)| writer)
                    .collect();
                assert_eq!(
                    landed.len(),
                    1,
                    "exactly one commit is answered 200: {statuses:?}"
                );
                assert!(
                    statuses
                        .iter()
                        .all(|status| *status == 200 || *status == 409),
                    "every other commit is answered 409: {statuses:?}"
                );
                let now = load(&host).await;
                assert_eq!(
                    revision(&now),
                    start + 1,
                    "the revision advances by one for the one commit answered 200"
                );
                assert_eq!(
                    now["snapshot"]["document"]["title"],
                    format!("Writer {}", landed[0]),
                    "the stored title is the one the 200 commit wrote"
                );
            }
        }

        mod given_clients_retrying_each_conflict {
            use super::*;

            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn lands_every_write_at_its_own_revision() {
                let host = Arc::new(open().await);
                let start = revision(&load(&host).await);
                let barrier = Arc::new(Barrier::new(CONCURRENCY));
                let handles = (0..CONCURRENCY)
                    .map(|writer| {
                        let host = Arc::clone(&host);
                        let barrier = Arc::clone(&barrier);
                        tokio::spawn(async move {
                            barrier.wait().await;
                            loop {
                                let loaded = load(&host).await;
                                let text = rename_text(&loaded, &format!("Writer {writer}"));
                                let response = send(&host, "POST", "/api/spaces", text).await;
                                match response.status().as_u16() {
                                    200 => {
                                        let body: Value =
                                            serde_json::from_slice(response.body()).unwrap();
                                        return body["revisions"][0]["revision"]
                                            .as_str()
                                            .unwrap()
                                            .parse::<u64>()
                                            .unwrap();
                                    }
                                    409 => {}
                                    other => panic!("writer {writer}: answered {other}"),
                                }
                            }
                        })
                    })
                    .collect();
                let landed_at: BTreeSet<u64> = joined(handles).await.into_iter().collect();

                let expected: BTreeSet<u64> = (start + 1..=start + CONCURRENCY as u64).collect();
                assert_eq!(
                    landed_at, expected,
                    "each accepted commit lands at a revision of its own, one after another"
                );
                assert_eq!(
                    revision(&load(&host).await),
                    start + CONCURRENCY as u64,
                    "the revision advances by one per accepted commit"
                );
            }
        }
    }
}
