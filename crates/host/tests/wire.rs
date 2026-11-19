//! The HTTP conformance cases held against the Rust application as a
//! `Request -> Response` function, each on a fresh Import of the tracked
//! fixture. The cases the desktop scheme handler runs too are written once in
//! `crates/http-conformance` and generated here by its `cases!`, in the
//! module `conformance`; this file holds the cases that need a store that
//! cannot serve (`store-condition-cases.ts`) or that only this adapter runs,
//! and the application's own behaviour past the cases. A test porting a case
//! carries `// Case: <its name>`, which
//! `test/unit/http-conformance-rust-ports.test.ts` holds to the case lists.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::{BTreeMap, VecDeque};
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::task::{Context, Poll};

use bytes::Bytes;
use host::{
    AggregateInput, AggregateLoad, Application, AssetHash, AssetStored, CommitResult,
    InitializeResult, LoadedSpace, MAX_ASSET_BYTES, MAX_COMMIT_BODY_BYTES, MemorySpaceRepository,
    ReplaceResult, RepositoryError, Revision, Shell, SpaceCommit, SpaceRepository, SpaceSummary,
    StoredAsset, TokioFilesystem, import_directory,
};
use http::{Request, Response};
use http_body::Frame;
use http_conformance::support::assertions::{
    self, api_policy, html_problem, invalid_request, json_media, not_found, problem,
};
use http_conformance::support::{header, json_of, rename_change, rename_text, revision};
use http_conformance::{Counted, META, META_ADDRESS, STAND_IN_FILES, STAND_IN_PAGE};
use intake::SpaceId;
use serde_json::{Value, json};

type Built = BTreeMap<String, Bytes>;
type Host<R> = Application<R, Counted, Built>;

/// The stand-in build as files, its page among them as `index.html`, as a
/// build embedded in the CLI holds it.
fn shell() -> Shell<Built> {
    let files = STAND_IN_FILES
        .into_iter()
        .chain([("index.html", STAND_IN_PAGE)])
        .map(|(path, text)| (path.to_owned(), Bytes::from_static(text.as_bytes())))
        .collect();
    Shell::new(STAND_IN_PAGE, files)
}

async fn open() -> Host<MemorySpaceRepository> {
    let store = MemorySpaceRepository::new();
    let ids = Counted::default();
    import_directory(&store, &TokioFilesystem, &http_conformance::fixture(), &ids)
        .await
        .unwrap();
    Application::new(Arc::new(store), ids, shell())
}

/// The application itself as the conformance cases reach it: the request
/// target as a listener receives it, and the `Host` it names.
struct Wire(Host<MemorySpaceRepository>);

/// The `Host` a listener's requests name, and the `Origin` of its own page.
const LISTENING_AT: &str = "127.0.0.1:4173";

impl http_conformance::Adapter for Wire {
    async fn open() -> Self {
        Self(open().await)
    }

    async fn send(&self, request: Request<Bytes>) -> Response<Bytes> {
        self.0.handle(request.map(body)).await
    }

    fn own_origin(&self) -> String {
        format!("http://{LISTENING_AT}")
    }

    fn own_address(&self) -> Vec<(&'static str, String)> {
        vec![("host", LISTENING_AT.to_owned())]
    }

    async fn close(self) {}
}

http_conformance::cases!(Wire);

/// A body that arrives in the chunks given, as a socket delivers one.
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

fn body(bytes: impl Into<Bytes>) -> Chunks {
    Chunks(VecDeque::from([bytes.into()]))
}

async fn send<R: SpaceRepository>(
    host: &Host<R>,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    content: impl Into<Bytes>,
) -> Response<Bytes> {
    let mut request = Request::builder().method(method).uri(path);
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    host.handle(request.body(body(content)).unwrap()).await
}

async fn get<R: SpaceRepository>(host: &Host<R>, path: &str) -> Response<Bytes> {
    send(host, "GET", path, &[], Bytes::new()).await
}

