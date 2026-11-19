//! The HTTP conformance cases (`conformance/http/wire-cases.ts` and
//! `store-condition-cases.ts`) held against the Rust application as a
//! `Request -> Response` function: one test per case or per table of cases,
//! each on a fresh Import of the tracked fixture.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::{BTreeMap, VecDeque};
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::task::{Context, Poll};

use bytes::Bytes;
use host::{
    AggregateInput, AggregateLoad, Application, AssetHash, AssetStored, CommitResult, IdSource,
    InitializeResult, LoadedSpace, MAX_ASSET_BYTES, MAX_COMMIT_BODY_BYTES, MemorySpaceRepository,
    ReplaceResult, RepositoryError, Revision, Shell, SpaceCommit, SpaceRepository, SpaceSummary,
    StoredAsset, TokioFilesystem, import_directory,
};
use http::{Request, Response};
use http_body::Frame;
use intake::json::JsonValue;
use intake::{SpaceId, Uuid};
use serde_json::{Value, json};

const META: &str = "00000000-0000-4000-8000-000000000040";
const META_ADDRESS: &str = "/spaces/AAAAAAAAQACAAAAAAAAAQA";
const UNKNOWN_SPACE: &str = "00000000-0000-4000-8000-00000000dead";
const NEW_SPACE: &str = "00000000-0000-4000-8000-0000000c0f01";
const STAND_IN_PAGE: &str = "<!doctype html><html><head><title>Stand-in</title><script>window.standIn = true;</script></head><body><div id=\"root\"></div></body></html>\n";
const STAND_IN_SCRIPT: (&str, &str) = ("assets/index-c0nf0rm4.js", "console.log(\"stand-in\");\n");
const STAND_IN_ICON: (&str, &str) = (
    "favicon.svg",
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"/>\n",
);
/// `contentSecurityPolicy(inlineScriptSources(page), [])` for the stand-in
/// page, its one script hashed by `openssl dgst -sha256 -binary | base64`.
const STAND_IN_POLICY: &str = "default-src 'self'; script-src 'self' 'sha256-PhqNIk+nbvnTgY4TWUCSygYKMiovRbbBV8E7EBCqKHo='; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/// Ids counted up from one, for a hand-authored directory and a working read.
#[derive(Default)]
struct Counted(AtomicUsize);

impl IdSource for Counted {
    fn new_id(&self) -> Uuid {
        let next = self.0.fetch_add(1, Ordering::SeqCst) + 1;
        Uuid::parse(&format!("00000000-0000-4000-8000-{next:012x}")).unwrap()
    }
}

type Built = BTreeMap<String, Bytes>;
type Host<R> = Application<R, Counted, Built>;

fn shell() -> Shell<Built> {
    let files = [STAND_IN_SCRIPT, STAND_IN_ICON]
        .into_iter()
        .map(|(path, text)| (path.to_owned(), Bytes::from_static(text.as_bytes())))
        .collect();
    Shell::new(STAND_IN_PAGE, files)
}

fn fixture() -> PathBuf {
    PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/app/fixture"
    ))
}

async fn open() -> Host<MemorySpaceRepository> {
    let store = MemorySpaceRepository::new();
    let ids = Counted::default();
    import_directory(&store, &TokioFilesystem, &fixture(), &ids)
        .await
        .unwrap();
    Application::new(Arc::new(store), ids, shell())
}

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

fn header<'a>(response: &'a Response<Bytes>, name: &str) -> Option<&'a str> {
    response
        .headers()
        .get(name)
        .map(|value| value.to_str().unwrap())
}

fn json_of(response: &Response<Bytes>) -> Value {
    serde_json::from_slice(response.body()).unwrap()
}

mod assertions {
    use super::*;

    pub(crate) fn problem(response: &Response<Bytes>, code: &str, status: u16, title: &str) {
        assert_eq!(response.status(), status, "{code}: status");
        assert_eq!(
            header(response, "content-type"),
            Some("application/problem+json"),
            "{code}: media type"
        );
        let body = json_of(response);
        assert_eq!(
            body["type"],
            format!("urn:infinity-cube:problem:{code}"),
            "{code}: type"
        );
        assert_eq!(body["title"], title, "{code}: title");
        assert_eq!(body["status"], status, "{code}: body status");
        assert_ne!(body["detail"].as_str().unwrap(), "", "{code}: detail");
    }

