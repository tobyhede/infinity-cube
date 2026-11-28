//! A Space window opened on a database rather than a folder (ADR 0181): a
//! SQLite file, or a PostgreSQL database named by a URL.
//!
//! Each is keyed, for its origin ([`crate::address`]), by the first 128 bits
//! of the SHA-256 of what [`Database::place`] spells: `sqlite:` and the
//! file's canonical path, or `postgres:` and the database's identity, its
//! user, host in lower case, port (5432 when none is named) and database
//! name as the connection resolves them, each percent-encoded so that no two
//! identities spell one text. A folder is keyed by its path alone, and no
//! canonical path begins `sqlite:` or `postgres:`, so no folder's origin
//! moves and no two kinds share one. The password, TLS settings and every
//! other parameter are no part of the key.
//!
//! A PostgreSQL database is named, wherever it is shown or kept, by its URL
//! with the user-info password and every `password` parameter dropped; the
//! URL it is connected with, which may hold a password, is never printed.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use host::DatabaseUrl;
use url::Url;

use crate::address::AggregateKey;

/// A database a Space window opens on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Database {
    /// A SQLite file, by its canonical path.
    SqliteFile(PathBuf),
    /// A PostgreSQL database.
    Postgres(PostgresDatabase),
}

impl Database {
    /// The SQLite file at `path`, by its canonical path when it resolves.
    #[must_use]
    pub fn sqlite_file(path: &Path) -> Self {
        Self::SqliteFile(std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()))
    }

    /// What its key hashes, and what the registry of open Spaces and a
    /// close's question name it by: `sqlite:` and the file's path, or
    /// `postgres:` and the database's identity. It holds no password.
    #[must_use]
    pub fn place(&self) -> PathBuf {
        let mut place = OsString::new();
        match self {
            Self::SqliteFile(path) => {
                place.push("sqlite:");
                place.push(path.as_os_str());
            }
            Self::Postgres(database) => {
                place.push("postgres:");
                place.push(&database.identity);
            }
        }
        PathBuf::from(place)
    }

    /// The key of its origin.
    #[must_use]
    pub fn key(&self) -> AggregateKey {
        AggregateKey::of(&self.place())
    }

    /// How a dialog names it, with no password.
    #[must_use]
    pub fn named(&self) -> String {
        match self {
            Self::SqliteFile(path) => format!("the SQLite file {}", path.display()),
            Self::Postgres(database) => {
                format!("the PostgreSQL database {}", database.kept_url())
            }
        }
    }

    /// Its Space window's title: the file's name, or the database's.
    #[must_use]
    pub fn title(&self) -> String {
        match self {
            Self::SqliteFile(path) => path.file_name().map_or_else(
                || path.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            ),
            Self::Postgres(database) => database.database.clone(),
        }
    }
}

/// A PostgreSQL database, as the Start window's form named it.
#[derive(Clone, PartialEq, Eq)]
pub struct PostgresDatabase {
    /// The URL with no password.
    kept: String,
    /// `user@host:port/database`, each part percent-encoded.
    identity: String,
    /// The database's name, as the connection resolves it.
    database: String,
    /// The URL connected with, which may hold a password.
    connect: DatabaseUrl,
}

impl std::fmt::Debug for PostgresDatabase {
    // The URL connected with may hold a password, so only the kept one shows.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PostgresDatabase")
            .field("kept", &self.kept)
            .finish_non_exhaustive()
    }
}

/// Why a URL names no database the shell can connect to, in words that
/// hold no part of the URL.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NotConnected {
    /// The form named no URL.
    #[error("Name the PostgreSQL database by its URL.")]
    Blank,
    /// The URL is not one the PostgreSQL repository connects to.
    #[error("The URL is not one InfinityCube can connect to: {0}")]
    Invalid(String),
}

/// `text` with its first letter in upper case, to begin a sentence with
/// what [`Database::named`] answers.
#[must_use]
pub fn capitalized(text: &str) -> String {
    let mut letters = text.chars();
    letters.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(letters).collect()
    })
}

/// `text` percent-encoded, so `@`, `:` and `/` in it separate nothing.
fn encoded(text: &str) -> String {
    url::form_urlencoded::byte_serialize(text.as_bytes()).collect()
}

/// `url` without its user-info password or any `password` parameter.
fn without_password(url: &Url) -> Url {
    let mut kept = url.clone();
    // A URL with a host always takes an empty password.
    let _taken = kept.set_password(None);
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(name, _)| name != "password")
        .map(|(name, value)| (name.into_owned(), value.into_owned()))
        .collect();
    if pairs.is_empty() {
        kept.set_query(None);
    } else {
        let _pairs = kept.query_pairs_mut().clear().extend_pairs(pairs);
    }
    kept
}

impl PostgresDatabase {
    /// The database the Start window's form names: `url`, connected with
    /// `password` when one is given, which then replaces any the URL holds.
    /// With none, the connection takes one from where PostgreSQL's clients
    /// find it (`PGPASSWORD` and the password file).
    ///
    /// # Errors
    ///
    /// [`NotConnected`]: the URL is blank, or is not one the PostgreSQL
    /// repository connects to.
    pub fn from_form(url: &str, password: &str) -> Result<Self, NotConnected> {
        let given = DatabaseUrl::parse(Some(url)).map_err(|_| NotConnected::Blank)?;
        // A parse error names what is wrong, never the text it read.
        let mut parsed =
            Url::parse(given.as_str()).map_err(|error| NotConnected::Invalid(error.to_string()))?;
        if !password.is_empty() {
            parsed = without_password(&parsed);
            parsed.set_password(Some(password)).map_err(|()| {
                NotConnected::Invalid("it names no host to take a password for".to_owned())
            })?;
        }
        let connect = DatabaseUrl::parse(Some(parsed.as_str())).map_err(|_| NotConnected::Blank)?;
        let options = host::postgres_connect_options(connect.as_str(), None).map_err(|error| {
            NotConnected::Invalid(error.to_string().replacen("DATABASE_URL", "the URL", 1))
        })?;
        let user = options.get_username().to_owned();
        let host = options.get_socket().map_or_else(
            || options.get_host().to_ascii_lowercase(),
            |socket| socket.display().to_string(),
        );
        let database = options.get_database().unwrap_or(&user).to_owned();
        let identity = format!(
            "{}@{}:{}/{}",
            encoded(&user),
            encoded(&host),
            options.get_port(),
            encoded(&database)
        );
        Ok(Self {
            kept: without_password(&parsed).to_string(),
            identity,
            database,
            connect,
        })
    }

    /// Its URL with no password, as it is shown and kept.
    #[must_use]
    pub fn kept_url(&self) -> &str {
        &self.kept
    }

    /// The URL it is connected with, which may hold a password.
    #[must_use]
    pub fn connect_url(&self) -> &DatabaseUrl {
        &self.connect
    }
}

#[cfg(test)]
mod tests;
