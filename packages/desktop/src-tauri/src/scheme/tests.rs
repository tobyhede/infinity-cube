//! The scheme handler as a `Request -> Response` function, on a run of a
//! fresh copy of the tracked fixture: its own admission (the talk's address,
//! its windows, a change from its own page, a closed talk), and, through it,
//! the HTTP conformance cases `crates/http-conformance` writes once for both
//! Rust adapters, generated here by its `cases!` in the module
//! `conformance`. `test/unit/http-conformance-rust-ports.test.ts` holds those
//! cases to the TypeScript case lists, each case this adapter does not run
//! exempted there with why.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::Path;

use host::{Run, RunStopped};
use serde_json::Value;
use tempfile::TempDir;

use super::*;
use crate::address::TalkKey;
use crate::server::{built_shell, open_run};
use crate::test_support::{META, META_ADDRESS, fixture_copy, rename_text, stand_in_build};
use bytes::Bytes;
use http_conformance::STAND_IN_SCRIPT;
use http_conformance::support::assertions::shell;
use http_conformance::support::{fresh, header, json_of};

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
    ) -> Response<Bytes> {
        let mut request = Request::builder()
            .method(method)
            .uri(self.url(path))
            .header("referer", self.url(META_ADDRESS));
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        self.answer(WINDOW, request.body(body.into()).unwrap())
            .await
    }

    /// The scheme's answer to `request` from `window`, as `Bytes` as the
    /// shared helpers take it.
    async fn answer(&self, window: &str, request: Request<Vec<u8>>) -> Response<Bytes> {
        self.open_talks
            .answer(window, request)
            .await
            .map(Bytes::from)
    }

    async fn get(&self, path: &str) -> Response<Bytes> {
        self.send("GET", path, &[], Vec::new()).await
    }

    async fn load(&self, id: &str) -> Value {
        let response = self.get(&format!("/api/spaces/{id}")).await;
        assert_eq!(response.status(), 200, "{id} loads");
        json_of(&response)
    }

    async fn post_commit(&self, body: impl Into<Vec<u8>>, content_type: &str) -> Response<Bytes> {
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

fn refused_by_the_scheme(response: &Response<Bytes>, status: u16) {
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
            refused_by_the_scheme(&talk.answer(WINDOW, request).await, 404);
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
            refused_by_the_scheme(&talk.answer(window, request).await, 403);
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
        shell(&talk.answer(&view, request).await);
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
                talk.answer(
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

/// The scheme handler as the shared conformance cases reach it: a request
/// from the talk's own window and page.
impl http_conformance::Adapter for Talk {
    async fn open() -> Self {
        open().await
    }

    /// As WebKitGTK sends a page's request to its own origin under a custom
    /// scheme: at the talk's origin, naming the page as its `Referer`.
    async fn send(&self, request: Request<Bytes>) -> Response<Bytes> {
        let (mut parts, body) = request.into_parts();
        parts.uri = self.url(&parts.uri.to_string()).parse().unwrap();
        let _added = parts.headers.append(
            REFERER,
            HeaderValue::from_str(&self.url(META_ADDRESS)).unwrap(),
        );
        self.open_talks
            .answer(WINDOW, Request::from_parts(parts, body.to_vec()))
            .await
            .map(Bytes::from)
    }

    fn own_origin(&self) -> String {
        self.address.origin()
    }

    fn own_address(&self) -> Vec<(&'static str, String)> {
        Vec::new()
    }

    async fn close(self) {
        self.stop().await;
    }
}

http_conformance::cases!(Talk);
