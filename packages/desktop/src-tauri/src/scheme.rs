//! The scheme handler: every request a talk window makes, answered by the
//! run of the talk its address names, with no port, `Host` check or launch
//! secret (ADR 0155, spec decision 4).
//!
//! It is the shell's trust boundary, and it admits a request only when
//!
//! - its address names a talk that is open ([`TalkAddress::key_of`]);
//! - the window that made it is one of that talk's own windows, so neither
//!   the home window nor another talk's window reaches it;
//! - it is a read (`GET` or `HEAD`), or it comes from the talk's own page:
//!   its `Origin` is the talk's, or, naming none, its `Referer` is a page of
//!   the talk, so a page from anywhere else cannot change the talk.
//!
//! Everything past that is the host's application, unchanged: the Space API,
//! assets with their body limits, product addresses and the built
//! application with its Content Security Policy (Storage ST-115, ST-119).
//! [`OpenTalks::answer`] is a plain `Request -> Response` function, so it is
//! tested without a window.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, PoisonError, RwLock};

use bytes::Bytes;
use http::header::{CACHE_CONTROL, CONTENT_TYPE, HeaderName, ORIGIN, REFERER};
use http::{HeaderValue, Method, Request, Response, StatusCode};
use http_body_util::Full;
use tokio::sync::Notify;
use url::Url;

use crate::address::{SchemeStyle, TalkAddress, TalkKey};
use crate::built::BuiltDirectory;

/// The application a talk's run answers with.
pub type TalkApplication = host::RunApplication<host::RandomIds, BuiltDirectory>;

/// The prefix of the label of every window a talk's page opens.
pub const VIEW_WINDOW_PREFIX: &str = "view-";

/// Every open talk, by the key its address carries.
#[derive(Debug)]
pub struct OpenTalks {
    style: SchemeStyle,
    talks: RwLock<HashMap<TalkKey, ServedTalk>>,
    /// How many windows talks' pages have opened, so no two share a label
    /// however often a talk is closed and opened again.
    views: AtomicU64,
}

#[derive(Debug)]
struct ServedTalk {
    address: TalkAddress,
    application: Arc<TalkApplication>,
    windows: HashSet<String>,
    in_flight: Arc<InFlight>,
}

/// How many of a talk's changes (requests other than `GET` and `HEAD`) are
/// being answered.
#[derive(Debug, Default)]
pub struct InFlight {
    count: AtomicUsize,
    settled: Notify,
}

/// One change being answered, until it is dropped.
struct Answering(Arc<InFlight>);

impl Answering {
    fn begin(in_flight: &Arc<InFlight>) -> Self {
        let _before = in_flight.count.fetch_add(1, Ordering::SeqCst);
        Self(Arc::clone(in_flight))
    }
}

impl Drop for Answering {
    fn drop(&mut self) {
        if self.0.count.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.0.settled.notify_waiters();
        }
    }
}

impl InFlight {
    /// Wait until no change is being answered. A change waits on nothing
    /// outside the process: the webview hands the handler its whole body,
    /// and the run's store is in memory.
    pub async fn settled(&self) {
        loop {
            let notified = self.settled.notified();
            if self.count.load(Ordering::SeqCst) == 0 {
                return;
            }
            notified.await;
        }
    }
}

/// A talk the scheme handler no longer serves.
#[derive(Debug)]
pub struct Closed {
    /// The windows that could reach it.
    pub windows: Vec<String>,
    /// The changes still being answered when it closed.
    pub in_flight: Arc<InFlight>,
}

/// A refusal of the scheme handler's own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Refused {
    status: StatusCode,
    message: &'static str,
}

impl Refused {
    /// The refusal as the handler answers it: plain text that is never cached.
    #[must_use]
    pub fn response(self) -> Response<Vec<u8>> {
        let mut response = Response::new(self.message.as_bytes().to_vec());
        *response.status_mut() = self.status;
        let headers = response.headers_mut();
        let _type = headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("text/plain; charset=utf-8"),
        );
        let _cache = headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
        response
    }
}