    pub(crate) fn whole_body_invalid(response: &Response<Bytes>) {
        assert_eq!(
            json_of(response)["errors"],
            json!([{ "code": "invalid-value", "pointer": "" }]),
            "the whole body is refused"
        );
    }

    pub(crate) fn api_policy(response: &Response<Bytes>) {
        assert_eq!(
            header(response, "cache-control"),
            Some("no-store"),
            "API answers are not stored"
        );
    }

    pub(crate) fn json_media(response: &Response<Bytes>) {
        assert_eq!(
            header(response, "content-type"),
            Some("application/json; charset=utf-8"),
            "JSON names its charset"
        );
    }

    pub(crate) fn html_problem(response: &Response<Bytes>, status: u16) {
        assert_eq!(response.status(), status, "HTML problem status");
        assert_eq!(
            header(response, "content-type"),
            Some("text/html; charset=utf-8"),
            "HTML problem media type"
        );
        assert!(
            response.body().starts_with(b"<!doctype html>"),
            "an HTML page: {:?}",
            response.body()
        );
    }

    pub(crate) fn shell(response: &Response<Bytes>) {
        assert_eq!(response.status(), 200, "the shell is served");
        assert_eq!(
            header(response, "content-type"),
            Some("text/html; charset=utf-8"),
            "shell media type"
        );
        assert_eq!(
            header(response, "x-content-type-options"),
            Some("nosniff"),
            "shell nosniff"
        );
        assert_eq!(
            header(response, "cache-control"),
            Some("no-store"),
            "shell is not stored"
        );
        assert_eq!(
            header(response, "content-security-policy"),
            Some(STAND_IN_POLICY),
            "shell policy"
        );
        assert_eq!(
            response.body(),
            STAND_IN_PAGE.as_bytes(),
            "the stand-in page"
        );
    }
}

use assertions::{api_policy, html_problem, json_media, problem, whole_body_invalid};

fn not_found(response: &Response<Bytes>) {
    problem(response, "not-found", 404, "Not found");
}

fn invalid_request(response: &Response<Bytes>) {
    problem(response, "invalid-request", 400, "Invalid request");
}

fn unsupported(response: &Response<Bytes>) {
    problem(
        response,
        "unsupported-media-type",
        415,
        "Unsupported media type",
    );
}

async fn load<R: SpaceRepository>(host: &Host<R>, id: &str) -> Value {
    let response = get(host, &format!("/api/spaces/{id}")).await;
    assert_eq!(response.status(), 200, "{id} loads");
    json_of(&response)
}

fn rename_change(loaded: &Value, title: &str) -> Value {
    let mut snapshot = loaded["snapshot"].clone();
    snapshot["document"]["title"] = json!(title);
    json!({
        "kind": "update",
        "spaceId": loaded["snapshot"]["id"],
        "snapshot": snapshot,
        "expectedRevision": loaded["revision"],
    })
}

