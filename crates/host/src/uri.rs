//! A request's path as the Node host reads it: its dot segments collapsed as
//! a WHATWG URL parser collapses them, and the percent-decoding Hono applies
//! to the API's paths and parameters (`getPath` and `HonoRequest#param`,
//! `hono/dist/utils/url.js`), with `decodeURI` and `decodeURIComponent`'s
//! rules for what they decode and what they refuse.

use std::borrow::Cow;

/// A single-dot segment as the URL Standard reads one.
fn is_single_dot(segment: &str) -> bool {
    segment == "." || segment.eq_ignore_ascii_case("%2e")
}

/// A double-dot segment as the URL Standard reads one.
fn is_double_dot(segment: &str) -> bool {
    matches!(
        segment.to_ascii_lowercase().as_str(),
        ".." | ".%2e" | "%2e." | "%2e%2e"
    )
}

/// `path` with its dot segments collapsed as the URL Standard's path state
/// collapses a special URL's: a backslash is read as a slash, a `.` segment
/// is dropped, a `..` segment drops the one before it, `%2e` counts as a dot,
/// and either as the last segment leaves a trailing slash. A path that does
/// not start with `/` is answered as it is.
pub(crate) fn collapse_dot_segments(path: &str) -> Cow<'_, str> {
    if !path.starts_with('/') {
        return Cow::Borrowed(path);
    }
    if path.contains('\\') {
        let slashed = path.replace('\\', "/");
        return Cow::Owned(collapse_dot_segments(&slashed).into_owned());
    }
    let Some(rest) = path.strip_prefix('/') else {
        return Cow::Borrowed(path);
    };
    if !rest
        .split('/')
        .any(|segment| is_single_dot(segment) || is_double_dot(segment))
    {
        return Cow::Borrowed(path);
    }
    let segments: Vec<&str> = rest.split('/').collect();
    let last = segments.len().saturating_sub(1);
    let mut kept: Vec<&str> = Vec::with_capacity(segments.len());
    for (index, segment) in segments.into_iter().enumerate() {
        if is_double_dot(segment) {
            kept.pop();
            if index == last {
                kept.push("");
            }
        } else if is_single_dot(segment) {
            if index == last {
                kept.push("");
            }
        } else {
            kept.push(segment);
        }
    }
    Cow::Owned(format!("/{}", kept.join("/")))
}

fn hex_value(byte: u8) -> Option<u8> {
    char::from(byte)
        .to_digit(16)
        .and_then(|value| u8::try_from(value).ok())
}

/// The characters `decodeURI` leaves escaped: those `encodeURI` never escapes.
fn is_reserved(byte: u8) -> bool {
    b";/?:@&=+$,#".contains(&byte)
}

/// Which of the two JavaScript decoders to follow.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Decoder {
    /// `decodeURI`: a reserved character's escape stays as written.
    Uri,
    /// `decodeURIComponent`: every escape is decoded.
    Component,
}

/// `text` decoded as `decoder` decodes it, or `None` where it throws a
/// `URIError`: a `%` not followed by two hex digits, or escaped bytes that
/// are not UTF-8.
fn decode(text: &str, decoder: Decoder) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte != b'%' {
            out.push(byte);
            index += 1;
            continue;
        }
        let mut escaped: Vec<u8> = Vec::new();
        let start = index;
        while bytes.get(index) == Some(&b'%') {
            let high = hex_value(*bytes.get(index + 1)?)?;
            let low = hex_value(*bytes.get(index + 2)?)?;
            escaped.push((high << 4) | low);
            index += 3;
        }
        // A run of escapes decodes as UTF-8 or not at all, as the decoders
        // read one sequence at a time and throw on a broken one.
        let decoded = std::str::from_utf8(&escaped).ok()?;
        let written = text.get(start..index)?;
        let mut at = 0;
        for character in decoded.chars() {
            let width = character.len_utf8();
            let keep = decoder == Decoder::Uri
                && width == 1
                && u8::try_from(character).is_ok_and(is_reserved);
            if keep {
                out.extend_from_slice(written.get(at * 3..at * 3 + 3)?.as_bytes());
            } else {
                let mut buffer = [0; 4];
                out.extend_from_slice(character.encode_utf8(&mut buffer).as_bytes());
            }
            at += width;
        }
    }
    String::from_utf8(out).ok()
}