fn refuse(status: StatusCode, message: &'static str) -> Refused {
    Refused { status, message }
}

/// The one value a request names for `name`: `Ok(None)` for none, and
/// `Err(())` for more than one, or one that is not text.
fn only<'a, B>(request: &'a Request<B>, name: &HeaderName) -> Result<Option<&'a str>, ()> {
    let mut values = request.headers().get_all(name).iter();
    match (values.next(), values.next()) {
        (None, _) => Ok(None),
        (Some(value), None) => value.to_str().map(Some).map_err(|_| ()),
        (Some(_), Some(_)) => Err(()),
    }
}

/// Which header showed that a change comes from the talk's own page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdmittedBy {
    Origin,
    Referer,
}

/// Which header shows that a change comes from the talk's own page, or
/// `None` when it does not: its one `Origin` is the talk's, or, naming no
/// `Origin`, its one `Referer` is a page of the talk. WebKitGTK 2.52 names
/// no `Origin` on a page's request to its own origin under a custom scheme,
/// and names the page as the `Referer`; a request naming neither is refused.
fn comes_from<B>(request: &Request<B>, address: &TalkAddress) -> Option<AdmittedBy> {
    match only(request, &ORIGIN) {
        Ok(Some(origin)) => (origin == address.origin()).then_some(AdmittedBy::Origin),
        Ok(None) => matches!(
            only(request, &REFERER),
            Ok(Some(referer)) if Url::parse(referer).is_ok_and(|page| address.admits(&page))
        )
        .then_some(AdmittedBy::Referer),
        Err(()) => None,
    }
}

/// Whether `INFINITY_CUBE_LOG_ADMISSIONS` is set, asking that each change
/// the handler admits be named on standard error with the header that
/// admitted it, `Origin` or `Referer`.
fn log_admissions() -> bool {
    static LOG: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *LOG.get_or_init(|| std::env::var_os("INFINITY_CUBE_LOG_ADMISSIONS").is_some())
}

impl OpenTalks {
    /// No talk open yet, addressed as `style` addresses one.
    #[must_use]
    pub fn new(style: SchemeStyle) -> Self {
        Self {
            style,
            talks: RwLock::new(HashMap::new()),
            views: AtomicU64::new(0),
        }
    }

