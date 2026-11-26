//! The HTTP conformance cases held against the Rust application over the
//! SQLite repository: the wire cases written once in `crates/http-conformance`,
//! generated here by its `cases!`, each on a fresh migrated file seeded with
//! the tracked fixture through the lifecycle doors; and the store-condition
//! cases (`store-condition-cases.ts`), each over a file in that condition. A
//! test porting a case carries `// Case: <its name>`, which
//! `test/unit/http-conformance-rust-ports.test.ts` holds to the case lists.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use host::{Application, Shell, SqliteSpaceRepository, TokioFilesystem, import_directory};
use http::{Request, Response};
use http_conformance::support::assertions::{api_policy, problem};
use http_conformance::support::{json_of, rename_text};
use http_conformance::{Counted, META, META_ADDRESS, STAND_IN_FILES, STAND_IN_PAGE};
use serde_json::json;
use sqlite_support::{Migrated, execute, hold_exclusive_lock};

type Built = BTreeMap<String, Bytes>;
type Host = Application<SqliteSpaceRepository, Counted, Built>;

/// The stand-in build as files, its page among them as `index.html`.
fn shell() -> Shell<Built> {
    let files = STAND_IN_FILES
        .into_iter()
        .chain([("index.html", STAND_IN_PAGE)])
        .map(|(path, text)| (path.to_owned(), Bytes::from_static(text.as_bytes())))
        .collect();
    Shell::new(STAND_IN_PAGE, files)
}

/// The application over `store`, and the file it keeps alive.
struct Over {
    host: Host,
    store: Arc<SqliteSpaceRepository>,
    _file: Migrated,
}

impl Over {
    fn new(file: Migrated, store: SqliteSpaceRepository) -> Self {
        let store = Arc::new(store);
        Self {
            host: Application::new(Arc::clone(&store), Counted::default(), shell()),
            store,
            _file: file,
        }
    }

    async fn get(&self, path: &str) -> Response<Bytes> {
        let request = Request::get(path)
            .body(http_body_util::Full::new(Bytes::new()))
            .unwrap();
        self.host.handle(request).await
    }

    async fn post_commit(&self, text: String) -> Response<Bytes> {
        let request = Request::post("/api/spaces")
            .header("content-type", "application/json")
            .body(http_body_util::Full::new(Bytes::from(text)))
            .unwrap();
        self.host.handle(request).await
    }
}

/// The `Host` a listener's requests name, and the `Origin` of its own page.
const LISTENING_AT: &str = "127.0.0.1:4173";

/// The application over a fresh file seeded with the tracked fixture.
struct Sqlite(Over);

impl http_conformance::Adapter for Sqlite {
    async fn open() -> Self {
        let file = Migrated::new().await;
        let store = SqliteSpaceRepository::open(&file.path());
        let ids = Counted::default();
        import_directory(&store, &TokioFilesystem, &http_conformance::fixture(), &ids)
            .await
            .unwrap();
        Self(Over::new(file, store))
    }

    async fn send(&self, request: Request<Bytes>) -> Response<Bytes> {
        self.0
            .host
            .handle(request.map(http_body_util::Full::new))
            .await
    }

    fn own_origin(&self) -> String {
        format!("http://{LISTENING_AT}")
    }

    fn own_address(&self) -> Vec<(&'static str, String)> {
        vec![("host", LISTENING_AT.to_owned())]
    }

    async fn close(self) {
        self.0.store.close().await;
    }
}

http_conformance::cases!(Sqlite);

/// The application over a migrated file that holds no aggregate yet.
async fn uninitialized() -> Over {
    let file = Migrated::new().await;
    let store = SqliteSpaceRepository::open(&file.path());
    Over::new(file, store)
}

