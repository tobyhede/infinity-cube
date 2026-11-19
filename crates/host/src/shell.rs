//! The application shell around the API: the built application's page and
//! files, handed in by the caller so the host assumes nothing about where
//! they live (`src/desktop/static-files.ts`, `packages/app/mount-headers.ts`).

use std::collections::BTreeMap;
use std::future::Future;

use bytes::Bytes;
use sha2::{Digest as _, Sha256};

use intake::assets::{Base64, encode_base64};

use crate::uri::decode_component;

/// The built application's files other than its page, by the path a request
/// names them with: decoded, relative to the build, without a leading `/`,
/// and never holding an empty, `.` or `..` segment, a backslash or a NUL.
pub trait BuiltFiles: Send + Sync + 'static {
    /// The file's bytes, or `None` when the build holds no such file.
    fn file(&self, path: &str) -> impl Future<Output = Option<Bytes>> + Send;
}

impl BuiltFiles for BTreeMap<String, Bytes> {
    async fn file(&self, path: &str) -> Option<Bytes> {
        self.get(path).cloned()
    }
}

/// The page every address the application owns is answered with, its
/// Content Security Policy, and the files built beside it.
#[derive(Debug, Clone)]
pub struct Shell<B> {
    page: Bytes,
    policy: String,
    files: B,
}

impl<B: BuiltFiles> Shell<B> {
    /// The shell for `page`, admitting each of its inline scripts by hash
    /// (Storage ST-115), with `files` served beside it.
    pub fn new(page: impl Into<Bytes>, files: B) -> Self {
        let page = page.into();
        let policy =
            content_security_policy(&inline_script_sources(&String::from_utf8_lossy(&page)));
        Self {
            page,
            policy,
            files,
        }
    }

    pub(crate) fn page(&self) -> &Bytes {
        &self.page
    }

    pub(crate) fn policy(&self) -> &str {
        &self.policy
    }

    /// The built file a request's pathname names, with its media type.
    pub(crate) async fn file(&self, pathname: &str) -> Option<(Bytes, &'static str)> {
        let path = built_path(pathname)?;
        let bytes = self.files.file(&path).await?;
        Some((bytes, built_media_type(&path)))
    }
}

