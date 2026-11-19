//! The lock a run holds on its Aggregate directory (ADR 0162,
//! `src/run/directory-lock.ts`), so a second run of the directory, in this
//! process or another, Rust or Node, is refused rather than writing over the
//! first.
//!
//! The lock is SQLite's own exclusive lock on [`LOCK_FILE_NAME`], taken by an
//! exclusive transaction that is never committed, so the file stays empty.
//! Node's host takes it through `node:sqlite` in the same way, and SQLite
//! keeps one locking protocol across its builds, so the two runtimes exclude
//! each other: `crates/cli/tests/run.rs`,
//! `given_a_directory_a_node_run_holds` and `given_a_directory_this_binary_runs`.
//! The operating system releases the lock when the process ends, however it
//! ends, so a crash leaves no stale lock.

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::{Connection, ErrorCode, OpenFlags};

/// The file in an Aggregate directory whose lock a run holds. It is a
/// dot-entry, so a directory holding it and nothing else is still empty, and
/// Import and Export read and write only the names Import owns, so neither
/// opens it. It is never deleted: a process that opened the old file could
/// otherwise lock it while another locks a new one.
pub const LOCK_FILE_NAME: &str = ".infinity-cube.lock";

/// Why a directory's lock was not taken.
#[derive(Debug)]
pub(crate) enum LockError {
    /// Another run holds it.
    Held,
    /// Anything else: a directory that cannot hold the file, or a file of
    /// that name that is not SQLite's.
    Failed(String),
}

/// A held lock on an Aggregate directory, released when it is dropped. The
/// connection is only ever closed, so the mutex is never locked; it makes the
/// lock shareable across the writer's awaits.
pub(crate) struct DirectoryLock {
    _connection: Mutex<Connection>,
}

impl std::fmt::Debug for DirectoryLock {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DirectoryLock").finish_non_exhaustive()
    }
}

impl DirectoryLock {
    /// Lock `directory`, answering at once, with no busy timeout, when
    /// another run holds it.
    pub(crate) fn take(directory: &Path) -> Result<Self, LockError> {
        let failed = |error: rusqlite::Error| match error.sqlite_error_code() {
            Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked) => LockError::Held,
            _ => LockError::Failed(error.to_string()),
        };
        let connection = Connection::open_with_flags(
            directory.join(LOCK_FILE_NAME),
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(failed)?;
        connection.busy_timeout(Duration::ZERO).map_err(failed)?;
        // The journal stays in memory, so nothing is written beside the file.
        connection
            .execute_batch("PRAGMA journal_mode = MEMORY; BEGIN EXCLUSIVE;")
            .map_err(failed)?;
        Ok(Self {
            _connection: Mutex::new(connection),
        })
    }
}
