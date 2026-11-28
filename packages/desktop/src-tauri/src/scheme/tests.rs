//! The scheme handler as a `Request -> Response` function, on a run of a
//! fresh copy of the tracked fixture: its own admission (the Aggregate's address,
//! its windows, a change from its own page, a closed Aggregate), and, through it,
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
use crate::address::AggregateKey;
use crate::server::{built_shell, open_run};
use crate::test_support::{META, META_ADDRESS, fixture_copy, rename_text, stand_in_build};
use bytes::Bytes;
use http_conformance::STAND_IN_SCRIPT;
use http_conformance::support::assertions::shell;
use http_conformance::support::{fresh, header, json_of};

const WINDOW: &str = "space-0";
/// One Aggregate open in the window [`WINDOW`], served through the scheme.
struct Fixture {
    open_aggregates: OpenAggregates,
    address: AggregateAddress,
    run: Run<host::RandomIds, host::BuiltApplicationDirectory>,
    _temporary: TempDir,
}

async fn open() -> Fixture {
    let (temporary, directory) = fixture_copy();
    let shell = built_shell(&stand_in_build(&temporary)).unwrap();
    let run = open_run(&directory, shell, |_| {}).await.unwrap();
    let address =
        AggregateAddress::new(AggregateKey::of(&directory), SchemeStyle::HostPerAggregate);
    let open_aggregates = OpenAggregates::new(SchemeStyle::HostPerAggregate);
    open_aggregates.open(address.clone(), Arc::clone(run.application()), WINDOW);
    Fixture {
        open_aggregates,
        address,
        run,
        _temporary: temporary,
    }
}

