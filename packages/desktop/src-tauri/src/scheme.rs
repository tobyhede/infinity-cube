//! The scheme handler: every request a Space window makes, answered by the
//! application serving the Aggregate its address names (the run of a folder,
//! or the host's application over a SQLite file or a PostgreSQL database,
//! ADR 0181), with no port, `Host` check or launch secret (ADR 0155, spec
//! decision 4).
//!
//! It is the shell's trust boundary, and it admits a request only when
//!
//! - its address names an Aggregate that is open ([`AggregateAddress::key_of`]);
//! - the window that made it is one of that Aggregate's own windows, so neither
//!   a close's question window nor another Aggregate's window reaches it;
//! - it is a read (`GET` or `HEAD`), or it comes from the Aggregate's own page:
//!   its `Origin` is the Aggregate's, or, naming none, its `Referer` is a page of
//!   the Aggregate, so a page from anywhere else cannot change the Aggregate.
//!
//! Everything past that is the host's application, unchanged: the Space API,
//! assets with their body limits, product addresses and the built
//! application with its Content Security Policy (Storage ST-115, ST-119).
//! [`OpenAggregates::answer`] is a plain `Request -> Response` function, so it is
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

use crate::address::{AggregateAddress, AggregateKey, SchemeStyle};

/// The application a folder's run answers with.
pub type FolderApplication = host::RunApplication<host::RandomIds, host::BuiltApplicationDirectory>;

/// The application over a database's repository `R`, as `serve` composes it.
pub type DatabaseApplication<R> =
    host::Application<R, host::RandomIds, host::BuiltApplicationDirectory>;

/// The application an Aggregate is answered by: a folder's run, or the
/// host's application over the SQLite or the PostgreSQL repository.
#[derive(Debug)]
pub enum AggregateApplication {
    /// A folder's run, over its Import into memory.
    Folder(Arc<FolderApplication>),
    /// A SQLite file.
    Sqlite(DatabaseApplication<host::SqliteSpaceRepository>),
    /// A PostgreSQL database.
    Postgres(DatabaseApplication<host::PostgresSpaceRepository>),
}

impl AggregateApplication {
    /// The application's answer to `request`.
    pub async fn handle(&self, request: Request<Full<Bytes>>) -> Response<Bytes> {
        match self {
            Self::Folder(application) => application.handle(request).await,
            Self::Sqlite(application) => application.handle(request).await,
            Self::Postgres(application) => application.handle(request).await,
        }
    }
}

impl From<Arc<FolderApplication>> for AggregateApplication {
    fn from(application: Arc<FolderApplication>) -> Self {
        Self::Folder(application)
    }
}

/// The prefix of the label of every window an Aggregate's page opens.
pub const VIEW_WINDOW_PREFIX: &str = "view-";

/// Whether `label` names a window the page of the Aggregate with `key`
/// opened, as [`OpenAggregates::open_view`] names one. Read from the label
/// alone, so it holds once the Aggregate has begun closing and is forgotten
/// here.
pub fn is_view_of(label: &str, key: &AggregateKey) -> bool {
    label.starts_with(&views_prefix(key))
}

fn views_prefix(key: &AggregateKey) -> String {
    format!("{VIEW_WINDOW_PREFIX}{}-", key.as_str())
}

/// Every open Aggregate, by the key its address carries.
#[derive(Debug)]
pub struct OpenAggregates {
    style: SchemeStyle,
    aggregates: RwLock<HashMap<AggregateKey, ServedAggregate>>,
    /// How many windows Aggregates' pages have opened, so no two share a label
    /// however often an Aggregate is closed and opened again.
    views: AtomicU64,
}

#[derive(Debug)]
struct ServedAggregate {
    address: AggregateAddress,
    application: Arc<AggregateApplication>,
    windows: HashSet<String>,
    in_flight: Arc<InFlight>,
}

/// How many of an Aggregate's changes (requests other than `GET` and `HEAD`) are
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
    /// Wait until no change is being answered. A folder's change waits on
    /// nothing outside the process: the webview hands the handler its whole
    /// body, and the run's store is in memory. A database's change may wait
    /// on its server, or on a lock another host holds, without bound (ADR
    /// 0177), so a close's wait for it is one ADR 0163's ten-second question
    /// asks the presenter about (ADR 0181).
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

/// An Aggregate the scheme handler no longer serves.
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

/// Which header showed that a change comes from the Aggregate's own page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdmittedBy {
    Origin,
    Referer,
}

