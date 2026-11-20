//! Where an Aggregate is served from: one origin per Aggregate under the application's
//! URI scheme, the same on every launch of that Aggregate (Storage ST-121).
//!
//! An Aggregate's key is the first 128 bits of the SHA-256 of its canonical folder
//! path, in lower-case hex. It needs no state: the shell already resolves a
//! folder to its canonical path, so the same folder gives the same key on
//! every launch, and two folders give two keys. Moving or renaming the folder gives the
//! Aggregate a new key, and so a new origin, and what the page kept in
//! `localStorage` under the old one is not carried over. Hex is safe in a
//! host and in a scheme name, and names nothing of the path.
//!
//! On macOS and Linux the scheme is served as `infinitycube://<key>/`, so the
//! host part sets the origin and one scheme serves every Aggregate. On Windows
//! Tauri serves a scheme from `http://<scheme>.localhost/`, dropping the host
//! part from the origin, so each Aggregate gets a scheme of its own,
//! `infinitycube-<key>`, served from `http://infinitycube-<key>.localhost/`.

use std::path::Path;

use sha2::{Digest as _, Sha256};
use url::Url;

/// The scheme every Aggregate is served under, or the prefix of each Aggregate's own
/// scheme where a scheme sets the origin.
pub const SCHEME: &str = "infinitycube";

/// The key of one Aggregate: 32 lower-case hex digits.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AggregateKey(String);

const KEY_LENGTH: usize = 32;

impl AggregateKey {
    /// The key of the Aggregate in `directory`, which should be canonical.
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
    HostPerAggregate,
    /// `http://<scheme>.localhost/`, the scheme in the origin: Windows.
    SchemePerAggregate,
}

impl SchemeStyle {
    /// This platform's.
    pub const CURRENT: Self = if cfg!(windows) {
        Self::SchemePerAggregate
    } else {
        Self::HostPerAggregate
    };
}

/// One Aggregate's address under the scheme.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AggregateAddress {
    key: AggregateKey,
    style: SchemeStyle,
}

impl AggregateAddress {
    /// The address of the Aggregate with `key`, as `style` serves it.
    #[must_use]
    pub fn new(key: AggregateKey, style: SchemeStyle) -> Self {
        Self { key, style }
    }

    /// The Aggregate's key.
    #[must_use]
    pub fn key(&self) -> &AggregateKey {
        &self.key
    }

    /// The scheme the Aggregate is served under, which the shell registers.
    #[must_use]
    pub fn scheme(&self) -> String {
        match self.style {
            SchemeStyle::HostPerAggregate => SCHEME.to_owned(),
            SchemeStyle::SchemePerAggregate => format!("{SCHEME}-{}", self.key.as_str()),
        }
    }

    /// The Aggregate's origin as its page and the `Origin` header name it.
    #[must_use]
    pub fn origin(&self) -> String {
        match self.style {
            SchemeStyle::HostPerAggregate => format!("{SCHEME}://{}", self.key.as_str()),
            SchemeStyle::SchemePerAggregate => format!("http://{}.localhost", self.scheme()),
        }
    }

    /// The address a Space window opens at, as the shell hands it to Tauri.
    ///
    /// # Errors
    ///
    /// None in practice: the key is hex, which every URL admits.
    pub fn window_url(&self) -> Result<Url, url::ParseError> {
        match self.style {
            SchemeStyle::HostPerAggregate => Url::parse(&format!("{}/", self.origin())),
            SchemeStyle::SchemePerAggregate => {
                Url::parse(&format!("{}://localhost/", self.scheme()))
            }
        }
    }

    /// Whether a window of this Aggregate may navigate to `url`: only within the
    /// Aggregate's own origin, as the webview reports it.
    #[must_use]
    pub fn admits(&self, url: &Url) -> bool {
        // A URL of a scheme the URL standard does not know has an opaque
        // origin, which equals no other, so the parts are compared instead.
        let (scheme, host) = match self.style {
            SchemeStyle::HostPerAggregate => (SCHEME.to_owned(), self.key.as_str().to_owned()),
            SchemeStyle::SchemePerAggregate => {
                ("http".to_owned(), format!("{}.localhost", self.scheme()))
            }
        };
        url.scheme() == scheme
            && url.host_str() == Some(host.as_str())
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
    }

    /// The key of the Aggregate a request to the scheme handler names, as the
    /// webview hands it over: `infinitycube://<key>/…` where the host sets
    /// the origin, `infinitycube-<key>://localhost/…` where the scheme does.
    #[must_use]
    pub fn key_of(uri: &http::Uri, style: SchemeStyle) -> Option<AggregateKey> {
        match style {
            SchemeStyle::HostPerAggregate => {
                if uri.scheme_str() != Some(SCHEME) || uri.port().is_some() {
                    return None;
                }
                AggregateKey::parse(uri.host()?)
            }
            SchemeStyle::SchemePerAggregate => {
                let key = uri.scheme_str()?.strip_prefix(SCHEME)?.strip_prefix('-')?;
                (uri.host() == Some("localhost") && uri.port().is_none())
                    .then(|| AggregateKey::parse(key))
                    .flatten()
            }
        }
    }
}

#[cfg(test)]
mod tests;