fn rename_text(loaded: &Value, title: &str) -> String {
    json!({ "changes": [rename_change(loaded, title)] }).to_string()
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

fn padded(text: &str, size: usize) -> Vec<u8> {
    let mut bytes = text.as_bytes().to_vec();
    assert!(bytes.len() <= size, "the body fits");
    bytes.resize(size, b' ');
    bytes
}

fn revision(loaded: &Value) -> u64 {
    loaded["revision"].as_str().unwrap().parse().unwrap()
}

mod the_space_api {
    use super::*;

    #[tokio::test]
    async fn lists_every_space_of_the_directory_with_its_title() {
        let host = open().await;
        let response = get(&host, "/api/spaces").await;
        assert_eq!(response.status(), 200, "listed");
        json_media(&response);
        api_policy(&response);
        let mut ids: Vec<String> = json_of(&response)
            .as_array()
            .unwrap()
            .iter()
            .map(|summary| {
                assert!(summary["title"].is_string(), "a title: {summary}");
                summary["id"].as_str().unwrap().to_owned()
            })
            .collect();
        ids.sort();
        assert_eq!(
            ids,
            [
                "00000000-0000-4000-8000-000000000040",
                "00000000-0000-4000-8000-000000000060",
                "00000000-0000-4000-8000-000000000070",
                "00000000-0000-4000-8000-000000000080",
            ],
            "every Space directory of the fixture"
        );
    }

    #[tokio::test]
    async fn answers_one_space_with_its_snapshot_and_revision() {
        let host = open().await;
        let loaded = load(&host, META).await;
        assert_eq!(loaded["snapshot"]["id"], META, "its snapshot");
        assert!(
            loaded["revision"].as_str().unwrap().parse::<u64>().is_ok(),
            "a revision: {loaded}"
        );
    }

    #[tokio::test]
    async fn answers_the_aggregate_with_its_meta_space_and_every_space() {
        let host = open().await;
        let response = get(&host, "/api/aggregate").await;
        assert_eq!(response.status(), 200, "loaded");
        json_media(&response);
        api_policy(&response);
        let body = json_of(&response);
        assert_eq!(body["kind"], "loaded", "the aggregate is loaded");
        assert_eq!(body["aggregate"]["metaSpaceId"], META, "its Meta Space");
        assert_eq!(
            body["aggregate"]["spaces"].as_array().unwrap().len(),
            4,
            "every Space"
        );
    }

    #[tokio::test]
    async fn answers_404_for_a_space_that_does_not_exist() {
        let host = open().await;
        let response = get(&host, &format!("/api/spaces/{UNKNOWN_SPACE}")).await;
        api_policy(&response);
        not_found(&response);
    }

    #[tokio::test]
    async fn answers_400_invalid_space_id_whatever_the_method() {
        let host = open().await;
        for method in ["GET", "PUT"] {
            let response = send(&host, method, "/api/spaces/not-a-uuid", &[], Bytes::new()).await;
            problem(&response, "invalid-space-id", 400, "Invalid Space id");
        }
    }

    #[tokio::test]
    async fn answers_405_naming_the_methods_a_path_allows() {
        let host = open().await;
        let meta = format!("/api/spaces/{META}");
        let unstored = format!("/assets/{}", "A".repeat(43));
        for (method, path, allow) in [
            ("DELETE", "/api/spaces", "GET, POST"),
            ("HEAD", "/api/spaces", "GET, POST"),
            ("POST", "/api/aggregate", "GET"),
            ("PUT", meta.as_str(), "GET"),
            ("HEAD", meta.as_str(), "GET"),
            ("GET", "/assets", "POST"),
            ("DELETE", unstored.as_str(), "GET, HEAD"),
        ] {
            let response = send(&host, method, path, &[], Bytes::new()).await;
            assert_eq!(response.status(), 405, "{method} {path}");
            assert_eq!(
                header(&response, "allow"),
                Some(allow),
                "{method} {path}: Allow"
            );
            api_policy(&response);
            if method == "HEAD" {
                assert!(response.body().is_empty(), "{method} {path}: no body");
            } else {
                problem(&response, "method-not-allowed", 405, "Method not allowed");
            }
        }
    }

    #[tokio::test]
    async fn answers_a_path_escaping_an_unreserved_character_as_the_path_it_escapes() {
        let host = open().await;
        let escaped_id = format!("/api/spaces/%30{}", &META[1..]);
        for path in ["/api/%73paces", escaped_id.as_str()] {
            let response = get(&host, path).await;
            assert_eq!(response.status(), 200, "{path}: {:?}", response.body());
            json_media(&response);
            api_policy(&response);
        }
    }

    #[tokio::test]
    async fn answers_404_for_a_path_off_the_declared_api() {
        let host = open().await;
        let more = format!("/api/spaces/{META}/more");
        for path in ["/api", "/api/nowhere", "/api/spaces/", more.as_str()] {
            let response = get(&host, path).await;
            api_policy(&response);
            not_found(&response);
        }
    }
}

mod commits {
    use super::*;

    #[tokio::test]
    async fn answers_200_committed_with_each_spaces_next_revision() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let response =
            post_commit(&host, rename_text(&loaded, "Committed"), "application/json").await;
        assert_eq!(response.status(), 200, "committed");
        json_media(&response);
        api_policy(&response);
        assert_eq!(
            json_of(&response),
            json!({
                "revisions": [{ "spaceId": META, "revision": (revision(&loaded) + 1).to_string() }],
                "deletedSpaceIds": [],
            }),
            "the next revision"
        );
        assert_eq!(
            load(&host, META).await["snapshot"]["document"]["title"],
            "Committed",
            "renamed"
        );
    }

    #[tokio::test]
    async fn answers_409_conflict_with_the_current_space_for_a_stale_revision() {
        let host = open().await;
        let stale = load(&host, META).await;
        let first = post_commit(&host, rename_text(&stale, "First"), "application/json").await;
        assert_eq!(first.status(), 200, "the first commit");
        let response = post_commit(&host, rename_text(&stale, "Second"), "application/json").await;
        assert_eq!(response.status(), 409, "a conflict");
        json_media(&response);
        let conflicts = json_of(&response)["conflicts"].clone();
        assert_eq!(conflicts.as_array().unwrap().len(), 1, "one conflict");
        assert_eq!(conflicts[0]["spaceId"], META, "the Meta Space");
        assert_eq!(
            conflicts[0]["current"]["revision"],
            (revision(&stale) + 1).to_string(),
            "its current revision"
        );
        assert_eq!(
            conflicts[0]["current"]["snapshot"]["document"]["title"], "First",
            "its current title"
        );
    }

    #[tokio::test]
    async fn answers_422_for_a_space_no_space_resource_references() {
        let host = open().await;
        let commit = json!({
            "changes": [{
                "kind": "create",
                "spaceId": NEW_SPACE,
                "snapshot": { "id": NEW_SPACE, "document": { "version": 1, "title": "Unreferenced" }, "resources": [] },
            }],
        });
        let response = post_commit(&host, commit.to_string(), "application/json").await;
        assert_eq!(response.status(), 422, "refused");
        json_media(&response);
        assert_eq!(
            json_of(&response),
            json!({ "errors": [{ "kind": "ordinary-space-unreferenced", "spaceId": NEW_SPACE }] }),
            "the unreferenced Space"
        );
        not_found(&get(&host, &format!("/api/spaces/{NEW_SPACE}")).await);
    }

    /// `value` with each member `transform` answers for its key replaced.
    fn replacing(
        value: &JsonValue,
        transform: impl Fn(&str, &JsonValue) -> Option<JsonValue>,
    ) -> JsonValue {
        let object = value.as_object().unwrap();
        JsonValue::Object(
            object
                .iter()
                .map(|(key, member)| {
                    let member = transform(key, member).unwrap_or_else(|| member.clone());
                    (key.to_owned(), member)
                })
                .collect(),
        )
    }

    fn first_map_positions(snapshot: &JsonValue) -> Vec<String> {
        let map = match snapshot.as_object().unwrap().get("document").unwrap() {
            JsonValue::Object(document) => match document.get("maps").unwrap() {
                JsonValue::Array(maps) => maps.first().unwrap().clone(),
                other => panic!("maps: {other}"),
            },
            other => panic!("document: {other}"),
        };
        let positions = map.as_object().unwrap().get("positions").unwrap();
        positions
            .as_object()
            .unwrap()
            .iter()
            .map(|(id, _)| id.to_owned())
            .collect()
    }

    fn text_of(response: &Response<Bytes>) -> JsonValue {
        intake::json::parse(std::str::from_utf8(response.body()).unwrap()).unwrap()
    }

    #[tokio::test]
    async fn answers_a_space_with_its_positions_in_the_order_the_commit_wrote_them() {
        let host = open().await;
        let loaded = text_of(&get(&host, &format!("/api/spaces/{META}")).await);
        let loaded = loaded.as_object().unwrap();
        let revision = loaded.get("revision").unwrap().as_str().unwrap();
        let snapshot = replacing(loaded.get("snapshot").unwrap(), |key, document| {
            (key == "document").then(|| {
                replacing(document, |key, maps| {
                    let JsonValue::Array(maps) = maps else {
                        return None;
                    };
                    (key == "maps").then(|| {
                        let mut maps = maps.clone();
                        let first = maps.first_mut().unwrap();
                        *first = replacing(first, |key, positions| {
                            (key == "positions").then(|| {
                                let mut entries: Vec<(String, JsonValue)> = positions
                                    .as_object()
                                    .unwrap()
                                    .iter()
                                    .map(|(id, at)| (id.to_owned(), at.clone()))
                                    .collect();
                                entries.reverse();
                                JsonValue::Object(entries.into_iter().collect())
                            })
                        });
                        JsonValue::Array(maps)
                    })
                })
            })
        });
        let order = first_map_positions(&snapshot);
        assert!(
            order.len() > 1,
            "the fixture Meta Space's Map has positions"
        );
        let body = format!(
            r#"{{"changes":[{{"kind":"update","spaceId":"{META}","snapshot":{snapshot},"expectedRevision":"{revision}"}}]}}"#
        );
        let committed = post_commit(&host, body.clone(), "application/json").await;
        assert_eq!(committed.status(), 200, "committed: {:?}", committed.body());
        let answered = text_of(&get(&host, &format!("/api/spaces/{META}")).await);
        assert_eq!(
            first_map_positions(answered.as_object().unwrap().get("snapshot").unwrap()),
            order,
            "the positions in the order the commit wrote them"
        );
        let stale = post_commit(&host, body, "application/json").await;
        assert_eq!(stale.status(), 409, "a conflict");
        let JsonValue::Array(conflicts) = text_of(&stale)
            .as_object()
            .unwrap()
            .get("conflicts")
            .unwrap()
            .clone()
        else {
            panic!("conflicts");
        };
        let current = conflicts
            .first()
            .unwrap()
            .as_object()
            .unwrap()
            .get("current")
            .unwrap()
            .clone();
        assert_eq!(
            first_map_positions(current.as_object().unwrap().get("snapshot").unwrap()),
            order,
            "the conflict's current Space as stored"
        );
    }

    #[tokio::test]
    async fn answers_400_for_a_commit_the_store_will_not_judge() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let change = rename_change(&loaded, "Twice");
        let text = json!({ "changes": [change.clone(), change] }).to_string();
        let response = post_commit(&host, text, "application/json").await;
        api_policy(&response);
        invalid_request(&response);
        whole_body_invalid(&response);
    }

    #[tokio::test]
    async fn answers_400_for_malformed_json() {
        let host = open().await;
        let response = post_commit(&host, "{", "application/json").await;
        invalid_request(&response);
        assert!(
            json_of(&response).get("errors").is_none(),
            "no errors: {:?}",
            response.body()
        );
    }

    /// ADR 0160: a lone surrogate escape is refused as malformed JSON and
    /// nothing is stored, as the Node host refuses it.
    #[tokio::test]
    async fn answers_400_for_a_lone_surrogate_escape_as_for_malformed_json() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let text = rename_text(&loaded, "LONE").replace("\"LONE\"", r#""\ud800x""#);
        assert!(text.contains(r"\ud800x"), "the escape is sent: {text}");
        let response = post_commit(&host, text, "application/json").await;
        invalid_request(&response);
        assert_eq!(
            json_of(&response)["detail"],
            "Malformed JSON in request body",
            "refused as malformed"
        );
        assert_eq!(
            revision(&load(&host, META).await),
            revision(&loaded),
            "nothing stored"
        );
    }

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
    async fn commits_a_body_nested_to_the_limit_and_refuses_one_nested_past_it() {
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

    #[tokio::test]
    async fn answers_400_for_a_body_that_is_not_a_commit() {
        let host = open().await;
        let response = post_commit(&host, r#"{"changes":"none"}"#, "application/json").await;
        invalid_request(&response);
        whole_body_invalid(&response);
    }

    #[tokio::test]
    async fn answers_415_for_a_commit_sent_with_no_content_type() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let response = send(
            &host,
            "POST",
            "/api/spaces",
            &[],
            rename_text(&loaded, "Untyped"),
        )
        .await;
        unsupported(&response);
        assert_eq!(
            revision(&load(&host, META).await),
            revision(&loaded),
            "nothing committed"
        );
    }

    #[tokio::test]
    async fn answers_415_for_a_commit_sent_as_another_type() {
        let host = open().await;
        for content_type in [
            "text/plain",
            "application/json; charset=iso-8859-1",
            "application/json; x=1; x=2",
        ] {
            let loaded = load(&host, META).await;
            unsupported(&post_commit(&host, rename_text(&loaded, "Refused"), content_type).await);
        }
    }

    #[tokio::test]
    async fn answers_415_for_an_encoded_commit() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let response = send(
            &host,
            "POST",
            "/api/spaces",
            &[
                ("content-type", "application/json"),
                ("content-encoding", "gzip"),
            ],
            rename_text(&loaded, "Encoded"),
        )
        .await;
        unsupported(&response);
    }

    #[tokio::test]
    async fn accepts_a_media_type_with_spaces_around_its_parameter() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let response = post_commit(
            &host,
            rename_text(&loaded, "Spaced"),
            "application/json ; charset=UTF-8",
        )
        .await;
        assert_eq!(response.status(), 200, "RFC 9110 allows the spaces");
    }

    #[tokio::test]
    async fn accepts_a_media_type_whose_quoted_parameter_carries_a_latin_1_byte() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let request = Request::post("/api/spaces")
            .header(
                "content-type",
                http::HeaderValue::from_bytes(b"application/json; x=\"\xe9\"").unwrap(),
            )
            .body(body(rename_text(&loaded, "Latin-1")))
            .unwrap();
        let response = host.handle(request).await;
        assert_eq!(response.status(), 200, "committed: {:?}", response.body());
    }

    #[tokio::test]
    async fn commits_a_body_of_exactly_the_limit() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let padded = padded(&rename_text(&loaded, "At the limit"), MAX_COMMIT_BODY_BYTES);
        assert_eq!(
            post_commit(&host, padded, "application/json")
                .await
                .status(),
            200,
            "at the limit"
        );
    }

    #[tokio::test]
    async fn answers_413_for_a_body_one_byte_over_the_limit() {
        let host = open().await;
        let loaded = load(&host, META).await;
        let padded = padded(
            &rename_text(&loaded, "Too large"),
            MAX_COMMIT_BODY_BYTES + 1,
        );
        let response = post_commit(&host, padded, "application/json").await;
        api_policy(&response);
        problem(&response, "payload-too-large", 413, "Payload too large");
        assert_eq!(
            revision(&load(&host, META).await),
            revision(&loaded),
            "nothing committed"
        );
    }

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
        let chunk = Bytes::from(vec![b' '; MAX_COMMIT_BODY_BYTES / 2 + 1]);
        let request = Request::builder()
            .method("POST")
            .uri("/api/spaces")
            .header("content-type", "application/json")
            .body(Chunks(VecDeque::from([chunk.clone(), chunk])))
            .unwrap();
        problem(
            &host.handle(request).await,
            "payload-too-large",
            413,
            "Payload too large",
        );
    }
}

