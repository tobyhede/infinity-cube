//! The scheme handler as a `Request -> Response` function, on a run of a
//! fresh copy of the tracked fixture: its own refusals, and the HTTP
//! conformance suite's body-limit, header, redirect and fallback cases
//! (`conformance/http/wire-cases.ts`, as `crates/host/tests/wire.rs` holds
//! them against the host's application) through it.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::Path;

use host::{AssetHash, MAX_ASSET_BYTES, MAX_COMMIT_BODY_BYTES, Run, RunStopped};
use serde_json::Value;
use tempfile::TempDir;

use super::*;
use crate::address::TalkKey;
use crate::built;
use crate::server::open_run;
use crate::test_support::{
    META, META_ADDRESS, STAND_IN_ICON, STAND_IN_PAGE, STAND_IN_POLICY, STAND_IN_SCRIPT,
    fixture_copy, rename_text, stand_in_build,
};

const WINDOW: &str = "talk-0";
/// One talk open in the window [`WINDOW`], served through the scheme.
struct Talk {
    open_talks: OpenTalks,
    address: TalkAddress,
    run: Run<host::RandomIds, BuiltDirectory>,
    _temporary: TempDir,
}

async fn open() -> Talk {
    let (temporary, directory) = fixture_copy();
    let shell = built::load(&stand_in_build(&temporary)).unwrap();
    let run = open_run(&directory, shell).await.unwrap();
    let address = TalkAddress::new(TalkKey::of(&directory), SchemeStyle::HostPerTalk);
    let open_talks = OpenTalks::new(SchemeStyle::HostPerTalk);
    open_talks.open(address.clone(), Arc::clone(run.application()), WINDOW);
    Talk {
        open_talks,
        address,
        run,
        _temporary: temporary,
    }
}

impl Talk {
    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.address.origin())
    }

    /// A request from the talk's own window and page, as WebKitGTK sends a
    /// page's request to its own origin under a custom scheme: naming the
    /// page as its `Referer`, and no `Origin`.
    async fn send(
        &self,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: impl Into<Vec<u8>>,
    ) -> Response<Vec<u8>> {
        let mut request = Request::builder()
            .method(method)
            .uri(self.url(path))
            .header("referer", self.url(META_ADDRESS));
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        self.open_talks
            .answer(WINDOW, request.body(body.into()).unwrap())
            .await
    }

    async fn get(&self, path: &str) -> Response<Vec<u8>> {
        self.send("GET", path, &[], Vec::new()).await
    }

    async fn load(&self, id: &str) -> Value {
        let response = self.get(&format!("/api/spaces/{id}")).await;
        assert_eq!(response.status(), 200, "{id} loads");
        json_of(&response)
    }

    async fn post_commit(&self, body: impl Into<Vec<u8>>, content_type: &str) -> Response<Vec<u8>> {
        self.send(
            "POST",
            "/api/spaces",
            &[("content-type", content_type)],
            body,
        )
        .await
    }

    async fn stop(self) {
        let stopped = self.run.stop().await;
        assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
    }
}

fn header<'a>(response: &'a Response<Vec<u8>>, name: &str) -> Option<&'a str> {
    response
        .headers()
        .get(name)
        .map(|value| value.to_str().unwrap())
}

fn json_of(response: &Response<Vec<u8>>) -> Value {
    serde_json::from_slice(response.body()).unwrap()
}

fn problem(response: &Response<Vec<u8>>, code: &str, status: u16) {
    assert_eq!(response.status(), status, "{code}: status");
    assert_eq!(
        header(response, "content-type"),
        Some("application/problem+json"),
        "{code}: media type"
    );
    assert_eq!(
        json_of(response)["type"],
        format!("urn:infinity-cube:problem:{code}"),
        "{code}: type"
    );
}

fn refused_by_the_scheme(response: &Response<Vec<u8>>, status: u16) {
    assert_eq!(response.status(), status, "the scheme's own refusal");
    assert_eq!(
        header(response, "content-type"),
        Some("text/plain; charset=utf-8"),
        "plain text"
    );
    assert_eq!(
        header(response, "cache-control"),
        Some("no-store"),
        "never cached"
    );
}

fn padded(text: &str, size: usize) -> Vec<u8> {
    let mut bytes = text.as_bytes().to_vec();
    assert!(bytes.len() <= size, "the body fits");
    bytes.resize(size, b' ');
    bytes
}

fn fresh(size: usize, stamp: &str) -> Vec<u8> {
    let mut bytes = vec![0u8; size];
    let stamp = stamp.as_bytes();
    let length = stamp.len().min(size);
    bytes[..length].copy_from_slice(&stamp[..length]);
    bytes
}

