//! The SQLite file a host serves (Storage ST-126): `SQLITE_PATH`, read as
//! `configuredSqlitePath` in `src/sqlite/db.ts` reads it for a host, with the
//! same refusals in the same words.

use std::path::{Component, Path, PathBuf};

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
        let given = Path::new(value);
        if !given.is_absolute() {
            return Err(SqlitePathError::Relative(value.to_owned()));
        }
        let path = lexically_normal(given);
        let parent = path.parent().unwrap_or(&path);
        if !writable_directory(parent) {
            return Err(SqlitePathError::UnwritableParent(parent.to_path_buf()));
        }
        Ok(Self(path))
    }

    /// The file.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        &self.0
    }
}

/// `path` with each `.` dropped and each `..` taking the name before it away,
/// reading no file, as `resolve` normalizes an absolute path: the file named
/// need not exist, and a `..` at the root stays at the root.
fn lexically_normal(path: &Path) -> PathBuf {
    let mut normal = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normal.pop();
            }
            other => normal.push(other),
        }
    }
    normal
}

/// Whether `directory` is a directory this process may write in, asked of
/// `access(2)` with `W_OK` as `accessSync(parent, constants.W_OK)` asks it: the
/// running user's permission, not whether any write bit is set, so a
/// directory only its owner may write is refused to everyone else.
#[cfg(unix)]
fn writable_directory(directory: &Path) -> bool {
    std::fs::metadata(directory).is_ok_and(|metadata| metadata.is_dir())
        && rustix::fs::access(directory, rustix::fs::Access::WRITE_OK).is_ok()
}

/// Whether `directory` is a directory. On Windows `accessSync(parent,
/// constants.W_OK)` asks no more: libuv's `fs__access` answers any directory
/// as writable, a directory's read-only attribute not being one Windows
/// honours, so a read-only attribute is not read here either.
#[cfg(not(unix))]
fn writable_directory(directory: &Path) -> bool {
    std::fs::metadata(directory).is_ok_and(|metadata| metadata.is_dir())
}
