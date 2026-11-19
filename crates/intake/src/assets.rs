//! Assets (ADR 0106, ADR 0142): bytes outside the aggregate, named by the
//! SHA-256 of their content as 43 characters of unpadded base64url.

use sha2::{Digest, Sha256};

/// The largest asset the host stores, in bytes: 10 MiB.
pub const MAX_ASSET_BYTES: usize = 10 * 1024 * 1024;

/// The media type of bytes nothing names more precisely.
pub const OCTET_STREAM: &str = "application/octet-stream";

/// Whether `text` is an asset's name: 42 base64url characters and a last one
/// whose low two bits are clear, the only canonical spelling of a SHA-256.
#[must_use]
pub fn is_asset_hash(text: &str) -> bool {
    let bytes = text.as_bytes();
    let Some((last, head)) = bytes.split_last() else {
        return false;
    };
    head.len() == 42
        && head
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        && b"AEIMQUYcgkosw048".contains(last)
}

/// Whether `text` is an asset reference: `/assets/` and an asset's name.
#[must_use]
pub fn is_asset_ref(text: &str) -> bool {
    text.strip_prefix("/assets/").is_some_and(is_asset_hash)
}

/// The two spellings of bytes as base64 (RFC 4648) the host writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Base64 {
    /// `+` and `/`, padded with `=`: Node's `digest('base64')`, as a Content
    /// Security Policy hash is written.
    Standard,
    /// `-` and `_`, unpadded: Node's `base64url`, as an asset hash and a
    /// compact id are written.
    Url,
}

/// `bytes` spelled in `alphabet`.
#[must_use]
pub fn encode_base64(bytes: &[u8], alphabet: Base64) -> String {
    let (digits, padded): (&[u8; 64], bool) = match alphabet {
        Base64::Standard => (
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
            true,
        ),
        Base64::Url => (
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
            false,
        ),
    };
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk.first().copied().unwrap_or_default();
        let b1 = chunk.get(1).copied().unwrap_or_default();
        let b2 = chunk.get(2).copied().unwrap_or_default();
        let triple = (u32::from(b0) << 16) | (u32::from(b1) << 8) | u32::from(b2);
        for index in 0..=chunk.len() {
            let sextet = (triple >> (18 - 6 * index)) & 0x3f;
            out.push(char::from(
                digits.get(sextet as usize).copied().unwrap_or(b'A'),
            ));
        }
        if padded {
            out.extend(std::iter::repeat_n('=', 3 - chunk.len()));
        }
    }
    out
}

/// The name content-addressing gives `bytes`.
#[must_use]
pub fn asset_hash_of(bytes: &[u8]) -> String {
    encode_base64(&Sha256::digest(bytes), Base64::Url)
}

/// The hash a file name in `assets/` is named by, or `None` when Importing
/// does not own the file: a valid hash, alone or followed by a dot and any extension.
#[must_use]
pub fn asset_file_hash(name: &str) -> Option<&str> {
    let stem = name.split_once('.').map_or(name, |(stem, _)| stem);
    is_asset_hash(stem).then_some(stem)
}

/// The extension of an asset file's name, without its dot, or `""` when it has none.
#[must_use]
pub fn asset_file_extension(name: &str) -> &str {
    name.split_once('.').map_or("", |(_, extension)| extension)
}

/// The one table between file extensions and media types; the first listed
/// for a type is the one Export writes when it has no file name to keep.
const EXTENSION_MEDIA_TYPES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("webp", "image/webp"),
    ("gif", "image/gif"),
    ("avif", "image/avif"),
    ("svg", "image/svg+xml"),
    ("md", "text/markdown"),
    ("mmd", "text/vnd.mermaid"),
    ("txt", "text/plain"),
    ("csv", "text/csv"),
    ("html", "text/html"),
    ("css", "text/css"),
    ("js", "text/javascript"),
    ("json", "application/json"),
    ("pdf", "application/pdf"),
    ("mp4", "video/mp4"),
    ("webm", "video/webm"),
    ("mp3", "audio/mpeg"),
    ("woff2", "font/woff2"),
    ("bin", OCTET_STREAM),
];

/// The media type a file's extension names, ignoring case; an unlisted extension, or none, is `application/octet-stream`.
#[must_use]
pub fn media_type_for_extension(extension: &str) -> &'static str {
    EXTENSION_MEDIA_TYPES
        .iter()
        .find(|(listed, _)| listed.eq_ignore_ascii_case(extension))
        .map_or(OCTET_STREAM, |(_, media_type)| media_type)
}

/// The extension a media type is written with; an unlisted type is `bin`.
#[must_use]
pub fn extension_for_media_type(media_type: &str) -> &'static str {
    EXTENSION_MEDIA_TYPES
        .iter()
        .find(|(_, listed)| *listed == media_type)
        .map_or("bin", |(extension, _)| extension)
}

/// An asset an Aggregate directory's `assets/` carries, admitted: its name,
/// the media type its file's extension gives it, and its bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    /// The SHA-256 of its bytes, as its name.
    pub hash: String,
    /// Its media type's essence.
    pub media_type: &'static str,
    /// Its bytes.
    pub bytes: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spells_bytes_in_either_base64_as_node_does() {
        for (bytes, standard, url) in [
            (&b""[..], "", ""),
            (b"f", "Zg==", "Zg"),
            (b"fo", "Zm8=", "Zm8"),
            (b"foo", "Zm9v", "Zm9v"),
            (&[0xfb, 0xff, 0xfe][..], "+//+", "-__-"),
        ] {
            assert_eq!(
                encode_base64(bytes, Base64::Standard),
                standard,
                "{bytes:?}"
            );
            assert_eq!(encode_base64(bytes, Base64::Url), url, "{bytes:?}");
        }
    }

    #[test]
    fn names_zero_bytes_as_the_typescript_host_does() {
        assert_eq!(
            asset_hash_of(b""),
            "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
            "EMPTY_ASSET_HASH"
        );
        assert!(
            is_asset_hash(&asset_hash_of(b"one asset\n")),
            "every digest spells a hash"
        );
    }

    #[test]
    fn owns_a_file_named_by_a_hash_with_any_extension() {
        let hash = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
        assert_eq!(asset_file_hash(hash), Some(hash), "no extension");
        assert_eq!(
            asset_file_hash(&format!("{hash}.tar.gz")),
            Some(hash),
            "any extension"
        );
        assert_eq!(asset_file_hash("notes.md"), None, "a name not a hash");
        assert_eq!(
            asset_file_hash("47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFV"),
            None,
            "a last character with low bits set is no canonical hash"
        );
    }
}
