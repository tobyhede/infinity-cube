//! The scheme handler as a `Request -> Response` function, on a run of a
//! fresh copy of the tracked fixture: its own refusals, and the HTTP
//! conformance suite's body-limit, header, redirect and fallback cases
//! (`conformance/http/wire-cases.ts`, as `crates/host/tests/wire.rs` holds
//! them against the host's application) through it. A test porting a case
//! carries `// Case: <its name>`, and
//! `test/unit/http-conformance-rust-ports.test.ts` holds this file to the case
//! lists, each case it does not port exempted there with why.

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
use crate::server::{built_shell, open_run};
use crate::test_support::{
    META, META_ADDRESS, STAND_IN_ICON, STAND_IN_PAGE, STAND_IN_POLICY, STAND_IN_SCRIPT,
    fixture_copy, rename_text, stand_in_build,
};

const WINDOW: &str = "talk-0";
/// One talk open in the window [`WINDOW`], served through the scheme.
struct Talk {
    open_talks: OpenTalks,
    address: TalkAddress,
    run: Run<host::RandomIds, host::BuiltApplicationDirectory>,
    _temporary: TempDir,
}

async fn open() -> Talk {
    let (temporary, directory) = fixture_copy();
    let shell = built_shell(&stand_in_build(&temporary)).unwrap();
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

mod given_a_request_at_the_trust_boundary {
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
    async fn nothing_it_is_served_with_suppresses_the_admitting_referer() {
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

mod given_a_body_at_its_limit {
    use super::*;

    // Case: commits a body of exactly * bytes
    #[tokio::test]
    async fn commits_a_body_of_exactly_the_limit() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let body = padded(&rename_text(&loaded, "At the limit"), MAX_COMMIT_BODY_BYTES);
        assert_eq!(
            talk.post_commit(body, "application/json").await.status(),
            200,
            "a commit body of exactly the limit should be accepted"
        );
        talk.stop().await;
    }

    // Case: answers 413 payload-too-large for a body of * bytes
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

    // Case: stores an asset of exactly * bytes
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

    // Case: answers 413 asset-too-large for an asset of * bytes
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

mod given_a_header_to_judge {
    use super::*;

    // Case: answers 415 unsupported-media-type for a commit sent with no Content-Type
    // Case: answers 415 unsupported-media-type for a commit sent as %s
    #[tokio::test]
    async fn answers_415_for_a_commit_with_no_or_another_content_type() {
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

    // Case: answers 415 unsupported-media-type for an encoded commit
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

    // Case: serves a content-named built file as immutable
    #[tokio::test]
    async fn serves_a_content_named_built_file_as_immutable() {
        let talk = open().await;
        let response = talk.get("/assets/index-c0nf0rm4.js").await;
        assert_eq!(response.status(), 200, "a built file should be served");
        assert_eq!(
            header(&response, "content-type"),
            Some("text/javascript; charset=utf-8"),
            "a script should be served as JavaScript"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("public, max-age=31536000, immutable"),
            "a content-named file should be cached as immutable"
        );
        assert_eq!(
            header(&response, "x-content-type-options"),
            Some("nosniff"),
            "the type should not be sniffed"
        );
        assert_eq!(
            response.body(),
            STAND_IN_SCRIPT.1.as_bytes(),
            "the body should be the built script"
        );
        talk.stop().await;
    }

    // Case: serves another built file to be revalidated
    #[tokio::test]
    async fn serves_another_built_file_to_be_revalidated() {
        let talk = open().await;
        let response = talk.get("/favicon.svg").await;
        assert_eq!(response.status(), 200, "a built file should be served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/svg+xml"),
            "an icon should be served as SVG"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("no-cache"),
            "a file not named by content should be revalidated"
        );
        assert_eq!(
            response.body(),
            STAND_IN_ICON.1.as_bytes(),
            "the body should be the built icon"
        );
        talk.stop().await;
    }
}

mod given_a_request_for_the_root {
    use super::*;

    // Case: redirects %s / to the Meta Space with 302
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

mod given_an_address_the_application_does_not_own {
    use super::*;

    // Case: serves the shell for a product address that resolves
    #[tokio::test]
    async fn serves_the_shell_for_a_product_address_that_resolves() {
        let talk = open().await;
        shell(&talk.get(META_ADDRESS).await);
        shell(&talk.get(&format!("{META_ADDRESS}/notes")).await);
        talk.stop().await;
    }

    // Case: falls back to the shell for an address that is not the application’s
    #[tokio::test]
    async fn falls_back_to_the_shell_for_an_address_not_the_applications() {
        let talk = open().await;
        shell(&talk.get("/somewhere/else").await);
        talk.stop().await;
    }

    // Case: answers HEAD for the shell without its body
    #[tokio::test]
    async fn answers_head_for_the_shell_without_its_body() {
        let talk = open().await;
        let response = talk.send("HEAD", "/somewhere/else", &[], Vec::new()).await;
        assert_eq!(response.status(), 200, "HEAD should be answered");
        assert_eq!(
            header(&response, "content-type"),
            Some("text/html; charset=utf-8"),
            "the shell is HTML"
        );
        assert!(response.body().is_empty(), "no body");
        talk.stop().await;
    }

    // Case: answers 405 to a write to an address that is not the application’s
    #[tokio::test]
    async fn answers_405_to_a_write_to_an_address_not_the_applications() {
        let talk = open().await;
        let response = talk.send("POST", "/somewhere/else", &[], "x").await;
        assert_eq!(response.status(), 405, "a write should be refused");
        assert_eq!(
            header(&response, "allow"),
            Some("GET, HEAD"),
            "the refusal should name the methods allowed"
        );
        talk.stop().await;
    }

    // Case: answers 400 invalid-asset-hash, and no file, for %s
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

/// The wire cases the scheme handler hands to the host's application, held
/// through it as `crates/host/tests/wire.rs` holds them against the
/// application itself.
mod given_the_application_behind_the_scheme {
    use super::*;
    use serde_json::json;

    const UNKNOWN_SPACE: &str = "00000000-0000-4000-8000-00000000dead";
    const NEW_SPACE: &str = "00000000-0000-4000-8000-0000000c0f01";

    fn api_policy(response: &Response<Vec<u8>>) {
        assert_eq!(
            header(response, "cache-control"),
            Some("no-store"),
            "API answers are not stored"
        );
    }

    fn json_media(response: &Response<Vec<u8>>) {
        assert_eq!(
            header(response, "content-type"),
            Some("application/json; charset=utf-8"),
            "JSON names its charset"
        );
    }

    fn html_problem(response: &Response<Vec<u8>>, status: u16) {
        assert_eq!(response.status(), status, "HTML problem status");
        assert_eq!(
            header(response, "content-type"),
            Some("text/html; charset=utf-8"),
            "HTML problem media type"
        );
        assert!(
            response.body().starts_with(b"<!doctype html>"),
            "an HTML page"
        );
    }

    fn whole_body_invalid(response: &Response<Vec<u8>>) {
        assert_eq!(
            json_of(response)["errors"],
            json!([{ "code": "invalid-value", "pointer": "" }]),
            "the whole body is refused"
        );
    }

    fn revision(loaded: &Value) -> u64 {
        loaded["revision"].as_str().unwrap().parse().unwrap()
    }

    async fn post_asset(
        talk: &Talk,
        bytes: Vec<u8>,
        headers: &[(&str, &str)],
    ) -> Response<Vec<u8>> {
        talk.send("POST", "/assets", headers, bytes).await
    }

    fn path_of(bytes: &[u8]) -> String {
        format!("/assets/{}", AssetHash::of(bytes).as_str())
    }

    // Case: lists every Space of the directory with its title
    #[tokio::test]
    async fn lists_every_space_of_the_directory_with_its_title() {
        let talk = open().await;
        let response = talk.get("/api/spaces").await;
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
        talk.stop().await;
    }

    // Case: answers one Space with its snapshot and revision
    #[tokio::test]
    async fn answers_one_space_with_its_snapshot_and_revision() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        assert_eq!(loaded["snapshot"]["id"], META, "its snapshot");
        assert!(
            loaded["revision"].as_str().unwrap().parse::<u64>().is_ok(),
            "a revision: {loaded}"
        );
        talk.stop().await;
    }

    // Case: answers the aggregate with its Meta Space and every Space
    #[tokio::test]
    async fn answers_the_aggregate_with_its_meta_space_and_every_space() {
        let talk = open().await;
        let response = talk.get("/api/aggregate").await;
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
        talk.stop().await;
    }

    // Case: answers 404 not-found for a Space that does not exist
    #[tokio::test]
    async fn answers_404_for_a_space_that_does_not_exist() {
        let talk = open().await;
        let response = talk.get(&format!("/api/spaces/{UNKNOWN_SPACE}")).await;
        api_policy(&response);
        problem(&response, "not-found", 404);
        talk.stop().await;
    }

    // Case: answers 400 invalid-space-id for an id that is not a UUID, whatever the method
    #[tokio::test]
    async fn answers_400_invalid_space_id_whatever_the_method() {
        let talk = open().await;
        for method in ["GET", "PUT"] {
            let response = talk
                .send(method, "/api/spaces/not-a-uuid", &[], Vec::new())
                .await;
            problem(&response, "invalid-space-id", 400);
        }
        talk.stop().await;
    }

    // Case: answers 405 to %s %s, allowing %s
    #[tokio::test]
    async fn answers_405_naming_the_methods_a_path_allows() {
        let talk = open().await;
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
            let response = talk.send(method, path, &[], Vec::new()).await;
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
                problem(&response, "method-not-allowed", 405);
            }
        }
        talk.stop().await;
    }

    // Case: answers %s as the path it escapes
    #[tokio::test]
    async fn answers_an_escaped_unreserved_character_as_its_own_path() {
        let talk = open().await;
        let escaped_id = format!("/api/spaces/%30{}", &META[1..]);
        for path in ["/api/%73paces", escaped_id.as_str()] {
            let response = talk.get(path).await;
            assert_eq!(response.status(), 200, "{path}");
            json_media(&response);
            api_policy(&response);
        }
        talk.stop().await;
    }

    // Case: answers 404 not-found for %s, which is off the declared API
    #[tokio::test]
    async fn answers_404_for_a_path_off_the_declared_api() {
        let talk = open().await;
        let more = format!("/api/spaces/{META}/more");
        for path in ["/api", "/api/nowhere", "/api/spaces/", more.as_str()] {
            let response = talk.get(path).await;
            api_policy(&response);
            problem(&response, "not-found", 404);
        }
        talk.stop().await;
    }

    // Case: answers * committed with each Space's next revision
    #[tokio::test]
    async fn answers_200_committed_with_each_spaces_next_revision() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let response = talk
            .post_commit(rename_text(&loaded, "Committed"), "application/json")
            .await;
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
            talk.load(META).await["snapshot"]["document"]["title"],
            "Committed",
            "renamed"
        );
        talk.stop().await;
    }

    // Case: answers * conflict with the current Space for a stale revision
    #[tokio::test]
    async fn answers_409_with_the_current_space_for_a_stale_revision() {
        let talk = open().await;
        let stale = talk.load(META).await;
        let first = talk
            .post_commit(rename_text(&stale, "First"), "application/json")
            .await;
        assert_eq!(first.status(), 200, "the first commit");
        let response = talk
            .post_commit(rename_text(&stale, "Second"), "application/json")
            .await;
        assert_eq!(response.status(), 409, "a conflict");
        json_media(&response);
        let conflicts = json_of(&response)["conflicts"].clone();
        assert_eq!(conflicts.as_array().unwrap().len(), 1, "one conflict");
        assert_eq!(conflicts[0]["spaceId"], META, "the Meta Space");
        assert_eq!(
            conflicts[0]["current"]["snapshot"]["document"]["title"], "First",
            "its current title"
        );
        talk.stop().await;
    }

    // Case: answers * aggregate-refused for a Space no Space Resource references
    #[tokio::test]
    async fn answers_422_for_a_space_no_space_resource_references() {
        let talk = open().await;
        let commit = json!({
            "changes": [{
                "kind": "create",
                "spaceId": NEW_SPACE,
                "snapshot": { "id": NEW_SPACE, "document": { "version": 1, "title": "Unreferenced" }, "resources": [] },
            }],
        });
        let response = talk
            .post_commit(commit.to_string(), "application/json")
            .await;
        assert_eq!(response.status(), 422, "refused");
        json_media(&response);
        assert_eq!(
            json_of(&response),
            json!({ "errors": [{ "kind": "ordinary-space-unreferenced", "spaceId": NEW_SPACE }] }),
            "the unreferenced Space"
        );
        problem(
            &talk.get(&format!("/api/spaces/{NEW_SPACE}")).await,
            "not-found",
            404,
        );
        talk.stop().await;
    }

    /// The ids of a snapshot's first Map's positions, in the order its JSON
    /// text writes them.
    fn first_map_positions(snapshot: &intake::json::JsonValue) -> Vec<String> {
        let document = snapshot.as_object().unwrap().get("document").unwrap();
        let maps = document.as_object().unwrap().get("maps").unwrap();
        let intake::json::JsonValue::Array(maps) = maps else {
            panic!("maps: {maps}");
        };
        let positions = maps
            .first()
            .unwrap()
            .as_object()
            .unwrap()
            .get("positions")
            .unwrap();
        positions
            .as_object()
            .unwrap()
            .iter()
            .map(|(id, _)| id.to_owned())
            .collect()
    }

    fn text_of(response: &Response<Vec<u8>>) -> intake::json::JsonValue {
        intake::json::parse(std::str::from_utf8(response.body()).unwrap()).unwrap()
    }

    // Case: answers a Space with its positions in the order the commit wrote them
    #[tokio::test]
    async fn answers_positions_in_the_order_the_commit_wrote_them() {
        let talk = open().await;
        let text =
            String::from_utf8(talk.get(&format!("/api/spaces/{META}")).await.into_body()).unwrap();
        let loaded = intake::json::parse(&text).unwrap();
        let snapshot = loaded.as_object().unwrap().get("snapshot").unwrap();
        let order = first_map_positions(snapshot);
        assert!(
            order.len() > 1,
            "the fixture Meta Space's Map has positions"
        );
        // Each position's entry in the commit's text, written in reverse.
        let entry = |id: &str| -> String {
            let at = text.find(&format!("\"{id}\":")).unwrap();
            let end = at + text[at..].find('}').unwrap() + 1;
            text[at..end].to_owned()
        };
        let first = text.find(&format!("\"{}\":", order[0])).unwrap();
        let last = order.last().unwrap();
        let last_end = {
            let at = text.find(&format!("\"{last}\":")).unwrap();
            at + text[at..].find('}').unwrap() + 1
        };
        let reversed: Vec<String> = order.iter().rev().map(|id| entry(id)).collect();
        let edited = format!(
            "{}{}{}",
            &text[..first],
            reversed.join(","),
            &text[last_end..]
        );
        let edited = intake::json::parse(&edited).unwrap();
        let edited_object = edited.as_object().unwrap();
        let snapshot = edited_object.get("snapshot").unwrap();
        let written: Vec<String> = order.iter().rev().cloned().collect();
        assert_eq!(
            first_map_positions(snapshot),
            written,
            "the commit reverses them"
        );
        let revision = edited_object.get("revision").unwrap().as_str().unwrap();
        let body = format!(
            r#"{{"changes":[{{"kind":"update","spaceId":"{META}","snapshot":{snapshot},"expectedRevision":"{revision}"}}]}}"#
        );
        let committed = talk.post_commit(body, "application/json").await;
        assert_eq!(committed.status(), 200, "committed");
        let answered = text_of(&talk.get(&format!("/api/spaces/{META}")).await);
        assert_eq!(
            first_map_positions(answered.as_object().unwrap().get("snapshot").unwrap()),
            written,
            "the positions in the order the commit wrote them"
        );
        talk.stop().await;
    }

    // Case: answers 400 invalid-request for a commit the store will not judge
    #[tokio::test]
    async fn answers_400_for_a_commit_the_store_will_not_judge() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let change: Value = serde_json::from_str::<Value>(&rename_text(&loaded, "Twice")).unwrap()
            ["changes"][0]
            .clone();
        let text = json!({ "changes": [change.clone(), change] }).to_string();
        let response = talk.post_commit(text, "application/json").await;
        api_policy(&response);
        problem(&response, "invalid-request", 400);
        whole_body_invalid(&response);
        talk.stop().await;
    }

    // Case: answers 400 invalid-request for malformed JSON
    #[tokio::test]
    async fn answers_400_for_malformed_json() {
        let talk = open().await;
        let response = talk.post_commit("{", "application/json").await;
        problem(&response, "invalid-request", 400);
        assert!(json_of(&response).get("errors").is_none(), "no errors");
        talk.stop().await;
    }

    // Case: answers 400 invalid-request for a lone surrogate escape, as for malformed JSON
    #[tokio::test]
    async fn answers_400_for_a_lone_surrogate_as_for_malformed_json() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let text = rename_text(&loaded, "LONE").replace("\"LONE\"", r#""\ud800x""#);
        assert!(text.contains(r"\ud800x"), "the escape is sent: {text}");
        let response = talk.post_commit(text, "application/json").await;
        problem(&response, "invalid-request", 400);
        assert_eq!(
            json_of(&response)["detail"],
            "Malformed JSON in request body",
            "refused as malformed"
        );
        assert_eq!(
            revision(&talk.load(META).await),
            revision(&loaded),
            "nothing stored"
        );
        talk.stop().await;
    }

    // Case: answers 400 invalid-request for a body that is not a commit
    #[tokio::test]
    async fn answers_400_for_a_body_that_is_not_a_commit() {
        let talk = open().await;
        let response = talk
            .post_commit(r#"{"changes":"none"}"#, "application/json")
            .await;
        problem(&response, "invalid-request", 400);
        whole_body_invalid(&response);
        talk.stop().await;
    }

    // Case: accepts a media type with spaces around its parameter (RFC 9110)
    #[tokio::test]
    async fn accepts_a_media_type_with_spaces_around_its_parameter() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let response = talk
            .post_commit(
                rename_text(&loaded, "Spaced"),
                "application/json ; charset=UTF-8",
            )
            .await;
        assert_eq!(response.status(), 200, "RFC 9110 allows the spaces");
        talk.stop().await;
    }

    // Case: accepts a media type whose quoted parameter carries a Latin-1 byte
    #[tokio::test]
    async fn accepts_a_quoted_media_type_parameter_with_a_latin_1_byte() {
        let talk = open().await;
        let loaded = talk.load(META).await;
        let request = Request::builder()
            .method("POST")
            .uri(talk.url("/api/spaces"))
            .header("referer", talk.url(META_ADDRESS))
            .header(
                "content-type",
                HeaderValue::from_bytes(b"application/json; x=\"\xE9\"").unwrap(),
            )
            .body(rename_text(&loaded, "Latin-1").into_bytes())
            .unwrap();
        let response = talk.open_talks.answer(WINDOW, request).await;
        assert_eq!(response.status(), 200, "a quoted Latin-1 byte is allowed");
        talk.stop().await;
    }

    // Case: stores an asset at its hash, 201 the first time and 200 after
    #[tokio::test]
    async fn stores_an_asset_at_its_hash_201_the_first_time_and_200_after() {
        let talk = open().await;
        let bytes = fresh(64, "stores");
        let url = path_of(&bytes);
        let first = post_asset(&talk, bytes.clone(), &[("content-type", "image/png")]).await;
        assert_eq!(first.status(), 201, "stored");
        assert_eq!(
            header(&first, "location"),
            Some(url.as_str()),
            "its location"
        );
        json_media(&first);
        api_policy(&first);
        assert_eq!(json_of(&first), json!({ "url": url }), "its url");
        let again = post_asset(&talk, bytes, &[("content-type", "image/png")]).await;
        assert_eq!(again.status(), 200, "already stored");
        assert_eq!(json_of(&again), json!({ "url": url }), "the same url");
        talk.stop().await;
    }

    // Case: serves a stored picture as itself, immutable and sandboxed
    #[tokio::test]
    async fn serves_a_stored_picture_as_itself_immutable_and_sandboxed() {
        let talk = open().await;
        let bytes = fresh(32, "picture");
        post_asset(&talk, bytes.clone(), &[("content-type", "image/png")]).await;
        let response = talk.get(&path_of(&bytes)).await;
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
        assert!(response.body() == &bytes, "its bytes");
        talk.stop().await;
    }

    // Case: serves any other stored type as inert bytes, naming the type it was stored as
    #[tokio::test]
    async fn serves_any_other_stored_type_as_inert_bytes() {
        let talk = open().await;
        let bytes = fresh(16, "html");
        post_asset(&talk, bytes.clone(), &[("content-type", "text/html")]).await;
        let response = talk.get(&path_of(&bytes)).await;
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
        talk.stop().await;
    }

    // Case: answers HEAD for a stored asset without its bytes
    #[tokio::test]
    async fn answers_head_for_a_stored_asset_without_its_bytes() {
        let talk = open().await;
        let bytes = fresh(16, "head");
        post_asset(&talk, bytes.clone(), &[("content-type", "image/png")]).await;
        let response = talk.send("HEAD", &path_of(&bytes), &[], Vec::new()).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/png"),
            "its type"
        );
        assert!(response.body().is_empty(), "no bytes");
        talk.stop().await;
    }

    // Case: serves a stored asset at its hash with a character escaped
    #[tokio::test]
    async fn serves_a_stored_asset_at_its_hash_with_a_character_escaped() {
        let talk = open().await;
        let bytes = fresh(16, "escaped");
        post_asset(&talk, bytes.clone(), &[("content-type", "image/png")]).await;
        let path = path_of(&bytes);
        let hash = path.strip_prefix("/assets/").unwrap();
        let escaped = format!("/assets/%{:02X}{}", hash.as_bytes()[0], &hash[1..]);
        let response = talk.get(&escaped).await;
        assert_eq!(response.status(), 200, "{escaped}");
        assert!(response.body() == &bytes, "its bytes");
        talk.stop().await;
    }

    // Case: answers 404 not-found for a hash no asset is stored at
    #[tokio::test]
    async fn answers_404_for_a_hash_no_asset_is_stored_at() {
        let talk = open().await;
        problem(
            &talk.get(&format!("/assets/{}", "A".repeat(43))).await,
            "not-found",
            404,
        );
        talk.stop().await;
    }

    // Case: answers 415 unsupported-media-type for an encoded asset
    #[tokio::test]
    async fn answers_415_for_an_encoded_asset() {
        let talk = open().await;
        let response = post_asset(
            &talk,
            fresh(8, "encoded"),
            &[("content-type", "image/png"), ("content-encoding", "gzip")],
        )
        .await;
        problem(&response, "unsupported-media-type", 415);
        talk.stop().await;
    }

    // Case: answers 405 method-not-allowed to %s by %s, allowing GET and HEAD
    #[tokio::test]
    async fn answers_405_to_a_write_of_a_product_address() {
        let talk = open().await;
        let notes = format!("{META_ADDRESS}/notes");
        for (path, method) in [
            ("/", "POST"),
            (META_ADDRESS, "POST"),
            (notes.as_str(), "DELETE"),
        ] {
            let response = talk.send(method, path, &[], Vec::new()).await;
            assert_eq!(
                header(&response, "allow"),
                Some("GET, HEAD"),
                "{method} {path}: Allow"
            );
            problem(&response, "method-not-allowed", 405);
        }
        talk.stop().await;
    }

    // Case: answers 400 invalid-request to %s %s, which cannot be read
    #[tokio::test]
    async fn answers_400_to_an_address_that_cannot_be_read() {
        let talk = open().await;
        let nowhere = format!("{META_ADDRESS}/nowhere");
        for (method, path) in [
            ("GET", "/spaces"),
            ("GET", "/spaces/not-an-id"),
            ("GET", nowhere.as_str()),
            ("POST", "/spaces/not-an-id"),
        ] {
            problem(
                &talk.send(method, path, &[], Vec::new()).await,
                "invalid-request",
                400,
            );
        }
        talk.stop().await;
    }

    // Case: answers 404 not-found for an address naming no Space
    #[tokio::test]
    async fn answers_404_for_an_address_naming_no_space() {
        let talk = open().await;
        problem(
            &talk.get("/spaces/AAAAAAAAQACAAAAAAADerQ").await,
            "not-found",
            404,
        );
        talk.stop().await;
    }

    // Case: answers its refusals as HTML to a request that accepts it
    #[tokio::test]
    async fn answers_its_refusals_as_html_to_a_request_that_accepts_it() {
        let talk = open().await;
        let accept = [("accept", "text/html,application/xhtml+xml;q=0.9")];
        html_problem(&talk.send("GET", "/spaces", &accept, Vec::new()).await, 400);
        html_problem(
            &talk
                .send("GET", "/spaces/AAAAAAAAQACAAAAAAADerQ", &accept, Vec::new())
                .await,
            404,
        );
        let refused = talk.send("POST", "/", &accept, Vec::new()).await;
        assert_eq!(header(&refused, "allow"), Some("GET, HEAD"), "Allow");
        html_problem(&refused, 405);
        talk.stop().await;
    }

    // Case: serves the built file an escaped climb under /assets/ resolves to
    #[tokio::test]
    async fn serves_the_file_an_escaped_climb_under_assets_resolves_to() {
        let talk = open().await;
        let response = talk.get(&format!("/assets/..%2F{}", STAND_IN_ICON.0)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/svg+xml"),
            "svg"
        );
        assert_eq!(response.body(), STAND_IN_ICON.1.as_bytes(), "its text");
        talk.stop().await;
    }
}

