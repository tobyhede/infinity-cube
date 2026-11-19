//! Where a talk is served from: one origin per talk under the application's
//! URI scheme, the same on every launch of that talk (spec, decision 4).
//!
//! A talk's key is the first 128 bits of the SHA-256 of its canonical folder
//! path, in lower-case hex. It needs no state: the shell already resolves a
//! folder to its canonical path, so the same folder gives the same key on
//! every launch, and two folders give two keys. An id the shell kept instead
//! would need a file mapping folders to ids, and could not live in the folder
//! itself, which only Export writes. Moving or renaming the folder gives the
//! talk a new key, and so a new origin, and what the page kept in
//! `localStorage` under the old one is not carried over. Hex is safe in a
//! host and in a scheme name, and names nothing of the path.
//!
//! On macOS and Linux the scheme is served as `infinitycube://<key>/`, so the
//! host part sets the origin and one scheme serves every talk. On Windows
//! Tauri serves a scheme from `http://<scheme>.localhost/`, dropping the host
//! part from the origin, so each talk gets a scheme of its own,
//! `infinitycube-<key>`, served from `http://infinitycube-<key>.localhost/`.

use std::path::Path;

use sha2::{Digest as _, Sha256};
use url::Url;

/// The scheme every talk is served under, or the prefix of each talk's own
/// scheme where a scheme sets the origin.
pub const SCHEME: &str = "infinitycube";

/// The key of one talk: 32 lower-case hex digits.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TalkKey(String);

const KEY_LENGTH: usize = 32;

impl TalkKey {
    /// The key of the talk in `directory`, which should be canonical.
    #[must_use]
    pub fn of(directory: &Path) -> Self {
        let digest = Sha256::digest(directory.as_os_str().as_encoded_bytes());
        let mut key = String::with_capacity(KEY_LENGTH);
        for byte in digest.iter().take(KEY_LENGTH / 2) {
            key.push_str(&format!("{byte:02x}"));
        }
        Self(key)
    }

    /// The key `text` spells, or `None` if it spells none.
    fn parse(text: &str) -> Option<Self> {
        let well_formed = text.len() == KEY_LENGTH
            && text
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
        well_formed.then(|| Self(text.to_owned()))
    }

    /// The key as text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// How the webview turns a scheme into an origin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemeStyle {
    /// `scheme://host/`, the host part in the origin: macOS and Linux.
    HostPerTalk,
    /// `http://<scheme>.localhost/`, the scheme in the origin: Windows.
    SchemePerTalk,
}

impl SchemeStyle {
    /// This platform's.
    pub const CURRENT: Self = if cfg!(windows) {
        Self::SchemePerTalk
    } else {
        Self::HostPerTalk
    };
}

/// One talk's address under the scheme.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TalkAddress {
    key: TalkKey,
    style: SchemeStyle,
}

impl TalkAddress {
    /// The address of the talk with `key`, as `style` serves it.
    #[must_use]
    pub fn new(key: TalkKey, style: SchemeStyle) -> Self {
        Self { key, style }
    }

    /// The talk's key.
    #[must_use]
    pub fn key(&self) -> &TalkKey {
        &self.key
    }

    /// The scheme the talk is served under, which the shell registers.
    #[must_use]
    pub fn scheme(&self) -> String {
        match self.style {
            SchemeStyle::HostPerTalk => SCHEME.to_owned(),
            SchemeStyle::SchemePerTalk => format!("{SCHEME}-{}", self.key.as_str()),
        }
    }

    /// The talk's origin as its page and the `Origin` header name it.
    #[must_use]
    pub fn origin(&self) -> String {
        match self.style {
            SchemeStyle::HostPerTalk => format!("{SCHEME}://{}", self.key.as_str()),
            SchemeStyle::SchemePerTalk => format!("http://{}.localhost", self.scheme()),
        }
    }

    /// The address a talk window opens at, as the shell hands it to Tauri.
    ///
    /// # Errors
    ///
    /// None in practice: the key is hex, which every URL admits.
    pub fn window_url(&self) -> Result<Url, url::ParseError> {
        match self.style {
            SchemeStyle::HostPerTalk => Url::parse(&format!("{}/", self.origin())),
            SchemeStyle::SchemePerTalk => Url::parse(&format!("{}://localhost/", self.scheme())),
        }
    }

    /// Whether a window of this talk may navigate to `url`: only within the
    /// talk's own origin, as the webview reports it.
    #[must_use]
    pub fn admits(&self, url: &Url) -> bool {
        // A URL of a scheme the URL standard does not know has an opaque
        // origin, which equals no other, so the parts are compared instead.
        let (scheme, host) = match self.style {
            SchemeStyle::HostPerTalk => (SCHEME.to_owned(), self.key.as_str().to_owned()),
            SchemeStyle::SchemePerTalk => {
                ("http".to_owned(), format!("{}.localhost", self.scheme()))
            }
        };
        url.scheme() == scheme
            && url.host_str() == Some(host.as_str())
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
    }

