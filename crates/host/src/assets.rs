//! The asset store the host keeps beside Spaces and outside the aggregate
//! (ADR 0106, ADR 0142): what an asset is, how its bytes are named and
//! admitted, and the media type each is served as
//! (`packages/persistence/src/assets.ts`).

use std::fmt;

use bytes::Bytes;
use intake::assets::{OCTET_STREAM, asset_hash_of, extension_for_media_type, is_asset_hash};

pub use intake::assets::MAX_ASSET_BYTES;

/// The hash of the asset of zero bytes, which every store holds.
pub const EMPTY_ASSET_HASH: &str = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

/// The SHA-256 of an asset's bytes as 43 characters of unpadded base64url:
/// its name, and the last segment of its URL.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AssetHash(String);

impl AssetHash {
    /// The hash `text` spells, or `None` when it is not the canonical
    /// spelling of a SHA-256.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        is_asset_hash(text).then(|| Self(text.to_owned()))
    }

    /// The hash content addressing gives `bytes`.
    #[must_use]
    pub fn of(bytes: &[u8]) -> Self {
        Self(asset_hash_of(bytes))
    }

    /// The hash as written.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The asset's root-relative URL, `/assets/<hash>`.
    #[must_use]
    pub fn path(&self) -> String {
        format!("/assets/{}", self.0)
    }

    /// Whether this is the hash of zero bytes.
    #[must_use]
    pub fn is_empty_asset(&self) -> bool {
        self.0 == EMPTY_ASSET_HASH
    }
}

impl fmt::Display for AssetHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A stored asset: its hash, the media type it was stored as, and its bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredAsset {
    /// The SHA-256 of its bytes.
    pub hash: AssetHash,
    /// A media type's essence, lower case and without parameters.
    pub media_type: String,
    /// Its bytes, shared rather than copied.
    pub bytes: Bytes,
}

impl StoredAsset {
    /// The asset of zero bytes, `application/octet-stream`.
    #[must_use]
    pub fn empty() -> Self {
        Self {
            hash: AssetHash(EMPTY_ASSET_HASH.to_owned()),
            media_type: OCTET_STREAM.to_owned(),
            bytes: Bytes::new(),
        }
    }

    /// Admit `bytes` as an asset under the media type they were declared
    /// with: any type is admitted, zero bytes too; `None` over the 10 MiB cap.
    #[must_use]
    pub fn admit(bytes: Bytes, declared_type: &str) -> Option<Self> {
        (bytes.len() <= MAX_ASSET_BYTES).then(|| Self {
            hash: AssetHash::of(&bytes),
            media_type: normalize_media_type(declared_type),
            bytes,
        })
    }

    /// Its file name in `assets/` when Export has none to keep:
    /// `<hash>.<extension>`, the extension the host table gives its type.
    #[must_use]
    pub fn file_name(&self) -> String {
        format!(
            "{}.{}",
            self.hash,
            extension_for_media_type(&self.media_type)
        )
    }
}

fn is_token_byte(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"!#$&^_.+-".contains(&byte)
}

/// A declared media type's essence, trimmed as `String#trim` trims, lower case
/// and without parameters, or `application/octet-stream` when nothing usable
/// is declared.
#[must_use]
pub fn normalize_media_type(declared: &str) -> String {
    let essence = declared
        .split(';')
        .next()
        .unwrap_or_default()
        .trim_matches(intake::text::is_js_whitespace)
        .to_lowercase();
    let usable = essence.split_once('/').is_some_and(|(kind, sub)| {
        !kind.is_empty()
            && !sub.is_empty()
            && kind.bytes().all(is_token_byte)
            && sub.bytes().all(is_token_byte)
    });
    if usable {
        essence
    } else {
        OCTET_STREAM.to_owned()
    }
}

/// The media type a stored asset is served under: a PNG, JPEG, WebP or GIF
/// keeps its type, and every other asset is inert bytes.
#[must_use]
pub fn served_media_type(media_type: &str) -> &str {
    match media_type {
        "image/png" | "image/jpeg" | "image/webp" | "image/gif" => media_type,
        _ => OCTET_STREAM,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_a_declared_type_to_its_essence() {
        for (declared, expected) in [
            ("image/PNG; charset=x", "image/png"),
            ("  text/markdown ", "text/markdown"),
            ("", OCTET_STREAM),
            ("not a type", OCTET_STREAM),
            ("a/b/c", OCTET_STREAM),
            ("image/png\u{85}", OCTET_STREAM),
            ("\u{feff}image/png", "image/png"),
        ] {
            assert_eq!(normalize_media_type(declared), expected, "{declared:?}");
        }
    }

    #[test]
    fn serves_only_pictures_as_themselves() {
        assert_eq!(served_media_type("image/gif"), "image/gif", "a picture");
        assert_eq!(
            served_media_type("image/svg+xml"),
            OCTET_STREAM,
            "SVG runs script"
        );
        assert_eq!(
            served_media_type("text/html"),
            OCTET_STREAM,
            "HTML runs script"
        );
    }

    #[test]
    fn names_zero_bytes_by_the_empty_hash() {
        assert!(AssetHash::of(b"").is_empty_asset(), "the hash of nothing");
        assert_eq!(
            StoredAsset::empty().file_name(),
            format!("{EMPTY_ASSET_HASH}.bin"),
            "bin"
        );
    }
}
