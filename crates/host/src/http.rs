//! The HTTP application as one `Request -> Response` function, with no
//! listener: the Space API (`packages/http/src/index.ts`), product resolution
//! (`packages/aggregate/src/space-host.ts`) and the shell around them
//! (`src/desktop/desktop-handler.ts`, less its `Host` and cookie lock, which
//! belong to whatever carries the requests).

use std::pin::pin;
use std::sync::Arc;

use bytes::{Buf as _, Bytes, BytesMut};
use http::header::{
    ACCEPT, ALLOW, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_SECURITY_POLICY, CONTENT_TYPE, HOST,
    HeaderName, LOCATION, ORIGIN, X_CONTENT_TYPE_OPTIONS,
};
use http::{HeaderMap, HeaderValue, Method, Request, Response, StatusCode};
use http_body::Body;
use http_body_util::BodyExt as _;
use intake::json::JsonValue;
use intake::{Graph, GraphId, HeadShape, Map, MapId, MapKind, SpaceId, SpaceSnapshot};

use crate::assets::{AssetHash, MAX_ASSET_BYTES, StoredAsset, served_media_type};
use crate::import::IdSource;
use crate::json_text::compact;
use crate::product::{Address, address, resolves, space_path};
use crate::repository::{
    AggregateLoad, AssetStored, CommitResult, LoadedSpace, RepositoryError, SpaceChange,
    SpaceCommit, SpaceRepository,
};
use crate::shell::{BuiltFiles, Shell};
use crate::uri::{collapse_dot_segments, parameter, routing_path};
use crate::wire::{self, DecodeError, Problem, decode_commit};

/// The largest commit body read, in bytes (`MAX_COMMIT_BODY_BYTES`).
pub const MAX_COMMIT_BODY_BYTES: usize = 1_048_576;

/// How much of an oversized body is read and discarded before answering, so
/// a keep-alive client keeps its connection, whichever route refused it
/// (`MAX_DRAINED_BODY_BYTES`).
const MAX_DRAINED_BODY_BYTES: usize = MAX_COMMIT_BODY_BYTES * 8;

const JSON: &str = "application/json; charset=utf-8";
const PROBLEM_JSON: &str = "application/problem+json";
const HTML: &str = "text/html; charset=utf-8";
const NO_STORE: &str = "no-store";
const IMMUTABLE: &str = "public, max-age=31536000, immutable";
const ASSET_MEDIA_TYPE: HeaderName = HeaderName::from_static("x-asset-media-type");
const STORED_ASSET_POLICY: &str = "default-src 'none'; sandbox";
const PRODUCT_METHODS: &str = "GET, HEAD";

type Observer = Arc<dyn Fn() + Send + Sync>;
type ErrorObserver = Arc<dyn Fn(&str, &RepositoryError) + Send + Sync>;

/// The host's HTTP application over a store: every request answered by
/// [`Application::handle`].
///
/// It is held to the TypeScript host by `crates/host/tests/wire.rs`, which
/// runs every case of `conformance/http/wire-cases.ts` and
/// `store-condition-cases.ts`, the cases the Node host passes, against it,
/// with further Rust cases for what `fetch` cannot send (a request target
/// with dot segments, two `Accept` lines). Statuses, the headers those cases
/// read, Problem Details codes and the snapshot's key order are what that
/// holds; a header or body no case reads is not checked.
///
/// Both hosts refuse a commit whose JSON escapes a lone UTF-16 surrogate
/// (`"\ud800x"`) 400 `invalid-request` ("Malformed JSON in request body"),
/// as they refuse text that is not JSON (ADR 0160). One difference is known
/// and kept (Storage ST-119): a commit whose arrays and objects nest deeper
/// than [`intake::json::MAX_DEPTH`] is refused here in the same words, where
/// the Node host, whose `JSON.parse` is bounded only by its engine's stack,
/// decodes it.
pub struct Application<R, I, B> {
    repository: Arc<R>,
    ids: I,
    shell: Shell<B>,
    edited: Option<Observer>,
    failed: Option<ErrorObserver>,
}

impl<R, I, B> std::fmt::Debug for Application<R, I, B> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Application").finish_non_exhaustive()
    }
}

fn is_read(method: &Method) -> bool {
    method == Method::GET || method == Method::HEAD
}

fn respond(status: u16, body: impl Into<Bytes>) -> Response<Bytes> {
    let mut response = Response::new(body.into());
    *response.status_mut() =
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    response
}