/// The application over a seeded file another process holds locked, with a
/// short busy timeout, and the connection holding the lock.
async fn unavailable() -> (Over, sqlx::SqliteConnection) {
    let file = Migrated::new().await;
    let seeding = SqliteSpaceRepository::open(&file.path());
    import_directory(
        &seeding,
        &TokioFilesystem,
        &http_conformance::fixture(),
        &Counted::default(),
    )
    .await
    .unwrap();
    seeding.close().await;
    let holder = hold_exclusive_lock(&file.file).await;
    let store =
        SqliteSpaceRepository::open_with_busy_timeout(&file.path(), Duration::from_millis(20));
    (Over::new(file, store), holder)
}

/// The application over a file whose Meta Space's document is stored as a
/// BLOB and which no Meta identity names: stored state no aggregate can be
/// read from, and no Space listed from (a document that is text but not JSON
/// is still listed, `tests/sqlite.rs` › `lists_a_broken_space_beside_the_others`).
async fn broken() -> Over {
    let file = Migrated::new().await;
    execute(
        &file.file,
        &format!(
            "INSERT INTO spaces (id, document, revision, updated_at) \
             VALUES ('{META}', CAST('not json' AS BLOB), '0', '2026-11-22T00:00:00.000Z')"
        ),
    )
    .await;
    let store = SqliteSpaceRepository::open(&file.path());
    Over::new(file, store)
}

mod given_a_store_that_cannot_serve {
    use super::*;

    // Case: answers / with 503 persistence-unavailable while no Meta Space is established
    #[tokio::test]
    async fn answers_the_root_503_while_no_meta_space_is_established() {
        let over = uninitialized().await;
        problem(
            &over.get("/").await,
            "persistence-unavailable",
            503,
            "Persistence unavailable",
        );
        let aggregate = over.get("/api/aggregate").await;
        assert_eq!(aggregate.status(), 200, "the aggregate answers");
        assert_eq!(
            json_of(&aggregate),
            json!({ "kind": "uninitialized" }),
            "uninitialized"
        );
        assert_eq!(
            json_of(&over.get("/api/spaces").await),
            json!([]),
            "no Spaces"
        );
    }

    // Case: answers 503 persistence-unavailable for every read and write of an unreachable store
    #[tokio::test]
    async fn answers_503_for_every_read_and_write_of_an_unreachable_store() {
        let (over, _holder) = unavailable().await;
        let meta = format!("/api/spaces/{META}");
        for path in ["/", "/api/spaces", "/api/aggregate", meta.as_str()] {
            let response = over.get(path).await;
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
        problem(
            &over.post_commit(rename_text(&loaded, "Unwritten")).await,
            "persistence-unavailable",
            503,
            "Persistence unavailable",
        );
    }

    // Case: answers 500 internal-error for broken stored state
    #[tokio::test]
    async fn answers_500_for_broken_stored_state() {
        let over = broken().await;
        let meta = format!("/api/spaces/{META}");
        for path in ["/", "/api/spaces", "/api/aggregate", meta.as_str()] {
            problem(
                &over.get(path).await,
                "internal-error",
                500,
                "Internal server error",
            );
        }
    }
}

mod given_a_product_address_over_a_store_that_cannot_serve {
    use super::*;

    async fn answers(over: &Over, code: &str, status: u16, title: &str) {
        for path in [META_ADDRESS.to_owned(), format!("{META_ADDRESS}/notes")] {
            problem(&over.get(&path).await, code, status, title);
        }
    }

    // Case: answers a product address over a %s store with %s
    #[tokio::test]
    async fn answers_an_unreachable_store_503() {
        let (over, _holder) = unavailable().await;
        answers(
            &over,
            "persistence-unavailable",
            503,
            "Persistence unavailable",
        )
        .await;
    }

    // Case: answers a product address over a %s store with %s
    #[tokio::test]
    async fn answers_broken_stored_state_500() {
        let over = broken().await;
        answers(&over, "internal-error", 500, "Internal server error").await;
    }
}

/// The wire cases `crates/host/tests/wire.rs` ports in its own file rather
/// than the table, each a change that reaches the store or is refused before it.
mod given_a_change_the_application_judges_before_the_store {
    use std::collections::VecDeque;
    use std::pin::Pin;
    use std::task::{Context, Poll};