mod assets {
    use super::*;

    fn fresh(size: usize, stamp: &str) -> Vec<u8> {
        let mut bytes = vec![0u8; size];
        let stamp = stamp.as_bytes();
        let length = stamp.len().min(size);
        bytes[..length].copy_from_slice(&stamp[..length]);
        bytes
    }

    async fn post_asset<R: SpaceRepository>(
        host: &Host<R>,
        bytes: Vec<u8>,
        headers: &[(&str, &str)],
    ) -> Response<Bytes> {
        send(host, "POST", "/assets", headers, bytes).await
    }

    fn path_of(bytes: &[u8]) -> String {
        format!("/assets/{}", AssetHash::of(bytes).as_str())
    }

    #[tokio::test]
    async fn stores_an_asset_at_its_hash_201_the_first_time_and_200_after() {
        let host = open().await;
        let bytes = fresh(64, "stores");
        let url = path_of(&bytes);
        let first = post_asset(&host, bytes.clone(), &[("content-type", "image/png")]).await;
        assert_eq!(first.status(), 201, "stored");
        assert_eq!(
            header(&first, "location"),
            Some(url.as_str()),
            "its location"
        );
        json_media(&first);
        api_policy(&first);
        assert_eq!(json_of(&first), json!({ "url": url }), "its url");
        let again = post_asset(&host, bytes, &[("content-type", "image/png")]).await;
        assert_eq!(again.status(), 200, "already stored");
        assert_eq!(json_of(&again), json!({ "url": url }), "the same url");
    }