fn set(response: &mut Response<Bytes>, name: HeaderName, value: &str) {
    if let Ok(value) = HeaderValue::from_str(value) {
        response.headers_mut().insert(name, value);
    }
}

fn json(status: u16, value: &JsonValue) -> Response<Bytes> {
    let mut response = respond(status, compact(value));
    set(&mut response, CONTENT_TYPE, JSON);
    response
}

fn problem(code: Problem, detail: &str) -> Response<Bytes> {
    problem_with(code, detail, false)
}

fn problem_with(code: Problem, detail: &str, whole_body_invalid: bool) -> Response<Bytes> {
    let mut response = respond(
        code.status(),
        compact(&code.body(detail, whole_body_invalid)),
    );
    set(&mut response, CONTENT_TYPE, PROBLEM_JSON);
    response
}

fn not_allowed(allow: &str, detail: &str) -> Response<Bytes> {
    let mut response = problem(Problem::MethodNotAllowed, detail);
    set(&mut response, ALLOW, allow);
    response
}

/// `storedFailureProblem`: a store's failure answered by its classification.
fn stored_failure(error: &RepositoryError) -> (Problem, &'static str) {
    match error {
        RepositoryError::BrokenStoredState(_) => (
            Problem::InternalError,
            "Stored repository state is not usable.",
        ),
        RepositoryError::Unavailable(_) => (
            Problem::PersistenceUnavailable,
            "Try the request again later.",
        ),
        RepositoryError::Unclassified(_) => {
            (Problem::InternalError, "The request failed unexpectedly.")
        }
    }
}

/// Every value of a header, each byte read as Latin-1 and the values joined
/// by `", "`, as `Headers#get` reads them in the Node host.
fn header_text(headers: &HeaderMap, name: &HeaderName) -> Option<String> {
    let values: Vec<String> = headers
        .get_all(name)
        .iter()
        .map(|value| value.as_bytes().iter().copied().map(char::from).collect())
        .collect();
    (!values.is_empty()).then(|| values.join(", "))
}

/// The detail of the 403 `forbidden` answer to a cross-site change
/// (`CROSS_SITE_CHANGE_DETAIL`).
const CROSS_SITE_CHANGE: &str = "Send a change from the application's own page.";

/// The authority an `Origin` names (`<scheme>://<authority>`), or `None` for
/// one that names no authority, such as `null`.
fn origin_authority(origin: &str) -> Option<&str> {
    let (scheme, authority) = origin.split_once("://")?;
    let mut scheme_bytes = scheme.bytes();
    let scheme_ok = scheme_bytes
        .next()
        .is_some_and(|byte| byte.is_ascii_alphabetic())
        && scheme_bytes.all(|byte| byte.is_ascii_alphanumeric() || b"+-.".contains(&byte));
    let authority_ok = !authority.is_empty() && !authority.contains(['/', '?', '#']);
    (scheme_ok && authority_ok).then_some(authority)
}

/// `isCrossSiteChange` (ADR 0161, Storage ST-123): whether a change, a
/// request that is not a read, comes from a page of another site, as the
/// browser that sent it says. A `Sec-Fetch-Site` other than `same-origin` or
/// `none` says so, and so does an `Origin` whose authority is not the `Host`
/// the request names, `null` included, whatever `Sec-Fetch-Site` says. A request naming no
/// `Host`, such as the desktop scheme handler's, is not judged by its
/// `Origin`, and one naming neither header is served.
fn is_cross_site_change(headers: &HeaderMap) -> bool {
    if header_text(headers, &HeaderName::from_static("sec-fetch-site"))
        .is_some_and(|site| site != "same-origin" && site != "none")
    {
        return true;
    }
    match (header_text(headers, &ORIGIN), header_text(headers, &HOST)) {
        (Some(origin), Some(host)) => {
            origin_authority(&origin).is_none_or(|authority| !authority.eq_ignore_ascii_case(&host))
        }
        _ => false,
    }
}

fn has_identity_encoding(headers: &HeaderMap) -> bool {
    header_text(headers, &CONTENT_ENCODING).is_none_or(|encoding| {
        encoding
            .trim_matches(intake::text::is_js_whitespace)
            .eq_ignore_ascii_case("identity")
    })
}

fn is_token_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b"!#$%&'*+.^_`|~-".contains(&byte)
}