async fn load<R: SpaceRepository>(host: &Host<R>, id: &str) -> Value {
    let response = get(host, &format!("/api/spaces/{id}")).await;
    assert_eq!(response.status(), 200, "{id} loads");
    json_of(&response)
}

async fn post_commit<R: SpaceRepository>(
    host: &Host<R>,
    content: impl Into<Bytes>,
    content_type: &str,
) -> Response<Bytes> {
    send(
        host,
        "POST",
        "/api/spaces",
        &[("content-type", content_type)],
        content,
    )
    .await
}

mod given_a_commit {
    use super::*;

    /// A commit adding a Resource of a kind no listed plugin draws, whose
    /// content nests so the body's deepest object is `depth` levels down.
    fn nested_commit_text(loaded: &Value, depth: usize) -> String {
        const PLACEHOLDER: &str = "\"deep content\"";
        let mut change = rename_change(loaded, "Deep");
        change["snapshot"]["resources"]
            .as_array_mut()
            .unwrap()
            .push(json!({
                "id": "00000000-0000-4000-8000-0000000d0e01",
                "document": { "title": "Deep", "kind": "vnd.acme.deep", "content": "deep content" },
            }));
        // The body, its `changes`, the change, its snapshot, the snapshot's
        // `resources`, the Resource and its document are seven levels.
        let levels = depth - 7;
        let content = format!(
            "{}{{}}{}",
            r#"{"a":"#.repeat(levels - 1),
            "}".repeat(levels - 1)
        );
        let text = json!({ "changes": [change] }).to_string();
        assert_eq!(text.matches(PLACEHOLDER).count(), 1, "one placeholder");
        text.replace(PLACEHOLDER, &content)
    }

    /// ADR 0160 keeps this difference: the Node host decodes a body nested
    /// past intake's limit (`packages/http/test/space-http-app.test.ts` ›
    /// "decodes a body nested deeper than the Rust host reads"), and this one
    /// refuses it as malformed JSON.
    #[tokio::test]
    async fn commits_nesting_to_the_limit_and_refuses_one_past_it() {
        let host = open().await;
        let mut loaded = load(&host, META).await;
        let response = post_commit(
            &host,
            nested_commit_text(&loaded, intake::json::MAX_DEPTH),
            "application/json",
        )
        .await;
        assert_eq!(
            response.status(),
            200,
            "at the limit: {:?}",
            response.body()
        );
        // The stored snapshot now nests past what `serde_json` reads by
        // default, so it is compared as bytes from here on.
        loaded["revision"] = json_of(&response)["revisions"][0]["revision"].clone();
        let stored = get(&host, &format!("/api/spaces/{META}")).await;

        let response = post_commit(
            &host,
            nested_commit_text(&loaded, intake::json::MAX_DEPTH + 1),
            "application/json",
        )
        .await;
        invalid_request(&response);
        assert_eq!(
            json_of(&response)["detail"],
            "Malformed JSON in request body",
            "past the limit, refused as malformed"
        );
        assert_eq!(
            get(&host, &format!("/api/spaces/{META}")).await.body(),
            stored.body(),
            "nothing stored"
        );
    }

