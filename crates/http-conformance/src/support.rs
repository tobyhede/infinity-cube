//! What the cases send and how they read and judge an answer.

use bytes::Bytes;
use host::AssetHash;
use http::{Request, Response};
use serde_json::{Value, json};

use crate::Adapter;

/// Send `method path` with `headers` and `content`.
pub async fn send<A: Adapter>(
    subject: &A,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    content: impl Into<Bytes>,
) -> Response<Bytes> {
    let mut request = Request::builder().method(method).uri(path);
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    subject.send(request.body(content.into()).unwrap()).await
}

pub async fn get<A: Adapter>(subject: &A, path: &str) -> Response<Bytes> {
    send(subject, "GET", path, &[], Bytes::new()).await
}

pub async fn post_commit<A: Adapter>(
    subject: &A,
    content: impl Into<Bytes>,
    content_type: &str,
) -> Response<Bytes> {
    send(
        subject,
        "POST",
        "/api/spaces",
        &[("content-type", content_type)],
        content,
    )
    .await
}

pub async fn post_asset<A: Adapter>(
    subject: &A,
    bytes: Vec<u8>,
    headers: &[(&str, &str)],
) -> Response<Bytes> {
    send(subject, "POST", "/assets", headers, bytes).await
}

/// The Space `id` as the API answers it, which must load.
pub async fn load<A: Adapter>(subject: &A, id: &str) -> Value {
    let response = get(subject, &format!("/api/spaces/{id}")).await;
    assert_eq!(response.status(), 200, "{id} loads");
    json_of(&response)
}

pub fn header<'a>(response: &'a Response<Bytes>, name: &str) -> Option<&'a str> {
    response
        .headers()
        .get(name)
        .map(|value| value.to_str().unwrap())
}

pub fn json_of(response: &Response<Bytes>) -> Value {
    serde_json::from_slice(response.body()).unwrap()
}

/// A change renaming the Space `loaded` answers, at its revision.
pub fn rename_change(loaded: &Value, title: &str) -> Value {
    let mut snapshot = loaded["snapshot"].clone();
    snapshot["document"]["title"] = json!(title);
    json!({
        "kind": "update",
        "spaceId": loaded["snapshot"]["id"],
        "snapshot": snapshot,
        "expectedRevision": loaded["revision"],
    })
}

/// A commit of [`rename_change`] alone.
pub fn rename_text(loaded: &Value, title: &str) -> String {
    json!({ "changes": [rename_change(loaded, title)] }).to_string()
}

/// `text` padded with spaces to `size` bytes.
pub fn padded(text: &str, size: usize) -> Vec<u8> {
    let mut bytes = text.as_bytes().to_vec();
    assert!(bytes.len() <= size, "the body fits");
    bytes.resize(size, b' ');
    bytes
}

/// `size` bytes opening with `stamp`, so no two cases' assets share a hash.
pub fn fresh(size: usize, stamp: &str) -> Vec<u8> {
    let mut bytes = vec![0u8; size];
    let stamp = stamp.as_bytes();
    let length = stamp.len().min(size);
    bytes[..length].copy_from_slice(&stamp[..length]);
    bytes
}

pub fn revision(loaded: &Value) -> u64 {
    loaded["revision"].as_str().unwrap().parse().unwrap()
}

/// Where an asset of `bytes` is stored.
pub fn path_of(bytes: &[u8]) -> String {
    format!("/assets/{}", AssetHash::of(bytes).as_str())
}

pub mod assertions {
    use super::*;
    use crate::{STAND_IN_PAGE, STAND_IN_POLICY};

    pub fn problem(response: &Response<Bytes>, code: &str, status: u16, title: &str) {
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

    pub fn not_found(response: &Response<Bytes>) {
        problem(response, "not-found", 404, "Not found");
    }

    pub fn invalid_request(response: &Response<Bytes>) {
        problem(response, "invalid-request", 400, "Invalid request");
    }

    pub fn unsupported(response: &Response<Bytes>) {
        problem(
            response,
            "unsupported-media-type",
            415,
            "Unsupported media type",
        );
    }

    pub fn whole_body_invalid(response: &Response<Bytes>) {
        assert_eq!(
            json_of(response)["errors"],
            json!([{ "code": "invalid-value", "pointer": "" }]),
            "the whole body is refused"
        );
    }

    pub fn api_policy(response: &Response<Bytes>) {
        assert_eq!(
            header(response, "cache-control"),
            Some("no-store"),
            "API answers are not stored"
        );
    }

    pub fn json_media(response: &Response<Bytes>) {
        assert_eq!(
            header(response, "content-type"),
            Some("application/json; charset=utf-8"),
            "JSON names its charset"
        );
    }

    pub fn html_problem(response: &Response<Bytes>, status: u16) {
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

    /// The stand-in build's page, with the policy every host serving it sends.
    pub fn shell(response: &Response<Bytes>) {
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