impl Fixture {
    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.address.origin())
    }

    /// A request from the Aggregate's own window and page, as WebKitGTK sends a
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
        self.open_aggregates
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
    async fn answers_a_read_from_the_aggregates_own_window() {
        let fixture = open().await;
        let response = fixture.get("/api/spaces").await;
        assert_eq!(
            response.status(),
            200,
            "the Aggregate's window reads its Aggregate"
        );
        fixture.stop().await;
    }

    #[tokio::test]
    async fn refuses_an_address_naming_no_open_aggregate() {
        let fixture = open().await;
        let elsewhere = AggregateAddress::new(
            AggregateKey::of(Path::new("/spaces/not-open")),
            SchemeStyle::HostPerAggregate,
        );
        for uri in [
            format!("{}/api/spaces", elsewhere.origin()),
            "infinitycube://localhost/api/spaces".to_owned(),
            "/api/spaces".to_owned(),
        ] {
            let request = Request::get(uri.as_str()).body(Vec::new()).unwrap();
            refused_by_the_scheme(&fixture.answer(WINDOW, request).await, 404);
        }
        fixture.stop().await;
    }

    #[tokio::test]
    async fn refuses_a_window_that_is_not_the_aggregates() {
        let fixture = open().await;
        for window in ["closing-0", "space-1", ""] {
            let request = Request::get(fixture.url("/api/spaces"))
                .body(Vec::new())
                .unwrap();
            refused_by_the_scheme(&fixture.answer(window, request).await, 403);
        }
        fixture.stop().await;
    }

    #[tokio::test]
    async fn admits_a_window_the_aggregates_page_opened() {
        let fixture = open().await;
        let view = fixture
            .open_aggregates
            .open_view(fixture.address.key())
            .expect("the Aggregate is open");
        let request = Request::get(fixture.url(META_ADDRESS))
            .body(Vec::new())
            .unwrap();
        shell(&fixture.answer(&view, request).await);
        fixture.stop().await;
    }

    #[tokio::test]
    async fn stops_admitting_a_window_the_aggregates_page_opened_once_it_is_gone() {
        let fixture = open().await;
        let key = fixture.address.key();
        let view = fixture
            .open_aggregates
            .open_view(key)
            .expect("the Aggregate is open");
        fixture.open_aggregates.forget_view(&view);
        assert!(
            !fixture.open_aggregates.holds_window(key, &view),
            "a window that is gone"
        );
        assert!(
            fixture.open_aggregates.holds_window(key, WINDOW),
            "the Aggregate's own window is still held"
        );
        fixture.stop().await;
    }

    #[tokio::test]
    async fn names_no_window_twice_when_an_aggregate_is_opened_again() {
        let fixture = open().await;
        let key = fixture.address.key();
        let first = fixture
            .open_aggregates
            .open_view(key)
            .expect("the Aggregate is open");
        let _closed = fixture.open_aggregates.close(key);
        assert!(
            !fixture.open_aggregates.holds_window(key, &first),
            "a closing Aggregate holds no window"
        );
        assert_eq!(
            fixture.open_aggregates.open_view(key),
            None,
            "a closed Aggregate opens no window"
        );
        fixture.open_aggregates.open(
            fixture.address.clone(),
            Arc::clone(fixture.run.application()),
            WINDOW,
        );
        let again = fixture
            .open_aggregates
            .open_view(key)
            .expect("the Aggregate is open again");
        assert_ne!(again, first, "a label Tauri may still hold is not reused");
        assert!(fixture.open_aggregates.holds_window(key, &again), "{again}");
        fixture.stop().await;
    }

    /// A rename of the Meta Space naming `origins` and `referers`.
    fn change(
        fixture: &Fixture,
        loaded: &Value,
        origins: &[&str],
        referers: &[&str],
    ) -> Request<Vec<u8>> {
        let mut request =
            Request::post(fixture.url("/api/spaces")).header("content-type", "application/json");
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
    async fn admits_a_change_naming_the_aggregates_own_origin_or_page() {
        let fixture = open().await;
        let own = fixture.address.origin();
        let page = fixture.url(META_ADDRESS);
        for (origins, referers) in [
            (&[own.as_str()][..], &[][..]),
            (&[own.as_str()], &[page.as_str()]),
            (&[], &[page.as_str()]),
        ] {
            let loaded = fixture.load(META).await;
            let response = fixture
                .answer(WINDOW, change(&fixture, &loaded, origins, referers))
                .await;
            assert_eq!(
                response.status(),
                200,
                "Origin {origins:?}, Referer {referers:?} is the Aggregate's own"
            );
        }
        fixture.stop().await;
    }

    #[tokio::test]
    async fn says_which_header_admitted_a_change_and_none_for_a_read() {
        let fixture = open().await;
        let loaded = fixture.load(META).await;
        let own = fixture.address.origin();
        let page = fixture.url(META_ADDRESS);
        for (origins, referers, expected) in [
            (&[own.as_str()][..], &[][..], AdmittedBy::Origin),
            (&[own.as_str()], &[page.as_str()], AdmittedBy::Origin),
            (&[], &[page.as_str()], AdmittedBy::Referer),
        ] {
            let admitted = fixture
                .open_aggregates
                .admit(WINDOW, change(&fixture, &loaded, origins, referers))
                .unwrap();
            assert_eq!(
                admitted.by(),
                Some(expected),
                "Origin {origins:?}, Referer {referers:?}"
            );
            assert_eq!(admitted.named(), "POST /api/spaces", "the request named");
        }
        let read = fixture
            .open_aggregates
            .admit(
                WINDOW,
                Request::get(fixture.url("/api/spaces"))
                    .body(Vec::new())
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(read.by(), None, "a read is admitted by no header");
        drop(read);
        fixture.stop().await;
    }

    #[tokio::test]
    async fn refuses_a_change_from_anywhere_but_the_aggregates_own_page() {
        let fixture = open().await;
        let loaded = fixture.load(META).await;
        let own = fixture.address.origin();
        let page = fixture.url(META_ADDRESS);
        let other = AggregateAddress::new(
            AggregateKey::of(Path::new("/spaces/other")),
            SchemeStyle::HostPerAggregate,
        );
        let other_origin = other.origin();
        let other_page = format!("{other_origin}/spaces/x");
        // The Aggregate's origin followed by more host, as a prefix test would admit.
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
                &fixture
                    .answer(WINDOW, change(&fixture, &loaded, origins, referers))
                    .await,
                403,
            );
        }
        assert_eq!(
            fixture.load(META).await["revision"],
            loaded["revision"],
            "nothing committed"
        );
        fixture.stop().await;
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
        let fixture = open().await;
        let loaded = fixture.load(META).await;
        let responses = [
            ("the root", fixture.get("/").await),
            ("the page", fixture.get(META_ADDRESS).await),
            (
                "a built file",
                fixture.get(&format!("/{}", STAND_IN_SCRIPT.0)).await,
            ),
            ("an API read", fixture.get("/api/spaces").await),
            (
                "a commit",
                fixture
                    .post_commit(rename_text(&loaded, "Referred"), "application/json")
                    .await,
            ),
            (
                "a refused commit",
                fixture.post_commit("{", "application/json").await,
            ),
            (
                "an asset stored",
                fixture
                    .send(
                        "POST",
                        "/assets",
                        &[("content-type", "application/octet-stream")],
                        fresh(16, "referred"),
                    )
                    .await,
            ),
            (
                "the scheme's own refusal",
                fixture
                    .answer(
                        "space-other",
                        Request::get(fixture.url("/")).body(Vec::new()).unwrap(),
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
        // The page every Space window loads is the built application's,
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
        fixture.stop().await;
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
    async fn stops_serving_an_aggregate_once_it_is_closed() {
        let fixture = open().await;
        let closed = fixture.open_aggregates.close(fixture.address.key());
        assert_eq!(
            closed.map(|closed| closed.windows),
            Some(vec![WINDOW.to_owned()]),
            "the windows that reached it"
        );
        refused_by_the_scheme(&fixture.get("/api/spaces").await, 404);
        fixture.stop().await;
    }

    #[tokio::test(start_paused = true)]
    async fn a_close_waits_for_a_change_being_answered_and_not_for_a_read() {
        let fixture = open().await;
        let request = |method: &str| {
            Request::builder()
                .method(method)
                .uri(fixture.url("/api/spaces"))
                .header("referer", fixture.url(META_ADDRESS))
                .body(Vec::new())
                .unwrap()
        };
        let read = fixture
            .open_aggregates
            .admit(WINDOW, request("GET"))
            .unwrap();
        let change = fixture
            .open_aggregates
            .admit(WINDOW, request("POST"))
            .unwrap();
        let closed = fixture
            .open_aggregates
            .close(fixture.address.key())
            .unwrap();
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
        fixture.stop().await;
    }
}

/// The scheme handler as the shared conformance cases reach it: a request
/// from the Aggregate's own window and page.
impl http_conformance::Adapter for Fixture {
    async fn open() -> Self {
        open().await
    }

    /// As WebKitGTK sends a page's request to its own origin under a custom
    /// scheme: at the Aggregate's origin, naming the page as its `Referer`.
    async fn send(&self, request: Request<Bytes>) -> Response<Bytes> {
        let (mut parts, body) = request.into_parts();
        parts.uri = self.url(&parts.uri.to_string()).parse().unwrap();
        let _added = parts.headers.append(
            REFERER,
            HeaderValue::from_str(&self.url(META_ADDRESS)).unwrap(),
        );
        self.open_aggregates
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

http_conformance::cases!(Fixture);

mod given_a_window_an_aggregates_page_opened {
    use super::*;

    #[tokio::test]
    async fn its_label_names_that_aggregate_even_once_it_is_closing() {
        let fixture = open().await;
        let key = fixture.address.key();
        let view = fixture
            .open_aggregates
            .open_view(key)
            .expect("the Aggregate is open");
        let _closed = fixture.open_aggregates.close(key);
        assert!(
            is_view_of(&view, key),
            "Close without saving destroys the windows of an Aggregate the scheme has forgotten"
        );
        assert!(
            !is_view_of(&view, &AggregateKey::of(Path::new("/spaces/other"))),
            "another Aggregate's windows stay"
        );
        assert!(
            !is_view_of(WINDOW, key),
            "the Aggregate's own window is not one its page opened"
        );
        fixture.stop().await;
    }
}