/// `hasValidUniqueMediaTypeParameters` (`packages/http/src/media-type.ts`),
/// answering the lowercased essence and each parameter's unquoted value.
fn parse_media_type(value: &str) -> Option<(String, Vec<(String, String)>)> {
    let bytes = value.as_bytes();
    let mut index = 0;
    let skip_whitespace = |index: &mut usize| {
        while bytes
            .get(*index)
            .is_some_and(|byte| *byte == b' ' || *byte == b'\t')
        {
            *index += 1;
        }
    };
    let read_token = |index: &mut usize| {
        let start = *index;
        while bytes.get(*index).copied().is_some_and(is_token_byte) {
            *index += 1;
        }
        value.get(start..*index).unwrap_or_default().to_owned()
    };
    skip_whitespace(&mut index);
    let kind = read_token(&mut index);
    if kind.is_empty() || bytes.get(index) != Some(&b'/') {
        return None;
    }
    index += 1;
    let subtype = read_token(&mut index);
    if subtype.is_empty() {
        return None;
    }
    skip_whitespace(&mut index);
    let mut parameters: Vec<(String, String)> = Vec::new();
    while index < bytes.len() {
        if bytes.get(index) != Some(&b';') {
            return None;
        }
        index += 1;
        skip_whitespace(&mut index);
        let name = read_token(&mut index).to_ascii_lowercase();
        if name.is_empty() || parameters.iter().any(|(seen, _)| *seen == name) {
            return None;
        }
        skip_whitespace(&mut index);
        if bytes.get(index) != Some(&b'=') {
            return None;
        }
        index += 1;
        skip_whitespace(&mut index);
        let parameter = if bytes.get(index) == Some(&b'"') {
            index += 1;
            let mut unquoted = Vec::new();
            loop {
                let byte = *bytes.get(index)?;
                index += 1;
                match byte {
                    b'"' => break,
                    b'\\' => {
                        let escaped = *bytes.get(index)?;
                        if escaped != b'\t' && (escaped < 32 || escaped == 127) {
                            return None;
                        }
                        unquoted.push(escaped);
                        index += 1;
                    }
                    b'\t' | b' ' | b'!' | 35..=91 | 93..=126 | 128..=255 => unquoted.push(byte),
                    _ => return None,
                }
            }
            String::from_utf8_lossy(&unquoted).into_owned()
        } else {
            let token = read_token(&mut index);
            if token.is_empty() {
                return None;
            }
            token
        };
        parameters.push((name, parameter));
        skip_whitespace(&mut index);
    }
    Some((format!("{kind}/{subtype}").to_ascii_lowercase(), parameters))
}

/// What arrived of a body read against a size limit.
enum Bounded {
    Read(Bytes),
    Oversized,
    Failed,
}

/// Count the bytes that arrive, never the declared length; over the limit,
/// free what was kept and drain up to [`MAX_DRAINED_BODY_BYTES`] more. A
/// body that arrives as one chunk is handed on without a copy.
async fn read_bounded<T: Body>(body: T, limit: usize) -> Bounded {
    let mut body = pin!(body);
    let mut first: Option<Bytes> = None;
    let mut joined: Option<BytesMut> = None;
    let mut size = 0usize;
    while let Some(frame) = body.as_mut().frame().await {
        let Ok(frame) = frame else {
            return Bounded::Failed;
        };
        let Ok(mut data) = frame.into_data() else {
            continue;
        };
        size = size.saturating_add(data.remaining());
        if size > limit {
            drop(first.take());
            drop(joined.take());
            let mut drained = 0usize;
            while drained < MAX_DRAINED_BODY_BYTES {
                match body.as_mut().frame().await {
                    Some(Ok(frame)) => {
                        drained = drained
                            .saturating_add(frame.data_ref().map_or(0, |data| data.remaining()));
                    }
                    _ => break,
                }
            }
            return Bounded::Oversized;
        }
        let chunk = data.copy_to_bytes(data.remaining());
        if let Some(buffer) = joined.as_mut() {
            buffer.extend_from_slice(&chunk);
        } else if let Some(earlier) = first.take() {
            let mut buffer = BytesMut::with_capacity(earlier.len() + chunk.len());
            buffer.extend_from_slice(&earlier);
            buffer.extend_from_slice(&chunk);
            joined = Some(buffer);
        } else {
            first = Some(chunk);
        }
    }
    Bounded::Read(joined.map_or_else(|| first.unwrap_or_default(), BytesMut::freeze))
}

