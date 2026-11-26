//! `DATABASE_URL`, as the PostgreSQL store is given it (ADR 0177): read once
//! by `main` before the runtime starts, the process environment winning and
//! the nearest `.env` at or above the current directory filling it when it is
//! unset, trimmed, and refused naming the variable when unset or blank. The
//! store reads no environment.
//!
//! The `.env` is read without writing the process environment, and nothing
//! but `DATABASE_URL` is taken from it. TypeScript's search starts at its
//! module's directory (`src/prisma/db.ts`), which a binary has not, so this
//! one starts where it is run: an accepted difference.

use std::path::{Path, PathBuf};

/// The variable naming the database.
pub const DATABASE_URL: &str = "DATABASE_URL";

/// A database URL that names something: trimmed, and not blank.
#[derive(Clone, PartialEq, Eq)]
pub struct DatabaseUrl(String);

impl std::fmt::Debug for DatabaseUrl {
    // A URL may carry a password, so it is never printed.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("DatabaseUrl(..)")
    }
}

/// Why no database URL was found.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DatabaseUrlError {
    /// Neither the environment nor a `.env` names one, or it is blank.
    #[error("DATABASE_URL must name the PostgreSQL database")]
    Unset,
    /// The nearest `.env` could not be read.
    #[error("the .env file {} could not be read: {reason}", path.display())]
    Unreadable {
        /// The file.
        path: PathBuf,
        /// Why.
        reason: String,
    },
}

impl DatabaseUrl {
    /// The URL `variable` names, or failing that the one the nearest `.env`
    /// at or above `from` names, trimmed.
    ///
    /// # Errors
    ///
    /// [`DatabaseUrlError::Unset`] when neither names one that is not blank,
    /// and [`DatabaseUrlError::Unreadable`] when the `.env` is consulted and
    /// cannot be read.
    pub fn resolve(variable: Option<String>, from: &Path) -> Result<Self, DatabaseUrlError> {
        let value = match variable {
            Some(value) => Some(value),
            None => match nearest_env_file(from) {
                Some(path) => from_env_file(&path)?,
                None => None,
            },
        };
        Self::parse(value.as_deref())
    }

    /// The URL `value` names, trimmed.
    ///
    /// # Errors
    ///
    /// [`DatabaseUrlError::Unset`] when `value` is absent or blank.
    pub fn parse(value: Option<&str>) -> Result<Self, DatabaseUrlError> {
        match value.map(str::trim) {
            Some(trimmed) if !trimmed.is_empty() => Ok(Self(trimmed.to_owned())),
            _ => Err(DatabaseUrlError::Unset),
        }
    }

    /// The URL, as text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The nearest `.env` at or above `from`, or `None` when no directory on the
/// way to the filesystem root holds one (`repositoryEnvPath`).
#[must_use]
pub fn nearest_env_file(from: &Path) -> Option<PathBuf> {
    from.ancestors()
        .map(|directory| directory.join(".env"))
        .find(|candidate| candidate.is_file())
}

/// `DATABASE_URL` as the `.env` at `path` names it, if it does.
fn from_env_file(path: &Path) -> Result<Option<String>, DatabaseUrlError> {
    let unreadable = |reason: String| DatabaseUrlError::Unreadable {
        path: path.to_path_buf(),
        reason,
    };
    let entries = dotenvy::from_path_iter(path).map_err(|error| unreadable(error.to_string()))?;
    let mut found = None;
    for entry in entries {
        let (key, value) = entry.map_err(|error| unreadable(error.to_string()))?;
        if key == DATABASE_URL {
            found = Some(value);
        }
    }
    Ok(found)
}