    /// The Node host reads the body through `Request#json()`, whose UTF-8
    /// decode drops a leading byte order mark.
    #[tokio::test]
    async fn commits_a_body_that_opens_with_a_byte_order_mark() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let mut content = b"\xEF\xBB\xBF".to_vec();
        content.extend_from_slice(rename_text(&loaded, "Marked").as_bytes());
        let response = post_commit(&host, content, "application/json").await;
        assert_eq!(response.status(), 200, "committed");
        assert_eq!(
            load(&host, META).await["snapshot"]["document"]["title"],
            "Marked",
            "stored"
        );
    }

    // Case: commits a chunked body that declares no length
    // Case: answers 413 payload-too-large to a chunked body of * bytes that declares no length
    #[tokio::test]
    async fn counts_a_body_that_arrives_in_chunks() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let text = rename_text(&loaded, "Chunked");
        let (left, right) = text.split_at(text.len() / 2);
        let request = Request::builder()
            .method("POST")
            .uri("/api/spaces")
            .header("content-type", "application/json")
            .body(Chunks(VecDeque::from([
                Bytes::from(left.to_owned()),
                Bytes::from(right.to_owned()),
            ])))
            .unwrap();
        assert_eq!(
            host.handle(request).await.status(),
            200,
            "joined and committed"
        );
        // A valid commit padded to one byte over the limit, as the case sends it.
        let committed = load(&host, META).await;
        let mut padded = rename_text(&committed, "Too big").into_bytes();
        padded.resize(MAX_COMMIT_BODY_BYTES + 1, b' ');
        let (left, right) = padded.split_at(padded.len() / 2);
        let request = Request::builder()
            .method("POST")
            .uri("/api/spaces")
            .header("content-type", "application/json")
            .body(Chunks(VecDeque::from([
                Bytes::copy_from_slice(left),
                Bytes::copy_from_slice(right),
            ])))
            .unwrap();
        problem(
            &host.handle(request).await,
            "payload-too-large",
            413,
            "Payload too large",
        );
        assert_eq!(
            load(&host, META).await["revision"],
            committed["revision"],
            "nothing committed"
        );
    }
}

mod given_an_asset_request {
    use super::*;

    /// A body that keeps arriving in chunks of `CHUNK` bytes, counting what is read.
    struct Endless(Arc<AtomicUsize>, Bytes);

    impl http_body::Body for Endless {
        type Data = Bytes;
        type Error = std::convert::Infallible;

        fn poll_frame(
            self: Pin<&mut Self>,
            _: &mut Context<'_>,
        ) -> Poll<Option<Result<Frame<Bytes>, Self::Error>>> {
            self.0.fetch_add(self.1.len(), Ordering::SeqCst);
            Poll::Ready(Some(Ok(Frame::data(self.1.clone()))))
        }
    }

    const CHUNK: usize = 1 << 20;

    /// `MAX_DRAINED_BODY_BYTES` (`packages/http/src/index.ts`): what is
    /// drained of an oversized body, whichever route refused it.
    const DRAINED: usize = MAX_COMMIT_BODY_BYTES * 8;

    #[tokio::test]
    async fn drains_an_oversized_body_no_further_than_commits_do() {
        let host = open().await;
        for (path, limit, content_type) in [
            ("/assets", MAX_ASSET_BYTES, "application/octet-stream"),
            ("/api/spaces", MAX_COMMIT_BODY_BYTES, "application/json"),
        ] {
            let read = Arc::new(AtomicUsize::new(0));
            let request = Request::post(path)
                .header("content-type", content_type)
                .body(Endless(Arc::clone(&read), Bytes::from(vec![b' '; CHUNK])))
                .unwrap();
            let response = host.handle(request).await;
            assert_eq!(response.status(), 413, "{path}: refused");
            let read = read.load(Ordering::SeqCst);
            assert!(
                read <= limit + CHUNK + DRAINED,
                "{path}: read {read} bytes, over the limit and the drain allowance"
            );
        }
    }
}

mod given_a_change_from_another_site {
    use super::*;

    /// `CROSS_SITE_CHANGE_DETAIL` (`packages/http/src/index.ts`).
    const DETAIL: &str = "Send a change from the application's own page.";

    fn refused(response: &Response<Bytes>) {
        api_policy(response);
        problem(response, "forbidden", 403, "Forbidden");
        assert_eq!(
            json_of(response)["detail"],
            DETAIL,
            "the same detail as the Node host"
        );
    }

    fn fresh(stamp: &str) -> Vec<u8> {
        format!("cross-site {stamp}").into_bytes()
    }

