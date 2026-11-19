//! The Image plugin (ADR 0106, ADR 0142): a picture shown from a URL it owns,
//! `http:`, `https:` or a stored asset, with its natural size when known.
//! `packages/plugin-image/src/domain.ts`.

use super::Plugin;
use crate::assets::is_asset_ref;
use crate::json::JsonValue;
use crate::refusal::ShapeProblem;
use crate::shape::{Checker, NumberCheck, Parsed, Status, Strictness, optional};

/// The Image plugin.
pub(crate) struct Image;

/// Whether an Image Resource may hold this URL: an asset reference, or a URL
/// the WHATWG parser accepts whose scheme is `https:` or `http:`.
pub(crate) fn is_accepted_image_url(url: &str) -> bool {
    if url.starts_with('/') {
        return is_asset_ref(url);
    }
    url::Url::parse(url).is_ok_and(|parsed| matches!(parsed.scheme(), "https" | "http"))
}

fn check_natural_size<'a>(checker: &mut Checker<'a>, value: &'a JsonValue) -> Parsed<()> {
    let Some(mut object) = checker.object(Some(value), &["width", "height"], Strictness::Strict)
    else {
        return Parsed::Aborted;
    };
    for key in ["width", "height"] {
        let member = object.get(key);
        let parsed = checker.key(key, |c| {
            c.number(member, &[NumberCheck::Positive, NumberCheck::Finite])
        });
        object.take(parsed);
    }
    object.finish(|| Some(()))
}

impl Plugin for Image {
    fn kind(&self) -> &'static str {
        "image"
    }

    fn check_content<'a>(
        &self,
        checker: &mut Checker<'a>,
        content: Option<&'a JsonValue>,
    ) -> Status {
        let Some(mut object) = checker.object(content, &["url", "naturalSize"], Strictness::Strict)
        else {
            return Status::Aborted;
        };
        let url = object.get("url");
        let parsed = checker.key("url", |c| {
            let text = c.string(url);
            c.refine(
                text,
                |text| is_accepted_image_url(text),
                || ShapeProblem::Custom("An image URL must be https:, http:, or a stored asset."),
            )
        });
        object.take(parsed);
        let natural_size = object.get("naturalSize");
        let parsed = checker.key("naturalSize", |c| {
            optional(c, natural_size, check_natural_size)
        });
        object.take(parsed);
        object.status()
    }

    fn check_map_content<'a>(&self, checker: &mut Checker<'a>, value: &'a JsonValue) -> Status {
        checker
            .object(Some(value), &[], Strictness::Strict)
            .map_or(Status::Aborted, |object| object.status())
    }

    fn may_be_target(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_web_and_asset_urls_only() {
        for url in [
            "https://example.com/a.png",
            "http://example.com",
            "HTTPS://EXAMPLE.COM/x",
            "/assets/n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg",
        ] {
            assert!(is_accepted_image_url(url), "{url} should be accepted");
        }
        for url in [
            "data:image/png;base64,AAAA",
            "ftp://example.com/a.png",
            "https://",
            "//example.com/a.png",
            "/a.png",
            "a.png",
        ] {
            assert!(!is_accepted_image_url(url), "{url} should be refused");
        }
    }
}