    /// The key of the talk a request to the scheme handler names, as the
    /// webview hands it over: `infinitycube://<key>/…` where the host sets
    /// the origin, `infinitycube-<key>://localhost/…` where the scheme does.
    #[must_use]
    pub fn key_of(uri: &http::Uri, style: SchemeStyle) -> Option<TalkKey> {
        match style {
            SchemeStyle::HostPerTalk => {
                if uri.scheme_str() != Some(SCHEME) || uri.port().is_some() {
                    return None;
                }
                TalkKey::parse(uri.host()?)
            }
            SchemeStyle::SchemePerTalk => {
                let key = uri.scheme_str()?.strip_prefix(SCHEME)?.strip_prefix('-')?;
                (uri.host() == Some("localhost") && uri.port().is_none())
                    .then(|| TalkKey::parse(key))
                    .flatten()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rust_talk(style: SchemeStyle) -> TalkAddress {
        TalkAddress::new(TalkKey::of(Path::new("/talks/rust")), style)
    }

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap_or_else(|error| unreachable!("{text} is a URL: {error}"))
    }

    fn uri(text: &str) -> http::Uri {
        text.parse()
            .unwrap_or_else(|error| unreachable!("{text} is a URI: {error}"))
    }

    mod a_talks_key {
        use super::*;

        #[test]
        fn is_the_first_half_of_the_sha256_of_its_folder_path() {
            // `printf '/talks/rust' | sha256sum | cut -c1-32`
            assert_eq!(
                TalkKey::of(Path::new("/talks/rust")).as_str(),
                "9b684d84a4976d0f4e7893a2dbd4b781",
                "the key should be the path's hash, so it is the same on every launch"
            );
        }

        #[test]
        fn differs_between_two_folders() {
            assert_ne!(
                TalkKey::of(Path::new("/talks/rust")),
                TalkKey::of(Path::new("/talks/go")),
                "two talks should have two keys, and so two origins"
            );
        }
    }

    mod where_the_host_sets_the_origin {
        use super::*;

        #[test]
        fn a_talk_is_served_from_its_key_under_the_one_scheme() {
            let address = rust_talk(SchemeStyle::HostPerTalk);
            assert_eq!(
                address.scheme(),
                "infinitycube",
                "one scheme for every talk"
            );
            assert_eq!(
                address.origin(),
                "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781",
                "the key in the host part"
            );
            assert_eq!(
                address.window_url().ok(),
                Some(url("infinitycube://9b684d84a4976d0f4e7893a2dbd4b781/")),
                "the window opens at the origin's root"
            );
        }

        #[test]
        fn two_talks_have_two_origins() {
            let go = TalkAddress::new(
                TalkKey::of(Path::new("/talks/go")),
                SchemeStyle::HostPerTalk,
            );
            assert_ne!(
                rust_talk(SchemeStyle::HostPerTalk).origin(),
                go.origin(),
                "two talks presenting at once should not share an origin"
            );
        }

        #[test]
        fn a_window_navigates_only_within_its_talk() {
            let address = rust_talk(SchemeStyle::HostPerTalk);
            assert!(
                address.admits(&url(
                    "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781/spaces/x/notes?y#z"
                )),
                "its own talk"
            );
            for elsewhere in [
                "https://example.com/",
                "http://127.0.0.1:4173/",
                "infinitycube://1e50ea2898230c692168cebfd93c5959/",
                "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781:8080/",
                "infinitycube://user@9b684d84a4976d0f4e7893a2dbd4b781/",
                "file:///etc/passwd",
                "about:blank",
            ] {
                assert!(
                    !address.admits(&url(elsewhere)),
                    "{elsewhere} should be refused"
                );
            }
        }

        #[test]
        fn a_request_names_its_talk_by_the_host() {
            let key = TalkKey::of(Path::new("/talks/rust"));
            assert_eq!(
                TalkAddress::key_of(
                    &uri("infinitycube://9b684d84a4976d0f4e7893a2dbd4b781/api/spaces"),
                    SchemeStyle::HostPerTalk
                ),
                Some(key),
                "the host is the key"
            );
            for other in [
                "infinitycube://localhost/",
                "infinitycube://9B684D84A4976D0F4E7893A2DBD4B781/",
                "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781:1/",
                "other://9b684d84a4976d0f4e7893a2dbd4b781/",
                "/api/spaces",
            ] {
                assert_eq!(
                    TalkAddress::key_of(&uri(other), SchemeStyle::HostPerTalk),
                    None,
                    "{other} names no talk"
                );
            }
        }
    }

    mod where_the_scheme_sets_the_origin {
        use super::*;

        #[test]
        fn a_talk_has_a_scheme_of_its_own_served_from_localhost() {
            let address = rust_talk(SchemeStyle::SchemePerTalk);
            assert_eq!(
                address.scheme(),
                "infinitycube-9b684d84a4976d0f4e7893a2dbd4b781",
                "a scheme per talk, named stably from it"
            );
            assert_eq!(
                address.origin(),
                "http://infinitycube-9b684d84a4976d0f4e7893a2dbd4b781.localhost",
                "the origin Tauri serves that scheme from"
            );
            assert_eq!(
                address.window_url().ok(),
                Some(url(
                    "infinitycube-9b684d84a4976d0f4e7893a2dbd4b781://localhost/"
                )),
                "the address Tauri rewrites to that origin"
            );
            assert!(
                address.admits(&url(
                    "http://infinitycube-9b684d84a4976d0f4e7893a2dbd4b781.localhost/spaces/x"
                )),
                "its own talk, as the webview reports it"
            );
            assert!(
                !address.admits(&url("http://infinitycube.localhost/")),
                "not another scheme"
            );
        }

        #[test]
        fn a_request_names_its_talk_by_the_scheme() {
            assert_eq!(
                TalkAddress::key_of(
                    &uri("infinitycube-9b684d84a4976d0f4e7893a2dbd4b781://localhost/api/spaces"),
                    SchemeStyle::SchemePerTalk
                ),
                Some(TalkKey::of(Path::new("/talks/rust"))),
                "the scheme carries the key"
            );
            assert_eq!(
                TalkAddress::key_of(
                    &uri("infinitycube-9b684d84a4976d0f4e7893a2dbd4b781://elsewhere/"),
                    SchemeStyle::SchemePerTalk
                ),
                None,
                "only localhost"
            );
        }
    }
}