    use host::AssetHash;
    use http_body::Frame;
    use http_conformance::support::assertions::not_found;
    use http_conformance::support::revision;
    use serde_json::Value;

    use super::*;

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

    async fn send(
        over: &Over,
        path: &str,
        headers: &[(&str, &str)],
        chunks: Vec<Bytes>,
    ) -> Response<Bytes> {
        let mut request = Request::builder().method("POST").uri(path);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        over.host
            .handle(request.body(Chunks(VecDeque::from(chunks))).unwrap())
            .await
    }

    async fn seeded() -> Over {
        <Sqlite as http_conformance::Adapter>::open().await.0
    }

    async fn load(over: &Over) -> Value {
        let response = over.get(&format!("/api/spaces/{META}")).await;
        assert_eq!(response.status(), 200, "the Meta Space loads");
        json_of(&response)
    }

    fn halves(bytes: &[u8]) -> Vec<Bytes> {
        let (left, right) = bytes.split_at(bytes.len() / 2);
        vec![Bytes::copy_from_slice(left), Bytes::copy_from_slice(right)]
    }

    /// ST-77's limit on a commit body, 1 MiB, written out rather than read
    /// from the host, so the body sent is one byte over the requirement's
    /// limit whatever the host's own constant says.
    const COMMIT_BODY_LIMIT: usize = 1 << 20;

    // Case: commits a chunked body that declares no length
    // Case: answers 413 payload-too-large to a chunked body of * bytes that declares no length
    #[tokio::test]
    async fn counts_a_body_that_arrives_in_chunks() {
        let over = seeded().await;
        let json = [("content-type", "application/json")];
        let text = rename_text(&load(&over).await, "Chunked");
        let response = send(&over, "/api/spaces", &json, halves(text.as_bytes())).await;
        assert_eq!(response.status(), 200, "joined and committed");
        let committed = load(&over).await;
        assert_eq!(
            committed["snapshot"]["document"]["title"], "Chunked",
            "the joined body is what was committed"
        );
        let mut padded = rename_text(&committed, "Too big").into_bytes();
        padded.resize(COMMIT_BODY_LIMIT + 1, b' ');
        problem(
            &send(&over, "/api/spaces", &json, halves(&padded)).await,
            "payload-too-large",
            413,
            "Payload too large",
        );
        assert_eq!(
            load(&over).await["revision"],
            committed["revision"],
            "nothing committed"
        );
    }

    // Case: answers 403 forbidden to a change whose Origin is %s, changing nothing
    #[tokio::test]
    async fn refuses_a_change_whose_origin_is_not_its_host() {
        let over = seeded().await;
        for origin in ["http://attacker.example", "http://127.0.0.1:1", "null"] {
            for site in [None, Some("same-origin")] {
                let mut headers = vec![("host", LISTENING_AT), ("origin", origin)];
                headers.extend(site.map(|site| ("sec-fetch-site", site)));
                let bytes = format!("cross-site {headers:?}").into_bytes();
                let mut asset = headers.clone();
                asset.push(("content-type", "text/plain"));
                let response =
                    send(&over, "/assets", &asset, vec![Bytes::from(bytes.clone())]).await;
                api_policy(&response);
                problem(&response, "forbidden", 403, "Forbidden");
                let stored = format!("/assets/{}", AssetHash::of(&bytes).as_str());
                not_found(&over.get(&stored).await);
                let loaded = load(&over).await;
                let mut commit = headers.clone();
                commit.push(("content-type", "application/json"));
                let text = rename_text(&loaded, "Cross-site");
                let response = send(&over, "/api/spaces", &commit, vec![Bytes::from(text)]).await;
                problem(&response, "forbidden", 403, "Forbidden");
                assert_eq!(
                    revision(&load(&over).await),
                    revision(&loaded),
                    "{headers:?}: the Meta Space is unchanged"
                );
            }
        }
    }
}