    /// Send an asset and a commit with `headers`, and expect both refused
    /// and nothing changed.
    async fn changes_refused(host: &Host<MemorySpaceRepository>, headers: &[(&str, &str)]) {
        let bytes = fresh(&format!("{headers:?}"));
        let path = format!("/assets/{}", AssetHash::of(&bytes).as_str());
        let mut asset = headers.to_vec();
        asset.push(("content-type", "text/plain"));
        refused(&send(host, "POST", "/assets", &asset, bytes).await);
        not_found(&get(host, &path).await);
        let loaded = load(host, META).await;
        let mut commit = headers.to_vec();
        commit.push(("content-type", "application/json"));
        let text = rename_text(&loaded, "Cross-site");
        refused(&send(host, "POST", "/api/spaces", &commit, text).await);
        assert_eq!(
            revision(&load(host, META).await),
            revision(&loaded),
            "{headers:?}: the Meta Space is unchanged"
        );
    }

    // Case: answers 403 forbidden to a change whose Origin is %s, changing nothing
    #[tokio::test]
    async fn refuses_a_change_whose_origin_is_not_its_host() {
        let host = open().await;
        for origin in ["http://attacker.example", "http://127.0.0.1:1", "null"] {
            changes_refused(&host, &[("host", LISTENING_AT), ("origin", origin)]).await;
            changes_refused(
                &host,
                &[
                    ("host", LISTENING_AT),
                    ("origin", origin),
                    ("sec-fetch-site", "same-origin"),
                ],
            )
            .await;
        }
    }

    #[tokio::test]
    async fn serves_a_change_without_a_host_whatever_its_origin() {
        let host = open().await;
        let response = send(
            &host,
            "POST",
            "/assets",
            &[
                ("content-type", "text/plain"),
                ("origin", "infinitycube://talk"),
            ],
            fresh("no host"),
        )
        .await;
        assert_eq!(
            response.status(),
            201,
            "a request naming no Host is not judged by its Origin"
        );
    }

    /// A body that counts every frame read of it, and never ends.
    struct Counting(Arc<AtomicUsize>);

    impl http_body::Body for Counting {
        type Data = Bytes;
        type Error = std::convert::Infallible;

        fn poll_frame(
            self: Pin<&mut Self>,
            _: &mut Context<'_>,
        ) -> Poll<Option<Result<Frame<Bytes>, Self::Error>>> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Poll::Ready(Some(Ok(Frame::data(Bytes::from_static(b" ")))))
        }
    }

    #[tokio::test]
    async fn refuses_a_cross_site_change_before_reading_its_body() {
        let host = open().await;
        let read = Arc::new(AtomicUsize::new(0));
        let request = Request::post("/assets")
            .header("content-type", "text/plain")
            .header("sec-fetch-site", "cross-site")
            .body(Counting(Arc::clone(&read)))
            .unwrap();
        let response = host.handle(request).await;
        assert_eq!(response.status(), 403, "refused");
        assert_eq!(
            read.load(Ordering::SeqCst),
            0,
            "no frame of the body is read"
        );
    }
}

mod given_a_product_address {
    use super::*;

    #[tokio::test]
    async fn serves_the_meta_space_redirected_to_whatever_its_first_digit() {
        let store = MemorySpaceRepository::new();
        let ids = Counted::default();
        let directory = std::path::PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../conformance/intake/directory/accepted-ur/aggregate"
        ));
        import_directory(&store, &TokioFilesystem, &directory, &ids)
            .await
            .unwrap();
        let host = Application::new(Arc::new(store), ids, shell());
        let redirect = get(&host, "/").await;
        let location = header(&redirect, "location").unwrap().to_owned();
        assert_eq!(
            location, "/spaces/EAAAAAAAQACAAAAAAAAAAQ",
            "Meta 10000000-0000-4000-8000-000000000001"
        );
        assertions::shell(&get(&host, &location).await);
    }

    #[tokio::test]
    async fn reads_every_accept_header_as_one_list() {
        let host = open().await;
        let response = send(
            &host,
            "PUT",
            META_ADDRESS,
            &[("accept", "application/json"), ("accept", "text/html")],
            Bytes::new(),
        )
        .await;
        html_problem(&response, 405);
    }
}