/// Hono's `tryDecode`: `text` decoded whole, or, where that throws, each run
/// of escapes decoded on its own and a run that throws left as written.
fn try_decode(text: &str, decoder: Decoder) -> String {
    if let Some(decoded) = decode(text, decoder) {
        return decoded;
    }
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut index = 0;
    while index < bytes.len() {
        let start = index;
        while bytes.get(index) == Some(&b'%')
            && bytes
                .get(index + 1)
                .copied()
                .is_some_and(|b| b.is_ascii_hexdigit())
            && bytes
                .get(index + 2)
                .copied()
                .is_some_and(|b| b.is_ascii_hexdigit())
        {
            index += 3;
        }
        if index > start {
            let run = text.get(start..index).unwrap_or_default();
            out.push_str(&decode(run, decoder).unwrap_or_else(|| run.to_owned()));
            continue;
        }
        let next = text
            .get(index..)
            .and_then(|rest| rest.chars().next())
            .map_or(1, char::len_utf8);
        out.push_str(text.get(index..index + next).unwrap_or_default());
        index += next;
    }
    out
}

/// The path Hono routes on (`getPath`): `decodeURI` of it, with an escaped
/// `%` kept escaped, so a parameter is decoded once, not twice.
pub(crate) fn routing_path(path: &str) -> Cow<'_, str> {
    if !path.contains('%') {
        return Cow::Borrowed(path);
    }
    Cow::Owned(try_decode(&path.replace("%25", "%2525"), Decoder::Uri))
}

/// A route parameter as Hono hands it over (`tryDecodeURIComponent`).
pub(crate) fn parameter(segment: &str) -> Cow<'_, str> {
    if !segment.contains('%') {
        return Cow::Borrowed(segment);
    }
    Cow::Owned(try_decode(segment, Decoder::Component))
}

/// `decodeURIComponent`: `None` where it throws.
pub(crate) fn decode_component(text: &str) -> Option<String> {
    decode(text, Decoder::Component)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_dot_segments_as_the_url_standard_does() {
        for (path, collapsed) in [
            ("/api/spaces", "/api/spaces"),
            ("/api/./spaces", "/api/spaces"),
            ("/api/x/../spaces", "/api/spaces"),
            ("/api/%2E%2e/api/spaces", "/api/spaces"),
            ("/a/.", "/a/"),
            ("/a/b/..", "/a/"),
            ("/..", "/"),
            ("/../..", "/"),
            ("/a//./b", "/a//b"),
            ("/a.b/.c", "/a.b/.c"),
            ("*", "*"),
            ("/api\\spaces", "/api/spaces"),
            ("/api/x/..\\spaces", "/api/spaces"),
            ("/a\\..\\b", "/b"),
        ] {
            assert_eq!(collapse_dot_segments(path), collapsed, "{path}");
        }
    }

    #[test]
    fn routes_on_decode_uri_with_an_escaped_percent_kept() {
        for (path, routed) in [
            ("/api/%73paces", "/api/spaces"),
            ("/api/spaces%2Fx", "/api/spaces%2Fx"),
            ("/api/%2f%3B", "/api/%2f%3B"),
            ("/api/%2530", "/api/%2530"),
            ("/api/%C3%A9", "/api/é"),
            ("/api/%E9", "/api/%E9"),
            ("/api/%zz/%73", "/api/%zz/s"),
            ("/api/%E9/%73", "/api/%E9/s"),
            ("/api/%", "/api/%"),
        ] {
            assert_eq!(routing_path(path), routed, "{path}");
        }
    }

    #[test]
    fn decodes_a_parameter_as_decode_uri_component() {
        assert_eq!(parameter("%2Fx%25"), "/x%", "every escape");
        assert_eq!(parameter("%E9%41"), "%E9%41", "a run that is not UTF-8");
        assert_eq!(parameter("%E9-%41"), "%E9-A", "each run on its own");
        assert_eq!(decode_component("%zz"), None, "a malformed escape");
        assert_eq!(decode_component("%ED%A0%80"), None, "an encoded surrogate");
    }
}