/// Whether a Space is already in its working state: it has a Map and names
/// its default one.
fn is_working(snapshot: &SpaceSnapshot) -> bool {
    snapshot.document.default_map.is_some()
        && snapshot
            .document
            .maps
            .as_deref()
            .is_some_and(|maps| !maps.is_empty())
}

/// `initializedSnapshot` (`packages/persistence/src/working-space.ts`): the
/// working state a Space is first read in, or `None` when it already is.
fn initialized_snapshot(snapshot: &SpaceSnapshot, ids: &impl IdSource) -> Option<SpaceSnapshot> {
    if is_working(snapshot) {
        return None;
    }
    let maps = snapshot.document.maps.as_deref().unwrap_or_default();
    if let Some(first) = maps.first() {
        let mut next = snapshot.clone();
        next.document.default_map = Some(first.id);
        return Some(next);
    }
    let mut next = snapshot.clone();
    let map_id = MapId::from(ids.new_id());
    let graph_id = GraphId::from(ids.new_id());
    next.document.maps = Some(vec![Map {
        id: map_id,
        title: "Map 1".to_owned(),
        kind: MapKind::Positioned,
        positions: Vec::new(),
        graphs: vec![Graph {
            id: graph_id,
            title: "Graph 1".to_owned(),
            color: Some("#1f77b4".to_owned()),
            head_shape: Some(HeadShape::Arrow),
            edges: Vec::new(),
        }],
        active_graph: Some(graph_id),
    }]);
    next.document.default_map = Some(map_id);
    Some(next)
}

fn accepts_html(accept: Option<&str>) -> bool {
    accept.is_some_and(|accept| {
        accept.split(',').any(|media| {
            media
                .trim_matches(intake::text::is_js_whitespace)
                .split(';')
                .next()
                == Some("text/html")
        })
    })
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// A product address's refusal, as HTML to a request that accepts it.
fn product_problem(code: Problem, detail: &str, accept: Option<&str>) -> Response<Bytes> {
    if accepts_html(accept) {
        let title = escape_html(code.title());
        let page = format!(
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>{title}</title></head><body><main><h1>{title}</h1><p>{}</p></main></body></html>",
            escape_html(detail)
        );
        let mut response = respond(code.status(), page);
        set(&mut response, CONTENT_TYPE, HTML);
        return response;
    }
    problem(code, detail)
}

fn product_not_allowed(accept: Option<&str>) -> Response<Bytes> {
    let mut response = product_problem(
        Problem::MethodNotAllowed,
        "Use GET or HEAD for a product URL.",
        accept,
    );
    set(&mut response, ALLOW, PRODUCT_METHODS);
    response
}

/// The single segment after `prefix`, if `path` is `prefix` and one segment.
fn segment_after<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    path.strip_prefix(prefix)
        .filter(|rest| !rest.is_empty() && !rest.contains('/'))
}

const INVALID_ASSET_HASH: &str = "Use the unpadded base64url SHA-256 of the asset for its hash.";
const INVALID_SPACE_ID: &str = "Use a UUID for the Space id.";

/// `unservedContractPath`: the answer for a path on the contract that no
/// handler serves for this method; `None` when the path is not on it, or is
/// a stored asset asked for by HEAD.
fn unserved(path: &str, method: &Method) -> Option<Response<Bytes>> {
    match path {
        "/api/spaces" => {
            return Some(not_allowed(
                "GET, POST",
                "Use GET or POST for the Space collection.",
            ));
        }
        "/api/aggregate" => return Some(not_allowed("GET", "Use GET for the aggregate resource.")),
        "/assets" => return Some(not_allowed("POST", "Use POST to store an asset.")),
        _ => {}
    }
    if let Some(hash) = segment_after(path, "/assets/") {
        if AssetHash::parse(hash).is_none() {
            return Some(problem(Problem::InvalidAssetHash, INVALID_ASSET_HASH));
        }
        if method == Method::HEAD {
            return None;
        }
        return Some(not_allowed(
            "GET, HEAD",
            "Use GET or HEAD for a stored asset.",
        ));
    }
    let id = segment_after(path, "/api/spaces/")?;
    if SpaceId::parse(id).is_none() {
        return Some(problem(Problem::InvalidSpaceId, INVALID_SPACE_ID));
    }
    Some(not_allowed("GET", "Use GET for a Space resource."))
}