/// Which header shows that a change comes from the Aggregate's own page, or
/// `None` when it does not: its one `Origin` is the Aggregate's, or, naming no
/// `Origin`, its one `Referer` is a page of the Aggregate; a request naming
/// neither is refused. A page's request to its own origin under a custom
/// scheme may name no `Origin` (what WebKitGTK sent is recorded in
/// `.scratch/rust-host/issues/13-swap-the-sidecar-for-the-rust-host.md`).
fn comes_from<B>(request: &Request<B>, address: &AggregateAddress) -> Option<AdmittedBy> {
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

impl OpenAggregates {
    /// No Aggregate open yet, addressed as `style` addresses one.
    #[must_use]
    pub fn new(style: SchemeStyle) -> Self {
        Self {
            style,
            aggregates: RwLock::new(HashMap::new()),
            views: AtomicU64::new(0),
        }
    }

    fn aggregates(&self) -> std::sync::RwLockReadGuard<'_, HashMap<AggregateKey, ServedAggregate>> {
        self.aggregates
            .read()
            .unwrap_or_else(PoisonError::into_inner)
    }

    fn aggregates_mut(
        &self,
    ) -> std::sync::RwLockWriteGuard<'_, HashMap<AggregateKey, ServedAggregate>> {
        self.aggregates
            .write()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Serve the Aggregate at `address` with `application`, to the window `window`.
    pub fn open(
        &self,
        address: AggregateAddress,
        application: impl Into<AggregateApplication>,
        window: &str,
    ) {
        let key = address.key().clone();
        let _replaced = self.aggregates_mut().insert(
            key,
            ServedAggregate {
                address,
                application: Arc::new(application.into()),
                windows: HashSet::from([window.to_owned()]),
                in_flight: Arc::default(),
            },
        );
    }

    /// The label of a new window of the Aggregate with `key`, as its page opens
    /// one, which may reach the Aggregate from now on; `None` when that Aggregate is
    /// not open. No label is answered twice.
    pub fn open_view(&self, key: &AggregateKey) -> Option<String> {
        let mut aggregates = self.aggregates_mut();
        let served = aggregates.get_mut(key)?;
        let label = format!(
            "{}{}",
            views_prefix(key),
            self.views.fetch_add(1, Ordering::Relaxed)
        );
        let _new = served.windows.insert(label.clone());
        Some(label)
    }

    /// Stop admitting the window `label` an Aggregate's page opened, once it is
    /// gone or could not be built, so an Aggregate holds only the windows it has.
    pub fn forget_view(&self, label: &str) {
        for served in self.aggregates_mut().values_mut() {
            let _held = served.windows.remove(label);
        }
    }

    /// Whether the window `window` may reach the Aggregate with `key`: false once
    /// that Aggregate has begun closing.
    pub fn holds_window(&self, key: &AggregateKey, window: &str) -> bool {
        self.aggregates()
            .get(key)
            .is_some_and(|served| served.windows.contains(window))
    }

    /// Stop serving the Aggregate with `key`: a request made from now on is
    /// refused, and the answer says which windows could reach it and which
    /// changes are still being answered.
    pub fn close(&self, key: &AggregateKey) -> Option<Closed> {
        self.aggregates_mut().remove(key).map(|served| Closed {
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
    /// made, answering the request to hand the Aggregate's application, or the
    /// refusal.
    ///
    /// # Errors
    ///
    /// The scheme handler's own refusal.
    pub fn admit(&self, window: &str, request: Request<Vec<u8>>) -> Result<Admitted, Refused> {
        let Some(key) = AggregateAddress::key_of(request.uri(), self.style) else {
            return Err(refuse(
                StatusCode::NOT_FOUND,
                "This address names no Space.",
            ));
        };
        let read = request.method() == Method::GET || request.method() == Method::HEAD;
        // Counted under the lock `close` takes, so a close either sees the
        // change counted or the change sees the Aggregate closed.
        let found = self.aggregates().get(&key).map(|served| {
            (
                served.windows.contains(window),
                (!read).then(|| comes_from(&request, &served.address)),
                Arc::clone(&served.application),
                (!read).then(|| Answering::begin(&served.in_flight)),
            )
        });
        let Some((own_window, by, application, answering)) = found else {
            return Err(refuse(StatusCode::NOT_FOUND, "This Space is not open."));
        };
        if !own_window {
            return Err(refuse(
                StatusCode::FORBIDDEN,
                "Only the Space's own windows may reach it.",
            ));
        }
        let by = match by {
            None => None,
            Some(Some(by)) => Some(by),
            Some(None) => {
                return Err(refuse(
                    StatusCode::FORBIDDEN,
                    "A change to a Space must come from the Space's own page.",
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
    application: Arc<AggregateApplication>,
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

    /// The Aggregate's application's answer.
    pub async fn answer(self) -> Response<Vec<u8>> {
        // The webview hands over the whole body; the application still
        // counts it against its limits.
        let request = self.request.map(|body| Full::new(Bytes::from(body)));
        self.application.handle(request).await.map(Vec::from)
    }
}

#[cfg(test)]
mod tests;