mod given_a_change_a_browser_says_another_site_sent {
    use super::*;

    /// `CROSS_SITE_CHANGE_DETAIL` (`packages/http/src/index.ts`).
    const DETAIL: &str = "Send a change from the application's own page.";

    fn refused_by_the_application(response: &Response<Vec<u8>>) {
        problem(response, "forbidden", 403);
        let body = json_of(response);
        assert_eq!(body["title"], "Forbidden", "its title");
        assert_eq!(body["detail"], DETAIL, "the same detail as the Node host");
    }

    // Case: answers 403 forbidden to a change sent with Sec-Fetch-Site: %s, changing nothing
    #[tokio::test]
    async fn refuses_a_change_from_the_talks_own_page_naming_another_site() {
        let talk = open().await;
        let own = talk.address.origin();
        for site in ["cross-site", "same-site"] {
            let headers = [("origin", own.as_str()), ("sec-fetch-site", site)];
            let bytes = format!("cross-site {site}").into_bytes();
            let path = format!("/assets/{}", AssetHash::of(&bytes).as_str());
            let mut asset = headers.to_vec();
            asset.push(("content-type", "text/plain"));
            refused_by_the_application(&talk.send("POST", "/assets", &asset, bytes).await);
            problem(&talk.get(&path).await, "not-found", 404);
            let loaded = talk.load(META).await;
            let mut commit = headers.to_vec();
            commit.push(("content-type", "application/json"));
            let text = rename_text(&loaded, "Cross-site");
            refused_by_the_application(&talk.send("POST", "/api/spaces", &commit, text).await);
            assert_eq!(
                talk.load(META).await["revision"],
                loaded["revision"],
                "{site}: nothing committed"
            );
        }
        talk.stop().await;
    }