/// What a caller hands `handle` is the request target as received, which no
/// URL parser has normalised: the application collapses its dot segments as a
/// WHATWG URL parser does, and decodes the API and asset paths as Hono does,
/// so it answers what the Node host answers behind its listener.
mod given_a_request_target_as_received {
    use super::*;

    #[tokio::test]
    async fn collapses_dot_segments_as_a_url_parser_does() {
        let host = open().await;
        for path in [
            "/api/./spaces",
            "/api/x/../spaces",
            "/api/spaces/%2e%2e/spaces",
            "/api/spaces/.%2E/spaces",
            "/api/%2e/spaces",
        ] {
            let response = get(&host, path).await;
            assert_eq!(response.status(), 200, "{path}: {:?}", response.body());
            json_media(&response);
        }
        let icon = get(&host, "/assets/../favicon.svg").await;
        assert_eq!(icon.status(), 200, "the icon");
        assert_eq!(
            header(&icon, "cache-control"),
            Some("no-cache"),
            "served from its own path, outside /assets/"
        );
    }

    /// `new URL` reads a backslash in an http URL's path as a slash, as
    /// `@hono/node-server` builds the request's URL with it.
    #[tokio::test]
    async fn reads_a_backslash_as_a_slash_as_a_url_parser_does() {
        let host = open().await;
        for path in ["/api\\spaces", "/api/x/..\\spaces"] {
            let response = get(&host, path).await;
            assert_eq!(response.status(), 200, "{path}");
            assert!(json_of(&response).is_array(), "{path}: the Space list");
        }
    }

    #[tokio::test]
    async fn leaves_reserved_escapes_and_an_escaped_percent_escaped() {
        let host = open().await;
        problem(
            &get(&host, &format!("/api/spaces/%2530{}", &META[1..])).await,
            "invalid-space-id",
            400,
            "Invalid Space id",
        );
        not_found(&get(&host, &format!("/api/spaces%2F{META}")).await);
        not_found(&get(&host, "/api/%E9").await);
        problem(
            &get(&host, "/api/spaces/%zz").await,
            "invalid-space-id",
            400,
            "Invalid Space id",
        );
    }

    #[tokio::test]
    async fn reads_a_product_address_as_received() {
        let host = open().await;
        invalid_request(&get(&host, "/spaces/%41AAAAAAAQACAAAAAAAAAQA").await);
        assertions::shell(&get(&host, "/%61pi/spaces").await);
    }
}

/// A store that fails every read and write as `failure` does.
struct Failing(fn() -> RepositoryError);

impl SpaceRepository for Failing {
    async fn list_spaces(&self) -> Result<Vec<SpaceSummary>, RepositoryError> {
        Err((self.0)())
    }
    async fn load_space(&self, _: SpaceId) -> Result<Option<LoadedSpace>, RepositoryError> {
        Err((self.0)())
    }
    async fn load_aggregate(&self) -> Result<AggregateLoad, RepositoryError> {
        Err((self.0)())
    }
    async fn commit(&self, _: SpaceCommit) -> Result<CommitResult, RepositoryError> {
        Err((self.0)())
    }
    async fn store_asset(&self, _: StoredAsset) -> Result<AssetStored, RepositoryError> {
        Err((self.0)())
    }
    async fn load_asset(&self, _: &AssetHash) -> Result<Option<StoredAsset>, RepositoryError> {
        Err((self.0)())
    }
    async fn initialize_aggregate(
        &self,
        _: AggregateInput,
    ) -> Result<InitializeResult, RepositoryError> {
        Err((self.0)())
    }
    async fn load_meta_space_id(&self) -> Result<Option<SpaceId>, RepositoryError> {
        Err((self.0)())
    }
    async fn replace_aggregate(
        &self,
        _: AggregateInput,
        _: Option<SpaceId>,
    ) -> Result<ReplaceResult, RepositoryError> {
        Err((self.0)())
    }
    async fn mark_exported(&self, _: SpaceId, _: Revision) -> Result<(), RepositoryError> {
        Err((self.0)())
    }
}