    #[tokio::test]
    async fn serves_a_stored_picture_as_itself_immutable_and_sandboxed() {
        let host = open().await;
        let bytes = fresh(32, "picture");
        post_asset(&host, bytes.clone(), &[("content-type", "image/png")]).await;
        let response = get(&host, &path_of(&bytes)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/png"),
            "as itself"
        );
        assert_eq!(
            header(&response, "x-asset-media-type"),
            Some("image/png"),
            "its stored type"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("public, max-age=31536000, immutable"),
            "immutable"
        );
        assert_eq!(
            header(&response, "x-content-type-options"),
            Some("nosniff"),
            "nosniff"
        );
        assert_eq!(
            header(&response, "content-security-policy"),
            Some("default-src 'none'; sandbox"),
            "sandboxed"
        );
        assert_eq!(response.body().as_ref(), bytes.as_slice(), "its bytes");
    }

    #[tokio::test]
    async fn serves_any_other_stored_type_as_inert_bytes() {
        let host = open().await;
        let bytes = fresh(16, "html");
        post_asset(&host, bytes.clone(), &[("content-type", "text/html")]).await;
        let response = get(&host, &path_of(&bytes)).await;
        assert_eq!(
            header(&response, "content-type"),
            Some("application/octet-stream"),
            "inert"
        );
        assert_eq!(
            header(&response, "x-asset-media-type"),
            Some("text/html"),
            "its stored type"
        );
    }

