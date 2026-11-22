//! The SQLite file a host serves (Storage ST-126): `SQLITE_PATH`, read as
//! `configuredSqlitePath` in `src/sqlite/db.ts` reads it for a host, with the
//! same refusals in the same words.

use std::path::{Path, PathBuf};

/// Why `SQLITE_PATH` names no file a host can serve, each in the words the
/// TypeScript host uses.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum SqlitePathError {
    /// Unset, or blank once trimmed.
    #[error("SQLITE_PATH must name the SQLite database file")]
    Unset,
    /// Not an absolute path; the trimmed value.
    #[error("SQLITE_PATH must be an absolute path: {0}")]
    Relative(String),
    /// The file's parent directory is missing, or cannot be written.
    #[error("SQLite parent directory is missing or unwritable: {}", .0.display())]
    UnwritableParent(PathBuf),
}

/// An absolute path to a SQLite file whose parent directory exists and can be
/// written. The file itself need not exist: refusing a missing file is the
/// CLI's rule alone, and opening the repository creates nothing.
///
/// # Examples
///
/// ```
/// use host::{SqlitePath, SqlitePathError};
///
/// assert_eq!(SqlitePath::from_variable(Some("  ")), Err(SqlitePathError::Unset));
/// assert_eq!(
///     SqlitePath::from_variable(Some("cube.db")).map_err(|error| error.to_string()),
///     Err("SQLITE_PATH must be an absolute path: cube.db".to_owned()),
/// );
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SqlitePath(PathBuf);

impl SqlitePath {
    /// The file `SQLITE_PATH`'s value names, trimmed.
    ///
    /// # Errors
    ///
    /// [`SqlitePathError`]: the value is unset or blank, is relative, or names
    /// a file whose parent directory is missing or cannot be written.
    pub fn from_variable(value: Option<&str>) -> Result<Self, SqlitePathError> {
        let value = value.map(str::trim).unwrap_or_default();
        if value.is_empty() {
            return Err(SqlitePathError::Unset);
        }
        let path = Path::new(value);
        if !path.is_absolute() {
            return Err(SqlitePathError::Relative(value.to_owned()));
        }
        let parent = path.parent().unwrap_or(path);
        let writable = std::fs::metadata(parent)
            .is_ok_and(|metadata| metadata.is_dir() && !metadata.permissions().readonly());
        if !writable {
            return Err(SqlitePathError::UnwritableParent(parent.to_path_buf()));
        }
        Ok(Self(path.to_path_buf()))
    }

    /// The file.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        &self.0
    }
}