fn over<R: SpaceRepository>(store: R) -> Host<R> {
    Application::new(Arc::new(store), Counted::default(), shell())
}

mod given_a_store_that_cannot_serve {
    use super::*;

    // Case: answers / with 503 persistence-unavailable while no Meta Space is established
    #[tokio::test]
    async fn answers_the_root_503_while_no_meta_space_is_established() {
        let host = over(MemorySpaceRepository::new());
        problem(
            &get(&host, "/").await,
            "persistence-unavailable",
            503,
            "Persistence unavailable",
        );
        let aggregate = get(&host, "/api/aggregate").await;
        assert_eq!(aggregate.status(), 200, "the aggregate answers");
        assert_eq!(
            json_of(&aggregate),
            json!({ "kind": "uninitialized" }),
            "uninitialized"
        );
        assert_eq!(
            json_of(&get(&host, "/api/spaces").await),
            json!([]),
            "no Spaces"
        );
    }

    // Case: answers 503 persistence-unavailable for every read and write of an unreachable store
    #[tokio::test]
    async fn answers_503_for_every_read_and_write_of_an_unreachable_store() {
        let host = over(Failing(|| {
            RepositoryError::Unavailable("unreachable".to_owned())
        }));
        let meta = format!("/api/spaces/{META}");
        for path in ["/", "/api/spaces", "/api/aggregate", meta.as_str()] {
            let response = get(&host, path).await;
            problem(
                &response,
                "persistence-unavailable",
                503,
                "Persistence unavailable",
            );
            if path != "/" {
                api_policy(&response);
            }
        }
        let loaded = json!({
            "snapshot": { "id": META, "document": { "version": 1, "title": "Unwritten" }, "resources": [] },
            "revision": "0",
        });
        let response =
            post_commit(&host, rename_text(&loaded, "Unwritten"), "application/json").await;
        problem(
            &response,
            "persistence-unavailable",
            503,
            "Persistence unavailable",
        );
    }

    // Case: answers 500 internal-error for broken stored state
    #[tokio::test]
    async fn answers_500_for_broken_stored_state() {
        let host = over(Failing(|| {
            RepositoryError::BrokenStoredState("broken".to_owned())
        }));
        let meta = format!("/api/spaces/{META}");
        for path in ["/", "/api/spaces", "/api/aggregate", meta.as_str()] {
            problem(
                &get(&host, path).await,
                "internal-error",
                500,
                "Internal server error",
            );
        }
    }
}

mod given_a_product_address_over_a_store_that_cannot_serve {
    use super::*;

    async fn answers(host: &Host<Failing>, code: &str, status: u16, title: &str) {
        for path in [META_ADDRESS.to_owned(), format!("{META_ADDRESS}/notes")] {
            problem(&get(host, &path).await, code, status, title);
        }
    }

    // Case: answers a product address over a %s store with %s
    #[tokio::test]
    async fn answers_an_unreachable_store_503() {
        let host = over(Failing(|| {
            RepositoryError::Unavailable("unreachable".to_owned())
        }));
        answers(
            &host,
            "persistence-unavailable",
            503,
            "Persistence unavailable",
        )
        .await;
    }

    // Case: answers a product address over a %s store with %s
    #[tokio::test]
    async fn answers_broken_stored_state_500() {
        let host = over(Failing(|| {
            RepositoryError::BrokenStoredState("broken".to_owned())
        }));
        answers(&host, "internal-error", 500, "Internal server error").await;
    }
}