fn is_word(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Whether attributes name a `src` (`/\bsrc\s*=/`).
fn names_source(attributes: &str) -> bool {
    attributes.match_indices("src").any(|(at, _)| {
        let before = attributes
            .get(..at)
            .and_then(|text| text.chars().next_back());
        if before.is_some_and(is_word) {
            return false;
        }
        attributes
            .get(at + 3..)
            .is_some_and(|rest| rest.trim_start().starts_with('='))
    })
}

/// The source of every `<script>` written into a page, not loaded by `src`
/// (`/<script\b([^>]*)>([\s\S]*?)<\/script>/g`).
pub(crate) fn inline_script_sources(html: &str) -> Vec<String> {
    let mut sources = Vec::new();
    let mut from = 0;
    while let Some(found) = html.get(from..).and_then(|rest| rest.find("<script")) {
        let start = from + found;
        let after = start + "<script".len();
        from = start + 1;
        let rest = html.get(after..).unwrap_or_default();
        if rest.chars().next().is_none_or(is_word) {
            continue;
        }
        let Some(close) = rest.find('>') else {
            continue;
        };
        let attributes = rest.get(..close).unwrap_or_default();
        let body = rest.get(close + 1..).unwrap_or_default();
        let Some(end) = body.find("</script>") else {
            continue;
        };
        if !names_source(attributes) {
            sources.push(body.get(..end).unwrap_or_default().to_owned());
        }
        from = after + close + 1 + end + "</script>".len();
    }
    sources
}

/// Mounting's policy with no GitHub host (Storage ST-94, ST-115).
pub(crate) fn content_security_policy(inline_scripts: &[String]) -> String {
    let mut script = String::from("script-src 'self'");
    for source in inline_scripts {
        script.push_str(" 'sha256-");
        script.push_str(&encode_base64(
            &Sha256::digest(source.as_bytes()),
            Base64::Standard,
        ));
        script.push('\'');
    }
    [
        "default-src 'self'",
        &script,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
    .join("; ")
}

/// `builtMediaType`: a built file's media type by its extension.
pub(crate) fn built_media_type(path: &str) -> &'static str {
    let name = path.rsplit('/').next().unwrap_or_default();
    let extension = match name.rfind('.') {
        Some(at) if at > 0 => name.get(at..).unwrap_or_default().to_ascii_lowercase(),
        _ => String::new(),
    };
    match extension.as_str() {
        ".html" => "text/html; charset=utf-8",
        ".js" | ".mjs" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".map" | ".json" => "application/json",
        ".webmanifest" => "application/manifest+json",
        ".wasm" => "application/wasm",
        ".txt" => "text/plain; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".avif" => "image/avif",
        ".ico" => "image/x-icon",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// The build-relative path a pathname names: decoded as
/// `decodeURIComponent` decodes it, its dot segments resolved, and `None`
/// for one that resolves to the build itself or outside it, or that holds a
/// backslash or a NUL (`builtFiles`, `src/desktop/static-files.ts`).
fn built_path(pathname: &str) -> Option<String> {
    let decoded = decode_component(pathname)?;
    let mut segments: Vec<&str> = Vec::new();
    for segment in decoded.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop()?;
            }
            _ if segment.contains(['\\', '\0']) => return None,
            _ => segments.push(segment),
        }
    }
    (!segments.is_empty()).then(|| segments.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_a_page {
        use super::*;

        #[test]
        fn hashes_each_inline_script_and_skips_loaded_ones() {
            let page = "<script type=\"module\" src=\"/a.js\"></script><script>window.a = 1;</script><scripts></scripts>";
            assert_eq!(
                inline_script_sources(page),
                vec!["window.a = 1;".to_owned()],
                "only the inline script"
            );
            // `printf 'window.standIn = true;' | openssl dgst -sha256 -binary | base64`
            let policy = content_security_policy(&["window.standIn = true;".to_owned()]);
            assert!(
                policy.contains(
                    "script-src 'self' 'sha256-PhqNIk+nbvnTgY4TWUCSygYKMiovRbbBV8E7EBCqKHo='; "
                ),
                "the hash is admitted: {policy}"
            );
        }
    }

    mod given_a_request_path {
        use super::*;

        #[test]
        fn names_no_path_outside_the_build() {
            assert_eq!(
                built_path("/assets/index.js").as_deref(),
                Some("assets/index.js"),
                "inside"
            );
            assert_eq!(
                built_path("/assets/..%2f..%2foutside.txt"),
                None,
                "escaped climb"
            );
            assert_eq!(
                built_path("/assets/..%2Ffavicon.svg").as_deref(),
                Some("favicon.svg"),
                "an escaped climb that stays inside"
            );
            assert_eq!(built_path("/a/./b").as_deref(), Some("a/b"), "a dot");
            assert_eq!(built_path("/..%2Fb"), None, "a climb out of the build");
            assert_eq!(built_path("/a/.."), None, "the build itself");
            assert_eq!(built_path("/a%5cb"), None, "backslash");
            assert_eq!(built_path("/%zz"), None, "malformed escape");
            assert_eq!(built_path("/"), None, "the root");
        }
    }

    mod given_a_built_file {
        use super::*;

        #[test]
        fn serves_it_by_its_extension() {
            assert_eq!(
                built_media_type("assets/a.JS"),
                "text/javascript; charset=utf-8",
                "js"
            );
            assert_eq!(built_media_type("favicon.svg"), "image/svg+xml", "svg");
            assert_eq!(
                built_media_type(".hidden"),
                "application/octet-stream",
                "dot file"
            );
            assert_eq!(
                built_media_type("README"),
                "application/octet-stream",
                "none"
            );
        }
    }
}