/// Whether the Fetch application owns `path` outright.
fn is_application_path(path: &str) -> bool {
    path == "/api"
        || path.starts_with("/api/")
        || path == "/assets"
        || segment_after(path, "/assets/").is_some_and(|hash| AssetHash::parse(hash).is_some())
}

impl<R: SpaceRepository, I: IdSource, B: BuiltFiles> Application<R, I, B> {
    /// The application over `repository`, minting the ids a working read
    /// needs from `ids` (ADR 0109) and serving `shell` around the API.
    pub fn new(repository: Arc<R>, ids: I, shell: Shell<B>) -> Self {
        Self {
            repository,
            ids,
            shell,
            edited: None,
            failed: None,
        }
    }

    /// Call `observer` after each Edit: an accepted `POST /api/spaces`, and
    /// nothing a read does, such as a Space's first working read (ST-65).
    #[must_use]
    pub fn on_edit(mut self, observer: impl Fn() + Send + Sync + 'static) -> Self {
        self.edited = Some(Arc::new(observer));
        self
    }

    /// Call `observer` with each store failure the application answers, and
    /// what failed (such as `Failed to list spaces`, the sentence the
    /// TypeScript host logs), before answering it by its classification. The
    /// answer never carries the failure's text, so this is where a caller
    /// logs why it answered 500 or 503.
    #[must_use]
    pub fn on_error(
        mut self,
        observer: impl Fn(&str, &RepositoryError) + Send + Sync + 'static,
    ) -> Self {
        self.failed = Some(Arc::new(observer));
        self
    }

    /// Report `error` to the error observer, then answer it by its classification.
    fn failure(&self, context: &str, error: &RepositoryError) -> (Problem, &'static str) {
        if let Some(failed) = &self.failed {
            failed(context, error);
        }
        stored_failure(error)
    }

    fn failure_problem(&self, context: &str, error: &RepositoryError) -> Response<Bytes> {
        let (code, detail) = self.failure(context, error);
        problem(code, detail)
    }

    /// The store the application answers from.
    pub fn repository(&self) -> &Arc<R> {
        &self.repository
    }

    /// Answer one request.
    ///
    /// The caller hands over the request target as received, with no
    /// normalising of its own: the path's dot segments (`.`, `..` and their
    /// `%2e` spellings) are collapsed here as a WHATWG URL parser collapses
    /// them, which is the pathname the Node host's handler is given, and the
    /// API and asset paths are percent-decoded here as Hono decodes them
    /// (`decodeURI` for routing, `decodeURIComponent` for a Space id or an
    /// asset hash). A product address and a built file's path are read as
    /// the Node host reads them. Collapsing is idempotent, so a caller that
    /// has already normalised loses nothing.
    ///
    /// HEAD is answered as GET is, with its headers and an empty body. The
    /// response carries no `Content-Length`, and the Node host sends none for
    /// HEAD, so a listener that adds one answers differently from it.
    pub async fn handle<T: Body>(&self, request: Request<T>) -> Response<Bytes> {
        let head = request.method() == Method::HEAD;
        let mut response = self.route(request).await;
        if head {
            *response.body_mut() = Bytes::new();
        }
        response
    }

    async fn route<T: Body>(&self, request: Request<T>) -> Response<Bytes> {
        // The pathname a WHATWG URL parser gives the Node host's handler.
        let path = collapse_dot_segments(request.uri().path()).into_owned();
        let method = request.method().clone();
        if is_application_path(&path) {
            return self.api(request, &path).await;
        }
        if path.starts_with("/assets/") {
            if is_read(&method)
                && let Some((bytes, media_type)) = self.shell.file(&path).await
            {
                return built_file(&path, bytes, media_type);
            }
            return self.api(request, &path).await;
        }
        let accept = header_text(request.headers(), &ACCEPT);
        if let Some(product) = self.product(&path, &method, accept.as_deref()).await {
            return product;
        }
        if !is_read(&method) {
            let mut response = respond(405, Bytes::new());
            set(&mut response, ALLOW, PRODUCT_METHODS);
            return response;
        }
        if path != "/"
            && let Some((bytes, media_type)) = self.shell.file(&path).await
        {
            return built_file(&path, bytes, media_type);
        }
        let mut response = respond(200, self.shell.page().clone());
        set(&mut response, CONTENT_TYPE, HTML);
        set(&mut response, CONTENT_SECURITY_POLICY, self.shell.policy());
        set(&mut response, X_CONTENT_TYPE_OPTIONS, "nosniff");
        set(&mut response, CACHE_CONTROL, NO_STORE);
        response
    }