mod given_a_store_that_fails {
    use super::*;
    use std::sync::Mutex;

    #[tokio::test]
    async fn reports_each_store_failure_it_answers_with_what_failed() {
        let seen: Arc<Mutex<Vec<(String, String)>>> = Arc::default();
        let reported = Arc::clone(&seen);
        let host = over(Failing(|| {
            RepositoryError::Unavailable("connection refused".to_owned())
        }))
        .on_error(move |context, error| {
            reported
                .lock()
                .unwrap()
                .push((context.to_owned(), error.to_string()));
        });
        let meta = format!("/api/spaces/{META}");
        for path in [
            "/",
            "/api/spaces",
            "/api/aggregate",
            meta.as_str(),
            META_ADDRESS,
        ] {
            let response = get(&host, path).await;
            assert_eq!(response.status(), 503, "{path}");
            assert!(
                !String::from_utf8_lossy(response.body()).contains("connection refused"),
                "{path}: the reason stays out of the answer"
            );
        }
        let seen = seen.lock().unwrap().clone();
        let contexts: Vec<&str> = seen.iter().map(|(context, _)| context.as_str()).collect();
        assert_eq!(
            contexts,
            [
                "Failed to read the Meta Space",
                "Failed to list spaces",
                "Failed to load the Space aggregate",
                &format!("Failed to load space {META}"),
                "Failed to resolve a product address",
            ],
            "one report per failure, saying what failed"
        );
        assert!(
            seen.iter()
                .all(|(_, error)| error.contains("connection refused")),
            "each report carries the store's reason: {seen:?}"
        );
    }
}

mod given_an_edit_observer {
    use super::*;

    fn counting(
        host: Host<MemorySpaceRepository>,
    ) -> (Host<MemorySpaceRepository>, Arc<AtomicUsize>) {
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let host = host.on_edit(move || {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        (host, count)
    }

    #[tokio::test]
    async fn counts_an_accepted_commit_as_an_edit() {
        let (host, edits) = counting(open().await);
        let loaded = load(&host, META).await;
        post_commit(&host, rename_text(&loaded, "Edited"), "application/json").await;
        assert_eq!(edits.load(Ordering::SeqCst), 1, "one Edit");
        let stale = post_commit(&host, rename_text(&loaded, "Stale"), "application/json").await;
        assert_eq!(stale.status(), 409, "a conflict");
        assert_eq!(
            edits.load(Ordering::SeqCst),
            1,
            "a refused commit is no Edit"
        );
    }

    #[tokio::test]
    async fn counts_no_edit_for_a_read_that_initializes_a_space() {
        let store = MemorySpaceRepository::new();
        let ids = Counted::default();
        let meta = SpaceId::parse(META).unwrap();
        let snapshot = intake::decode_space_snapshot(
            &intake::json::parse(
                format!(
                    r#"{{"id":"{META}","document":{{"version":1,"title":"Bare"}},"resources":[]}}"#
                )
                .as_str(),
            )
            .unwrap(),
            meta,
        )
        .unwrap();
        let initialized = store
            .initialize_aggregate(AggregateInput {
                meta_space_id: meta,
                spaces: vec![snapshot],
            })
            .await
            .unwrap();
        assert!(
            matches!(initialized, InitializeResult::Initialized(_)),
            "seeded: {initialized:?}"
        );
        let (host, edits) = counting(Application::new(Arc::new(store), ids, shell()));
        let loaded = load(&host, META).await;
        assert_eq!(revision(&loaded), 1, "the initialization was committed");
        assert_eq!(
            loaded["snapshot"]["document"]["maps"][0]["title"], "Map 1",
            "the first Map: {loaded}"
        );
        get(&host, META_ADDRESS).await;
        send(&host, "HEAD", META_ADDRESS, &[], Bytes::new()).await;
        assert_eq!(
            edits.load(Ordering::SeqCst),
            0,
            "reads are no Edits (ST-65)"
        );
    }
}