fn shell(response: &Response<Vec<u8>>) {
    assert_eq!(response.status(), 200, "the shell is served");
    assert_eq!(
        header(response, "content-type"),
        Some("text/html; charset=utf-8"),
        "shell media type"
    );
    assert_eq!(
        header(response, "x-content-type-options"),
        Some("nosniff"),
        "nosniff"
    );
    assert_eq!(
        header(response, "cache-control"),
        Some("no-store"),
        "not stored"
    );
    assert_eq!(
        header(response, "content-security-policy"),
        Some(STAND_IN_POLICY),
        "the same Content Security Policy as every host serving the build"
    );
    assert_eq!(
        response.body(),
        STAND_IN_PAGE.as_bytes(),
        "the stand-in page"
    );
}

mod the_trust_boundary {
    use super::*;

    #[tokio::test]
    async fn answers_a_read_from_the_talks_own_window() {
        let talk = open().await;
        let response = talk.get("/api/spaces").await;
        assert_eq!(response.status(), 200, "the talk's window reads its talk");
        talk.stop().await;
    }

    #[tokio::test]
    async fn refuses_an_address_naming_no_open_talk() {
        let talk = open().await;
        let elsewhere = TalkAddress::new(
            TalkKey::of(Path::new("/talks/not-open")),
            SchemeStyle::HostPerTalk,
        );
        for uri in [
            format!("{}/api/spaces", elsewhere.origin()),
            "infinitycube://localhost/api/spaces".to_owned(),
            "/api/spaces".to_owned(),
        ] {
            let request = Request::get(uri.as_str()).body(Vec::new()).unwrap();
            refused_by_the_scheme(&talk.open_talks.answer(WINDOW, request).await, 404);
        }
        talk.stop().await;
    }

    #[tokio::test]
    async fn refuses_a_window_that_is_not_the_talks() {
        let talk = open().await;
        for window in ["home", "talk-1", ""] {
            let request = Request::get(talk.url("/api/spaces"))
                .body(Vec::new())
                .unwrap();
            refused_by_the_scheme(&talk.open_talks.answer(window, request).await, 403);
        }
        talk.stop().await;
    }

    #[tokio::test]
    async fn admits_a_window_the_talks_page_opened() {
        let talk = open().await;
        let view = talk
            .open_talks
            .open_view(talk.address.key())
            .expect("the talk is open");
        let request = Request::get(talk.url(META_ADDRESS))
            .body(Vec::new())
            .unwrap();
        shell(&talk.open_talks.answer(&view, request).await);
        talk.stop().await;
    }

    #[tokio::test]
    async fn names_no_window_twice_when_a_talk_is_opened_again() {
        let talk = open().await;
        let key = talk.address.key();
        let first = talk.open_talks.open_view(key).expect("the talk is open");
        let _closed = talk.open_talks.close(key);
        assert!(
            !talk.open_talks.holds_window(key, &first),
            "a closing talk holds no window"
        );
        assert_eq!(
            talk.open_talks.open_view(key),
            None,
            "a closed talk opens no window"
        );
        talk.open_talks.open(
            talk.address.clone(),
            Arc::clone(talk.run.application()),
            WINDOW,
        );
        let again = talk
            .open_talks
            .open_view(key)
            .expect("the talk is open again");
        assert_ne!(again, first, "a label Tauri may still hold is not reused");
        assert!(talk.open_talks.holds_window(key, &again), "{again}");
        talk.stop().await;
    }

    /// A rename of the Meta Space naming `origins` and `referers`.
    fn change(
        talk: &Talk,
        loaded: &Value,
        origins: &[&str],
        referers: &[&str],
    ) -> Request<Vec<u8>> {
        let mut request =
            Request::post(talk.url("/api/spaces")).header("content-type", "application/json");
        for origin in origins {
            request = request.header("origin", *origin);
        }
        for referer in referers {
            request = request.header("referer", *referer);
        }
        request
            .body(rename_text(loaded, "Changed").into_bytes())
            .unwrap()
    }

    #[tokio::test]
    async fn admits_a_change_naming_the_talks_own_origin_or_page() {
        let talk = open().await;
        let own = talk.address.origin();
        let page = talk.url(META_ADDRESS);
        for (origins, referers) in [
            (&[own.as_str()][..], &[][..]),
            (&[own.as_str()], &[page.as_str()]),
            (&[], &[page.as_str()]),
        ] {
            let loaded = talk.load(META).await;
            let response = talk
                .open_talks
                .answer(WINDOW, change(&talk, &loaded, origins, referers))
                .await;
            assert_eq!(
                response.status(),
                200,
                "Origin {origins:?}, Referer {referers:?} is the talk's own"
            );
        }
        talk.stop().await;
    }