    // Case: stores an asset sent with Sec-Fetch-Site: %s from its own origin
    #[tokio::test]
    async fn stores_an_asset_the_talks_own_page_sends() {
        let talk = open().await;
        let own = talk.address.origin();
        for site in ["same-origin", "none"] {
            let response = talk
                .send(
                    "POST",
                    "/assets",
                    &[
                        ("content-type", "text/plain"),
                        ("origin", own.as_str()),
                        ("sec-fetch-site", site),
                    ],
                    format!("own page {site}"),
                )
                .await;
            assert_eq!(response.status(), 201, "{site}: stored");
        }
        talk.stop().await;
    }

    // Case: answers a read whatever site a browser says sent it
    #[tokio::test]
    async fn answers_a_read_whatever_site_a_browser_says_sent_it() {
        let talk = open().await;
        let headers = [
            ("origin", "http://attacker.example"),
            ("sec-fetch-site", "cross-site"),
        ];
        let listed = talk.send("GET", "/api/spaces", &headers, Vec::new()).await;
        assert_eq!(listed.status(), 200, "the Spaces are listed");
        let bytes = b"read from anywhere".to_vec();
        let path = format!("/assets/{}", AssetHash::of(&bytes).as_str());
        let stored = talk
            .send("POST", "/assets", &[("content-type", "image/png")], bytes)
            .await;
        assert_eq!(stored.status(), 201, "stored from the page");
        let read = talk.send("GET", &path, &headers, Vec::new()).await;
        assert_eq!(read.status(), 200, "the asset is served");
        talk.stop().await;
    }
}