    fn talks(&self) -> std::sync::RwLockReadGuard<'_, HashMap<TalkKey, ServedTalk>> {
        self.talks.read().unwrap_or_else(PoisonError::into_inner)
    }

    fn talks_mut(&self) -> std::sync::RwLockWriteGuard<'_, HashMap<TalkKey, ServedTalk>> {
        self.talks.write().unwrap_or_else(PoisonError::into_inner)
    }

    /// Serve the talk at `address` with `application`, to the window `window`.
    pub fn open(&self, address: TalkAddress, application: Arc<TalkApplication>, window: &str) {
        let key = address.key().clone();
        let _replaced = self.talks_mut().insert(
            key,
            ServedTalk {
                address,
                application,
                windows: HashSet::from([window.to_owned()]),
                in_flight: Arc::default(),
            },
        );
    }

    /// The label of a new window of the talk with `key`, as its page opens
    /// one, which may reach the talk from now on; `None` when that talk is
    /// not open. No label is answered twice.
    pub fn open_view(&self, key: &TalkKey) -> Option<String> {
        let mut talks = self.talks_mut();
        let served = talks.get_mut(key)?;
        let label = format!(
            "{VIEW_WINDOW_PREFIX}{}-{}",
            key.as_str(),
            self.views.fetch_add(1, Ordering::Relaxed)
        );
        let _new = served.windows.insert(label.clone());
        Some(label)
    }

    /// Whether the window `window` may reach the talk with `key`: false once
    /// that talk has begun closing.
    pub fn holds_window(&self, key: &TalkKey, window: &str) -> bool {
        self.talks()
            .get(key)
            .is_some_and(|served| served.windows.contains(window))
    }

    /// Stop serving the talk with `key`: a request made from now on is
    /// refused, and the answer says which windows could reach it and which
    /// changes are still being answered.
    pub fn close(&self, key: &TalkKey) -> Option<Closed> {
        self.talks_mut().remove(key).map(|served| Closed {
            windows: served.windows.into_iter().collect(),
            in_flight: served.in_flight,
        })
    }

    /// Answer one request the window labelled `window` made. With
    /// `INFINITY_CUBE_LOG_ADMISSIONS` set, each change admitted is named on
    /// standard error with the header that admitted it.
    #[expect(
        clippy::print_stderr,
        reason = "the admissions log is written to standard error"
    )]
    pub async fn answer(&self, window: &str, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        match self.admit(window, request) {
            Ok(admitted) => {
                if let Some(by) = admitted.by()
                    && log_admissions()
                {
                    eprintln!("Admitted {} by its {by:?} header.", admitted.named());
                }
                admitted.answer().await
            }
            Err(refused) => refused.response(),
        }
    }

    /// Decide whether to answer one request the window labelled `window`
    /// made, answering the request to hand the talk's application, or the
    /// refusal.
    ///
    /// # Errors
    ///
    /// The scheme handler's own refusal.
    pub fn admit(&self, window: &str, request: Request<Vec<u8>>) -> Result<Admitted, Refused> {
        let Some(key) = TalkAddress::key_of(request.uri(), self.style) else {
            return Err(refuse(StatusCode::NOT_FOUND, "This address names no talk."));
        };
        let read = request.method() == Method::GET || request.method() == Method::HEAD;
        // Counted under the lock `close` takes, so a close either sees the
        // change counted or the change sees the talk closed.
        let found = self.talks().get(&key).map(|served| {
            (
                served.windows.contains(window),
                (!read).then(|| comes_from(&request, &served.address)),
                Arc::clone(&served.application),
                (!read).then(|| Answering::begin(&served.in_flight)),
            )
        });
        let Some((own_window, by, application, answering)) = found else {
            return Err(refuse(StatusCode::NOT_FOUND, "This talk is not open."));
        };
        if !own_window {
            return Err(refuse(
                StatusCode::FORBIDDEN,
                "Only the talk's own windows may reach it.",
            ));
        }
        let by = match by {
            None => None,
            Some(Some(by)) => Some(by),
            Some(None) => {
                return Err(refuse(
                    StatusCode::FORBIDDEN,
                    "A change to a talk must come from the talk's own page.",
                ));
            }
        };
        Ok(Admitted {
            application,
            request,
            by,
            _answering: answering,
        })
    }
}

/// A request the scheme handler admitted; a change is counted as being
/// answered until it has been.
pub struct Admitted {
    application: Arc<TalkApplication>,
    request: Request<Vec<u8>>,
    by: Option<AdmittedBy>,
    _answering: Option<Answering>,
}

impl std::fmt::Debug for Admitted {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Admitted")
            .field("request", &self.request)
            .field("by", &self.by)
            .finish_non_exhaustive()
    }
}

impl Admitted {
    /// Which header admitted a change, or `None` for a read.
    #[must_use]
    pub fn by(&self) -> Option<AdmittedBy> {
        self.by
    }

    /// The method and path of the request, as a log line names it.
    #[must_use]
    pub fn named(&self) -> String {
        format!("{} {}", self.request.method(), self.request.uri().path())
    }

    /// The talk's application's answer.
    pub async fn answer(self) -> Response<Vec<u8>> {
        // The webview hands over the whole body; the application still
        // counts it against its limits.
        let request = self.request.map(|body| Full::new(Bytes::from(body)));
        self.application.handle(request).await.map(Vec::from)
    }
}

#[cfg(test)]
mod tests;