    #[tokio::test]
    async fn says_which_header_admitted_a_change_and_none_for_a_read() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let own = talk.address.origin();
        let page = talk.url(META_ADDRESS);
        for (origins, referers, expected) in [
            (&[own.as_str()][..], &[][..], AdmittedBy::Origin),
            (&[own.as_str()], &[page.as_str()], AdmittedBy::Origin),
            (&[], &[page.as_str()], AdmittedBy::Referer),
        ] {
            let admitted = talk
                .open_talks
                .admit(WINDOW, change(&talk, &loaded, origins, referers))
                .unwrap();
            assert_eq!(
                admitted.by(),
                Some(expected),
                "Origin {origins:?}, Referer {referers:?}"
            );
            assert_eq!(admitted.named(), "POST /api/spaces", "the request named");
        }
        let read = talk
            .open_talks
            .admit(
                WINDOW,
                Request::get(talk.url("/api/spaces"))
                    .body(Vec::new())
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(read.by(), None, "a read is admitted by no header");
        drop(read);
        talk.stop().await;
    }

    #[tokio::test]
    async fn refuses_a_change_from_anywhere_but_the_talks_own_page() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let own = talk.address.origin();
        let page = talk.url(META_ADDRESS);
        let other = TalkAddress::new(
            TalkKey::of(Path::new("/talks/other")),
            SchemeStyle::HostPerTalk,
        );
        let other_origin = other.origin();
        let other_page = format!("{other_origin}/spaces/x");
        // The talk's origin followed by more host, as a prefix test would admit.
        let longer = format!("{own}0/spaces/x");
        let cases: [(&[&str], &[&str]); 10] = [
            (&[], &[]),
            (&["null"], &[]),
            (&["null"], &[page.as_str()]),
            (&["https://example.com"], &[page.as_str()]),
            (&["http://127.0.0.1:4173"], &[]),
            (&[other_origin.as_str()], &[]),
            (&[own.as_str(), "https://example.com"], &[]),
            (&[], &[other_page.as_str()]),
            (&[], &[longer.as_str()]),
            (&[], &[page.as_str(), "https://example.com/"]),
        ];
        for (origins, referers) in cases {
            refused_by_the_scheme(
                &talk
                    .open_talks
                    .answer(WINDOW, change(&talk, &loaded, origins, referers))
                    .await,
                403,
            );
        }
        assert_eq!(
            talk.load(META).await["revision"],
            loaded["revision"],
            "nothing committed"
        );
        talk.stop().await;
    }

    /// Whether a `Referrer-Policy` value, a comma-separated list whose last
    /// token a browser knows is the one it applies, suppresses the
    /// `Referer` of a same-origin request: only `no-referrer` does.
    fn suppresses_same_origin_referer(policy: &str) -> bool {
        policy
            .split(',')
            .any(|token| token.trim().eq_ignore_ascii_case("no-referrer"))
    }

    /// Whether lower-cased HTML text gives `no-referrer` as an attribute's
    /// value (a referrer meta tag's `content`, or a `referrerpolicy`).
    fn names_no_referrer(text: &str) -> bool {
        ["\"no-referrer\"", "'no-referrer'", "=no-referrer"]
            .iter()
            .any(|value| text.contains(value))
    }

    // WebKitGTK names no `Origin` on a page's change to its own origin, so a
    // `Referer` is what admits it: a `no-referrer` policy anywhere would
    // refuse every Edit 403.
    #[tokio::test]
    async fn nothing_the_talk_is_served_with_suppresses_the_referer_that_admits_a_change() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let responses = [
            ("the root", talk.get("/").await),
            ("the page", talk.get(META_ADDRESS).await),
            (
                "a built file",
                talk.get(&format!("/{}", STAND_IN_SCRIPT.0)).await,
            ),
            ("an API read", talk.get("/api/spaces").await),
            (
                "a commit",
                talk.post_commit(rename_text(&loaded, "Referred"), "application/json")
                    .await,
            ),
            (
                "a refused commit",
                talk.post_commit("{", "application/json").await,
            ),
            (
                "an asset stored",
                talk.send(
                    "POST",
                    "/assets",
                    &[("content-type", "application/octet-stream")],
                    fresh(16, "referred"),
                )
                .await,
            ),
            (
                "the scheme's own refusal",
                talk.open_talks
                    .answer(
                        "talk-other",
                        Request::get(talk.url("/")).body(Vec::new()).unwrap(),
                    )
                    .await,
            ),
        ];
        for (what, response) in &responses {
            for policy in response.headers().get_all("referrer-policy") {
                let policy = policy.to_str().unwrap();
                assert!(
                    !suppresses_same_origin_referer(policy),
                    "{what} is answered with Referrer-Policy: {policy}"
                );
            }
            let body = String::from_utf8_lossy(response.body()).to_ascii_lowercase();
            assert!(
                !names_no_referrer(&body),
                "{what} carries a referrer meta tag or attribute suppressing the Referer"
            );
        }
        // The page every talk window loads is the built application's,
        // built from this one.
        let page = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../app/index.html"),
        )
        .unwrap()
        .to_ascii_lowercase();
        assert!(
            !names_no_referrer(&page),
            "the browser application's index.html suppresses the Referer"
        );
        talk.stop().await;
    }

    #[test]
    fn only_no_referrer_suppresses_a_same_origin_referer() {
        for policy in ["no-referrer", "NO-REFERRER", "origin, no-referrer"] {
            assert!(suppresses_same_origin_referer(policy), "{policy}");
        }
        for policy in [
            "same-origin",
            "strict-origin-when-cross-origin",
            "no-referrer-when-downgrade",
            "origin",
        ] {
            assert!(!suppresses_same_origin_referer(policy), "{policy}");
        }
    }

    #[tokio::test]
    async fn stops_serving_a_talk_once_it_is_closed() {
        let talk = open().await;
        let closed = talk.open_talks.close(talk.address.key());
        assert_eq!(
            closed.map(|closed| closed.windows),
            Some(vec![WINDOW.to_owned()]),
            "the windows that reached it"
        );
        refused_by_the_scheme(&talk.get("/api/spaces").await, 404);
        talk.stop().await;
    }

    #[tokio::test(start_paused = true)]
    async fn a_close_waits_for_a_change_being_answered_and_not_for_a_read() {
        let talk = open().await;
        let request = |method: &str| {
            Request::builder()
                .method(method)
                .uri(talk.url("/api/spaces"))
                .header("referer", talk.url(META_ADDRESS))
                .body(Vec::new())
                .unwrap()
        };
        let read = talk.open_talks.admit(WINDOW, request("GET")).unwrap();
        let change = talk.open_talks.admit(WINDOW, request("POST")).unwrap();
        let closed = talk.open_talks.close(talk.address.key()).unwrap();
        let waited = std::time::Duration::from_secs(3600);
        assert!(
            tokio::time::timeout(waited, closed.in_flight.settled())
                .await
                .is_err(),
            "a change being answered holds the close"
        );
        drop(change);
        assert!(
            tokio::time::timeout(waited, closed.in_flight.settled())
                .await
                .is_ok(),
            "a read being answered does not"
        );
        drop(read);
        talk.stop().await;
    }
}