    #[tokio::test]
    async fn answers_head_for_a_stored_asset_without_its_bytes() {
        let host = open().await;
        let bytes = fresh(16, "head");
        post_asset(&host, bytes.clone(), &[("content-type", "image/png")]).await;
        let response = send(&host, "HEAD", &path_of(&bytes), &[], Bytes::new()).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/png"),
            "its type"
        );
        assert!(response.body().is_empty(), "no bytes");
    }

    #[tokio::test]
    async fn serves_a_stored_asset_at_its_hash_with_a_character_escaped() {
        let host = open().await;
        let bytes = fresh(16, "escaped");
        post_asset(&host, bytes.clone(), &[("content-type", "image/png")]).await;
        let path = path_of(&bytes);
        let hash = path.strip_prefix("/assets/").unwrap();
        let escaped = format!("/assets/%{:02X}{}", hash.as_bytes()[0], &hash[1..]);
        let response = get(&host, &escaped).await;
        assert_eq!(response.status(), 200, "{escaped}: {:?}", response.body());
        assert_eq!(
            header(&response, "x-asset-media-type"),
            Some("image/png"),
            "the stored type"
        );
        assert_eq!(response.body().as_ref(), bytes.as_slice(), "its bytes");
    }

    #[tokio::test]
    async fn answers_404_for_a_hash_no_asset_is_stored_at() {
        let host = open().await;
        not_found(&get(&host, &format!("/assets/{}", "A".repeat(43))).await);
    }

    #[tokio::test]
    async fn answers_415_for_an_encoded_asset() {
        let host = open().await;
        let response = post_asset(
            &host,
            fresh(8, "encoded"),
            &[("content-type", "image/png"), ("content-encoding", "gzip")],
        )
        .await;
        unsupported(&response);
    }

    #[tokio::test]
    async fn stores_an_asset_of_exactly_the_limit() {
        let host = open().await;
        let response = post_asset(
            &host,
            fresh(MAX_ASSET_BYTES, "limit"),
            &[("content-type", "application/octet-stream")],
        )
        .await;
        assert_eq!(response.status(), 201, "at the limit");
    }

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
    async fn drains_an_oversized_body_no_further_than_the_commit_route_does() {
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

    #[tokio::test]
    async fn answers_413_for_an_asset_one_byte_over_the_limit() {
        let host = open().await;
        let bytes = fresh(MAX_ASSET_BYTES + 1, "over");
        let path = path_of(&bytes);
        let response = post_asset(
            &host,
            bytes,
            &[("content-type", "application/octet-stream")],
        )
        .await;
        api_policy(&response);
        problem(&response, "asset-too-large", 413, "Asset too large");
        not_found(&get(&host, &path).await);
    }
}