    /// `resolveProductRequest`: the answer for a product address, or `None`
    /// for a path the shell answers.
    async fn product(
        &self,
        path: &str,
        method: &Method,
        accept: Option<&str>,
    ) -> Option<Response<Bytes>> {
        let reads = is_read(method);
        if path == "/" {
            if !reads {
                return Some(product_not_allowed(accept));
            }
            return Some(match self.repository.load_aggregate().await {
                Err(error) => {
                    let (code, detail) = self.failure("Failed to read the Meta Space", &error);
                    product_problem(code, detail, accept)
                }
                Ok(AggregateLoad::Uninitialized) => product_problem(
                    Problem::PersistenceUnavailable,
                    "No Meta Space has been established yet.",
                    accept,
                ),
                Ok(AggregateLoad::Loaded(aggregate)) => {
                    let mut response = respond(302, Bytes::new());
                    set(
                        &mut response,
                        LOCATION,
                        &space_path(aggregate.meta_space_id),
                    );
                    response
                }
            });
        }
        let malformed =
            || product_problem(Problem::InvalidRequest, "Use a valid product URL.", accept);
        match address(path) {
            Address::Outside => None,
            Address::Malformed => Some(malformed()),
            Address::Addressed(..) if !reads => Some(product_not_allowed(accept)),
            Address::Addressed(space, destination) => {
                match self.repository.load_space(space).await {
                    Err(error) => {
                        let (code, detail) =
                            self.failure("Failed to resolve a product address", &error);
                        Some(product_problem(code, detail, accept))
                    }
                    Ok(Some(loaded)) if resolves(&loaded.snapshot, destination) => None,
                    Ok(_) => Some(product_problem(
                        Problem::NotFound,
                        "Choose a product destination that exists.",
                        accept,
                    )),
                }
            }
        }
    }

    /// The Space API and the asset store, under the transport policy, a
    /// cross-site change refused before its body is read.
    async fn api<T: Body>(&self, request: Request<T>, path: &str) -> Response<Bytes> {
        let mut response = if !is_read(request.method()) && is_cross_site_change(request.headers())
        {
            problem(Problem::Forbidden, CROSS_SITE_CHANGE)
        } else {
            self.api_route(request, &routing_path(path)).await
        };
        if !response.headers().contains_key(CACHE_CONTROL) {
            set(&mut response, CACHE_CONTROL, NO_STORE);
        }
        response
    }

    /// The route `path` names, `path` being the one Hono routes on.
    async fn api_route<T: Body>(&self, request: Request<T>, path: &str) -> Response<Bytes> {
        let method = request.method().clone();
        if method == Method::HEAD
            && let Some(answer) = unserved(path, &method)
        {
            return answer;
        }
        let reads = is_read(&method);
        match (path, &method) {
            ("/api/spaces", &Method::GET) => match self.repository.list_spaces().await {
                Ok(spaces) => json(200, &wire::summaries(&spaces)),
                Err(error) => self.failure_problem("Failed to list spaces", &error),
            },
            ("/api/spaces", &Method::POST) => self.commit(request).await,
            ("/api/aggregate", &Method::GET) => match self.repository.load_aggregate().await {
                Ok(load) => json(200, &wire::aggregate(&load)),
                Err(error) => self.failure_problem("Failed to load the Space aggregate", &error),
            },
            ("/assets", &Method::POST) => self.store_asset(request).await,
            _ => {
                if reads && let Some(id) = segment_after(path, "/api/spaces/") {
                    return self.load_space(&parameter(id)).await;
                }
                if reads && let Some(hash) = segment_after(path, "/assets/") {
                    return self.load_asset(&parameter(hash)).await;
                }
                unserved(path, &method)
                    .unwrap_or_else(|| problem(Problem::NotFound, "Use a declared Space API path."))
            }
        }
    }

    async fn load_space(&self, id: &str) -> Response<Bytes> {
        let Some(space) = SpaceId::parse(id) else {
            return problem(Problem::InvalidSpaceId, INVALID_SPACE_ID);
        };
        match self.load_working_space(space).await {
            Ok(Some(loaded)) => json(200, &wire::loaded_space(&loaded)),
            Ok(None) => problem(
                Problem::NotFound,
                &format!("Choose a Space that exists; Space {id} does not."),
            ),
            Err(error) => self.failure_problem(&format!("Failed to load space {id}"), &error),
        }
    }