mod body_limits {
    use super::*;

    #[tokio::test]
    async fn commits_a_body_of_exactly_the_limit() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let body = padded(&rename_text(&loaded, "At the limit"), MAX_COMMIT_BODY_BYTES);
        assert_eq!(
            talk.post_commit(body, "application/json").await.status(),
            200
        );
        talk.stop().await;
    }

    #[tokio::test]
    async fn answers_413_for_a_commit_one_byte_over_the_limit() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let body = padded(
            &rename_text(&loaded, "Too large"),
            MAX_COMMIT_BODY_BYTES + 1,
        );
        problem(
            &talk.post_commit(body, "application/json").await,
            "payload-too-large",
            413,
        );
        talk.stop().await;
    }

    #[tokio::test]
    async fn stores_a_ten_mebibyte_asset_and_serves_it_back() {
        let talk = open().await;
        let bytes = fresh(MAX_ASSET_BYTES, "limit");
        let path = format!("/assets/{}", AssetHash::of(&bytes).as_str());
        let response = talk
            .send(
                "POST",
                "/assets",
                &[("content-type", "application/octet-stream")],
                bytes.clone(),
            )
            .await;
        assert_eq!(
            response.status(),
            201,
            "an asset of exactly 10 MiB is stored"
        );
        let served = talk.get(&path).await;
        assert_eq!(served.status(), 200, "and served");
        assert!(served.body() == &bytes, "byte for byte");
        talk.stop().await;
    }

    #[tokio::test]
    async fn answers_413_for_an_asset_one_byte_over_the_limit() {
        let talk = open().await;
        let response = talk
            .send(
                "POST",
                "/assets",
                &[("content-type", "application/octet-stream")],
                fresh(MAX_ASSET_BYTES + 1, "over"),
            )
            .await;
        problem(&response, "asset-too-large", 413);
        talk.stop().await;
    }
}