mod product_addresses {
    use super::*;

    #[tokio::test]
    async fn redirects_get_and_head_of_the_root_to_the_meta_space() {
        let host = open().await;
        for method in ["GET", "HEAD"] {
            let response = send(&host, method, "/", &[], Bytes::new()).await;
            assert_eq!(response.status(), 302, "{method}: a redirect");
            assert_eq!(
                header(&response, "location"),
                Some(META_ADDRESS),
                "{method}: the Meta Space"
            );
        }
    }

    #[tokio::test]
    async fn serves_the_meta_space_the_root_redirects_to_whatever_its_first_digit() {
        let store = MemorySpaceRepository::new();
        let ids = Counted::default();
        let directory = PathBuf::from(concat!(
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
    async fn answers_405_to_a_write_allowing_get_and_head() {
        let host = open().await;
        let notes = format!("{META_ADDRESS}/notes");
        for (path, method) in [
            ("/", "POST"),
            (META_ADDRESS, "POST"),
            (notes.as_str(), "DELETE"),
        ] {
            let response = send(&host, method, path, &[], Bytes::new()).await;
            assert_eq!(
                header(&response, "allow"),
                Some("GET, HEAD"),
                "{method} {path}: Allow"
            );
            problem(&response, "method-not-allowed", 405, "Method not allowed");
        }
    }

    #[tokio::test]
    async fn answers_400_to_an_address_that_cannot_be_read() {
        let host = open().await;
        let nowhere = format!("{META_ADDRESS}/nowhere");
        for (method, path) in [
            ("GET", "/spaces"),
            ("GET", "/spaces/not-an-id"),
            ("GET", nowhere.as_str()),
            ("POST", "/spaces/not-an-id"),
        ] {
            invalid_request(&send(&host, method, path, &[], Bytes::new()).await);
        }
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

    #[tokio::test]
    async fn answers_404_for_an_address_naming_no_space() {
        let host = open().await;
        not_found(&get(&host, "/spaces/AAAAAAAAQACAAAAAAADerQ").await);
    }

    #[tokio::test]
    async fn answers_its_refusals_as_html_to_a_request_that_accepts_it() {
        let host = open().await;
        let accept = [("accept", "text/html,application/xhtml+xml;q=0.9")];
        html_problem(
            &send(&host, "GET", "/spaces", &accept, Bytes::new()).await,
            400,
        );
        html_problem(
            &send(
                &host,
                "GET",
                "/spaces/AAAAAAAAQACAAAAAAADerQ",
                &accept,
                Bytes::new(),
            )
            .await,
            404,
        );
        let refused = send(&host, "POST", "/", &accept, Bytes::new()).await;
        assert_eq!(header(&refused, "allow"), Some("GET, HEAD"), "Allow");
        html_problem(&refused, 405);
    }
}

mod the_application_shell {
    use super::*;

    #[tokio::test]
    async fn serves_the_shell_for_a_product_address_that_resolves() {
        let host = open().await;
        assertions::shell(&get(&host, META_ADDRESS).await);
        assertions::shell(&get(&host, &format!("{META_ADDRESS}/notes")).await);
    }

    #[tokio::test]
    async fn falls_back_to_the_shell_for_an_address_that_is_not_the_applications() {
        let host = open().await;
        assertions::shell(&get(&host, "/somewhere/else").await);
    }

    #[tokio::test]
    async fn answers_head_for_the_shell_without_its_body() {
        let host = open().await;
        let response = send(&host, "HEAD", "/somewhere/else", &[], Bytes::new()).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("text/html; charset=utf-8"),
            "the page's type"
        );
        assert!(response.body().is_empty(), "no body");
    }

    #[tokio::test]
    async fn answers_405_to_a_write_to_an_address_that_is_not_the_applications() {
        let host = open().await;
        let response = send(&host, "POST", "/somewhere/else", &[], "x").await;
        assert_eq!(response.status(), 405, "refused");
        assert_eq!(header(&response, "allow"), Some("GET, HEAD"), "Allow");
    }

    #[tokio::test]
    async fn serves_a_content_named_built_file_as_immutable() {
        let host = open().await;
        let response = get(&host, &format!("/{}", STAND_IN_SCRIPT.0)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("text/javascript; charset=utf-8"),
            "script"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("public, max-age=31536000, immutable"),
            "immutable"
        );
        assert_eq!(
            header(&response, "x-content-type-options"),
            Some("nosniff"),
            "nosniff"
        );
        assert_eq!(response.body(), STAND_IN_SCRIPT.1.as_bytes(), "its text");
    }

    #[tokio::test]
    async fn serves_another_built_file_to_be_revalidated() {
        let host = open().await;
        let response = get(&host, &format!("/{}", STAND_IN_ICON.0)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/svg+xml"),
            "svg"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("no-cache"),
            "revalidated"
        );
        assert_eq!(response.body(), STAND_IN_ICON.1.as_bytes(), "its text");
    }

    #[tokio::test]
    async fn serves_the_built_file_an_escaped_climb_under_assets_resolves_to() {
        let host = open().await;
        let response = get(&host, &format!("/assets/..%2F{}", STAND_IN_ICON.0)).await;
        assert_eq!(response.status(), 200, "served: {:?}", response.body());
        assert_eq!(
            header(&response, "content-type"),
            Some("image/svg+xml"),
            "its media type"
        );
        assert_eq!(response.body(), STAND_IN_ICON.1.as_bytes(), "its text");
    }

    #[tokio::test]
    async fn answers_400_invalid_asset_hash_and_no_file_under_assets() {
        let host = open().await;
        for path in [
            "/assets/index-missing.js",
            "/assets/..%2f..%2foutside-the-build.txt",
        ] {
            problem(
                &get(&host, path).await,
                "invalid-asset-hash",
                400,
                "Invalid asset hash",
            );
        }
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

    #[tokio::test]
    async fn answers_broken_stored_state_500() {
        let host = over(Failing(|| {
            RepositoryError::BrokenStoredState("broken".to_owned())
        }));
        answers(&host, "internal-error", 500, "Internal server error").await;
    }
}

mod errors {
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

mod edits {
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
    async fn an_accepted_commit_is_an_edit() {
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
    async fn a_working_read_that_initializes_a_space_is_no_edit() {
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