    /// `loadWorkingSpace`: a Space as the browser first works on it, its
    /// initialization committed as a read (never an Edit), retried on a
    /// conflict.
    async fn load_working_space(
        &self,
        id: SpaceId,
    ) -> Result<Option<LoadedSpace>, RepositoryError> {
        let Some(mut loaded) = self.repository.load_space(id).await? else {
            return Ok(None);
        };
        // Answered as stored, unchecked, as `initializedSnapshot` would leave
        // it; only a Space to initialize is checked first.
        if is_working(&loaded.snapshot) || intake::load_space(loaded.snapshot.clone()).is_err() {
            return Ok(Some(loaded));
        }
        loop {
            let Some(initialized) = initialized_snapshot(&loaded.snapshot, &self.ids) else {
                return Ok(Some(loaded));
            };
            let result = self
                .repository
                .commit(SpaceCommit {
                    changes: vec![SpaceChange::Update {
                        space_id: id,
                        snapshot: initialized.clone(),
                        expected_revision: loaded.revision,
                    }],
                })
                .await?;
            match result {
                CommitResult::Committed { revisions, .. } => {
                    let Some((_, revision)) = revisions.into_iter().find(|(space, _)| *space == id)
                    else {
                        return Err(RepositoryError::Unclassified(format!(
                            "Space {id} initialization returned no revision"
                        )));
                    };
                    return Ok(Some(LoadedSpace {
                        snapshot: initialized,
                        revision,
                        exported_revision: loaded.exported_revision,
                    }));
                }
                CommitResult::Conflict(conflicts) => {
                    let Some(conflict) = conflicts
                        .into_iter()
                        .find(|conflict| conflict.space_id == id)
                    else {
                        return Err(RepositoryError::Unclassified(format!(
                            "Space {id} changed without returning its current working state"
                        )));
                    };
                    let Some(current) = conflict.current else {
                        return Ok(None);
                    };
                    loaded = current;
                }
                _ => {
                    return Err(RepositoryError::Unclassified(format!(
                        "Space {id} could not initialize its working state"
                    )));
                }
            }
        }
    }

    async fn commit<T: Body>(&self, request: Request<T>) -> Response<Bytes> {
        let headers = request.headers();
        if !has_identity_encoding(headers) {
            return problem(
                Problem::UnsupportedMediaType,
                "Send the request without content encoding.",
            );
        }
        let Some((_, parameters)) = header_text(headers, &CONTENT_TYPE)
            .and_then(|value| parse_media_type(&value))
            .filter(|(essence, _)| essence == "application/json")
        else {
            return problem(
                Problem::UnsupportedMediaType,
                "Send the request as application/json.",
            );
        };
        if parameters
            .iter()
            .any(|(name, value)| name == "charset" && !value.eq_ignore_ascii_case("utf-8"))
        {
            return problem(
                Problem::UnsupportedMediaType,
                "Encode the JSON request as UTF-8.",
            );
        }
        let body = match read_bounded(request.into_body(), MAX_COMMIT_BODY_BYTES).await {
            Bounded::Read(body) => body,
            Bounded::Oversized => {
                return problem(
                    Problem::PayloadTooLarge,
                    &format!("Send a request body no larger than {MAX_COMMIT_BODY_BYTES} bytes."),
                );
            }
            Bounded::Failed => {
                return problem(Problem::InternalError, "Try the request again later.");
            }
        };
        let commit = match decode_commit(&body) {
            Ok(commit) => commit,
            Err(DecodeError::Malformed) => {
                return problem(Problem::InvalidRequest, "Malformed JSON in request body");
            }
            Err(DecodeError::Invalid { message, .. }) => {
                let detail = if message.is_empty() {
                    "Correct the request body."
                } else {
                    message.as_str()
                };
                return problem_with(Problem::InvalidRequest, detail, true);
            }
        };
        match self.repository.commit(commit).await {
            Ok(CommitResult::Committed {
                revisions,
                deleted_space_ids,
            }) => {
                if let Some(edited) = &self.edited {
                    edited();
                }
                json(200, &wire::committed(&revisions, &deleted_space_ids))
            }
            Ok(CommitResult::Conflict(conflicts)) => json(409, &wire::conflict(&conflicts)),
            Ok(CommitResult::AggregateRefused(refusal)) => json(422, &wire::refused(&refusal)),
            Ok(CommitResult::Rejected { message }) => {
                problem_with(Problem::InvalidRequest, &message, true)
            }
            Err(error) => self.failure_problem("Failed to commit spaces", &error),
        }
    }