mod headers {
    use super::*;

    #[tokio::test]
    async fn answers_415_for_a_commit_with_no_content_type_or_another_type() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let body = rename_text(&loaded, "Refused");
        let bare = talk.send("POST", "/api/spaces", &[], body.clone()).await;
        problem(&bare, "unsupported-media-type", 415);
        problem(
            &talk.post_commit(body, "text/plain").await,
            "unsupported-media-type",
            415,
        );
        talk.stop().await;
    }

    #[tokio::test]
    async fn answers_415_for_an_encoded_commit() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let response = talk
            .send(
                "POST",
                "/api/spaces",
                &[
                    ("content-type", "application/json"),
                    ("content-encoding", "gzip"),
                ],
                rename_text(&loaded, "Encoded"),
            )
            .await;
        problem(&response, "unsupported-media-type", 415);
        talk.stop().await;
    }

    #[tokio::test]
    async fn serves_a_content_named_built_file_as_immutable() {
        let talk = open().await;
        let response = talk.get("/assets/index-c0nf0rm4.js").await;
        assert_eq!(response.status(), 200);
        assert_eq!(
            header(&response, "content-type"),
            Some("text/javascript; charset=utf-8")
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("public, max-age=31536000, immutable")
        );
        assert_eq!(header(&response, "x-content-type-options"), Some("nosniff"));
        assert_eq!(response.body(), STAND_IN_SCRIPT.1.as_bytes());
        talk.stop().await;
    }

    #[tokio::test]
    async fn serves_another_built_file_to_be_revalidated() {
        let talk = open().await;
        let response = talk.get("/favicon.svg").await;
        assert_eq!(response.status(), 200);
        assert_eq!(header(&response, "content-type"), Some("image/svg+xml"));
        assert_eq!(header(&response, "cache-control"), Some("no-cache"));
        assert_eq!(response.body(), STAND_IN_ICON.1.as_bytes());
        talk.stop().await;
    }
}

mod redirects {
    use super::*;

    #[tokio::test]
    async fn redirects_get_and_head_of_the_root_to_the_meta_space() {
        let talk = open().await;
        for method in ["GET", "HEAD"] {
            let response = talk.send(method, "/", &[], Vec::new()).await;
            assert_eq!(response.status(), 302, "{method} /");
            assert_eq!(
                header(&response, "location"),
                Some(META_ADDRESS),
                "{method} /"
            );
        }
        talk.stop().await;
    }
}

mod fallback {
    use super::*;

    #[tokio::test]
    async fn serves_the_shell_for_a_product_address_that_resolves() {
        let talk = open().await;
        shell(&talk.get(META_ADDRESS).await);
        shell(&talk.get(&format!("{META_ADDRESS}/notes")).await);
        talk.stop().await;
    }

    #[tokio::test]
    async fn falls_back_to_the_shell_for_an_address_that_is_not_the_applications() {
        let talk = open().await;
        shell(&talk.get("/somewhere/else").await);
        talk.stop().await;
    }

    #[tokio::test]
    async fn answers_head_for_the_shell_without_its_body() {
        let talk = open().await;
        let response = talk.send("HEAD", "/somewhere/else", &[], Vec::new()).await;
        assert_eq!(response.status(), 200);
        assert_eq!(
            header(&response, "content-type"),
            Some("text/html; charset=utf-8")
        );
        assert!(response.body().is_empty(), "no body");
        talk.stop().await;
    }

    #[tokio::test]
    async fn answers_405_to_a_write_to_an_address_that_is_not_the_applications() {
        let talk = open().await;
        let response = talk.send("POST", "/somewhere/else", &[], "x").await;
        assert_eq!(response.status(), 405);
        assert_eq!(header(&response, "allow"), Some("GET, HEAD"));
        talk.stop().await;
    }

    #[tokio::test]
    async fn answers_400_invalid_asset_hash_and_no_file_outside_the_build() {
        let talk = open().await;
        problem(
            &talk.get("/assets/index-missing.js").await,
            "invalid-asset-hash",
            400,
        );
        let climb = talk.get("/assets/..%2f..%2foutside.txt").await;
        assert!(
            climb.body() != b"not built",
            "a climb out of the build should never serve a file outside it"
        );
        talk.stop().await;
    }
}