    async fn store_asset<T: Body>(&self, request: Request<T>) -> Response<Bytes> {
        if !has_identity_encoding(request.headers()) {
            return problem(
                Problem::UnsupportedMediaType,
                "Send the asset without content encoding.",
            );
        }
        let declared = header_text(request.headers(), &CONTENT_TYPE).unwrap_or_default();
        let too_large = || {
            problem(
                Problem::AssetTooLarge,
                &format!("Send an asset no larger than {MAX_ASSET_BYTES} bytes."),
            )
        };
        let bytes = match read_bounded(request.into_body(), MAX_ASSET_BYTES).await {
            Bounded::Read(bytes) => bytes,
            Bounded::Oversized => return too_large(),
            Bounded::Failed => {
                return problem(Problem::InternalError, "Try the request again later.");
            }
        };
        let Some(asset) = StoredAsset::admit(bytes, &declared) else {
            return too_large();
        };
        let url = asset.hash.path();
        let status = match self.repository.store_asset(asset).await {
            Ok(AssetStored::Stored) => 201,
            Ok(_) => 200,
            Err(error) => return self.failure_problem("Failed to store an asset", &error),
        };
        let mut response = json(
            status,
            &wire::object([("url", JsonValue::String(url.clone()))]),
        );
        set(&mut response, LOCATION, &url);
        response
    }

    async fn load_asset(&self, hash: &str) -> Response<Bytes> {
        let Some(parsed) = AssetHash::parse(hash) else {
            return problem(Problem::InvalidAssetHash, INVALID_ASSET_HASH);
        };
        match self.repository.load_asset(&parsed).await {
            Ok(Some(asset)) => {
                let mut response = respond(200, asset.bytes);
                set(&mut response, CACHE_CONTROL, IMMUTABLE);
                set(&mut response, X_CONTENT_TYPE_OPTIONS, "nosniff");
                set(&mut response, CONTENT_SECURITY_POLICY, STORED_ASSET_POLICY);
                set(
                    &mut response,
                    CONTENT_TYPE,
                    served_media_type(&asset.media_type),
                );
                set(&mut response, ASSET_MEDIA_TYPE, &asset.media_type);
                response
            }
            Ok(None) => problem(
                Problem::NotFound,
                &format!("Choose an asset that is stored; {hash} is not."),
            ),
            Err(error) => self.failure_problem(&format!("Failed to load asset {hash}"), &error),
        }
    }
}

fn built_file(path: &str, bytes: Bytes, media_type: &str) -> Response<Bytes> {
    let mut response = respond(200, bytes);
    set(&mut response, CONTENT_TYPE, media_type);
    set(&mut response, X_CONTENT_TYPE_OPTIONS, "nosniff");
    let cache = if path.starts_with("/assets/") {
        IMMUTABLE
    } else {
        "no-cache"
    };
    set(&mut response, CACHE_CONTROL, cache);
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_a_media_type {
        use super::*;

        #[test]
        fn reads_it_as_rfc_9110_writes_it() {
            let parsed = parse_media_type("Application/JSON ; charset=\"UTF-8\"");
            assert_eq!(
                parsed,
                Some((
                    "application/json".to_owned(),
                    vec![("charset".to_owned(), "UTF-8".to_owned())]
                )),
                "spaces around the parameter and a quoted value"
            );
            assert_eq!(
                parse_media_type("application/json; x=1; X=2"),
                None,
                "repeated name"
            );
            assert_eq!(
                parse_media_type("application/json;"),
                None,
                "empty parameter"
            );
            assert_eq!(parse_media_type("application"), None, "no subtype");
        }
    }

    mod given_a_header_value {
        use super::*;

        #[test]
        fn trims_it_as_string_trim_does() {
            let encoded = |value: &'static [u8]| {
                let mut headers = HeaderMap::new();
                headers.insert(
                    CONTENT_ENCODING,
                    http::HeaderValue::from_bytes(value).unwrap(),
                );
                has_identity_encoding(&headers)
            };
            assert!(encoded(b"identity\xA0"), "U+00A0 is trimmed");
            assert!(!encoded(b"identity\x85"), "U+0085 is not");
            assert!(accepts_html(Some("text/html\u{a0}")), "U+00A0 is trimmed");
            assert!(!accepts_html(Some("text/html\u{85}")), "U+0085 is not");
        }
    }
}
