//! The desktop sidecar, as the shell starts and stops it (ADR 0155).
//!
//! A sidecar runs one talk folder. It announces itself with one JSON line on
//! standard output (`src/desktop/announcement.ts`) and is stopped by closing
//! its standard input, on which it writes any edit not yet on disk and exits.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

/// The sidecar's one line on standard output.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Announcement {
    Listening { port: u16, secret: String },
    Refused { message: String },
}

/// Why a sidecar could not be started or heard from.
#[derive(Debug, thiserror::Error)]
pub enum SidecarError {
    #[error("could not start the sidecar at {path}: {source}")]
    Spawn {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("the sidecar exited before saying where it listens")]
    Silent,
    #[error("could not read the sidecar's announcement: {0}")]
    Read(#[from] std::io::Error),
    #[error("the sidecar's announcement is not one this shell reads: {0}")]
    Announcement(#[from] serde_json::Error),
}

/// A sidecar that is serving a talk folder.
#[derive(Debug)]
pub struct Sidecar {
    child: Child,
    stdin: Option<ChildStdin>,
}

/// What starting a sidecar on a folder came to.
#[derive(Debug)]
pub enum Started {
    /// Serving at `http://127.0.0.1:<port>/`, opened by presenting `secret` once.
    Listening {
        sidecar: Sidecar,
        port: u16,
        secret: String,
    },
    /// The folder cannot be run; `message` says why, in the author's words.
    Refused { message: String },
}

/// How a sidecar ended when asked to stop.
#[derive(Debug)]
pub enum Stopped {
    /// It wrote its last edit and exited by itself.
    Exited(ExitStatus),
    /// It had not exited within the grace period and was killed.
    Killed,
}

/// Start a sidecar on `talk`, serving the built application in `built`, and
/// wait for it to say where it listens or why it will not.
///
/// # Errors
///
/// [`SidecarError`] when the sidecar cannot be started, exits without a
/// word, or announces something this shell does not read.
pub fn start(binary: &Path, talk: &Path, built: &Path) -> Result<Started, SidecarError> {
    let mut child = Command::new(binary)
        .arg(talk)
        .arg(built)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|source| SidecarError::Spawn {
            path: binary.to_path_buf(),
            source,
        })?;
    let stdin = child.stdin.take();
    let Some(stdout) = child.stdout.take() else {
        return Err(SidecarError::Silent);
    };
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    if reader.read_line(&mut line)? == 0 {
        let _ = child.wait();
        return Err(SidecarError::Silent);
    }
    // Keep reading, so the sidecar never writes into a closed pipe.
    thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = reader.read_to_end(&mut sink);
    });
    match serde_json::from_str::<Announcement>(&line)? {
        Announcement::Listening { port, secret } => Ok(Started::Listening {
            sidecar: Sidecar { child, stdin },
            port,
            secret,
        }),
        Announcement::Refused { message } => {
            let _ = child.wait();
            Ok(Started::Refused { message })
        }
    }
}

impl Sidecar {
    /// Close the sidecar's standard input, so it writes its last edit and
    /// exits, and wait up to `grace` for it; kill it if it has not exited.
    #[must_use]
    pub fn stop(mut self, grace: Duration) -> Stopped {
        drop(self.stdin.take());
        let deadline = Instant::now() + grace;
        loop {
            match self.child.try_wait() {
                Ok(Some(status)) => return Stopped::Exited(status),
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
                Ok(None) | Err(_) => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    return Stopped::Killed;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_listening_announcement() {
        let parsed: Result<Announcement, _> =
            serde_json::from_str(r#"{"kind":"listening","port":43210,"secret":"s"}"#);
        assert_eq!(
            parsed.ok(),
            Some(Announcement::Listening {
                port: 43210,
                secret: "s".to_owned()
            }),
            "a listening line should parse into its port and secret"
        );
    }

    #[test]
    fn reads_a_refusal() {
        let parsed: Result<Announcement, _> =
            serde_json::from_str(r#"{"kind":"refused","message":"no aggregate"}"#);
        assert_eq!(
            parsed.ok(),
            Some(Announcement::Refused {
                message: "no aggregate".to_owned()
            }),
            "a refused line should parse into its message"
        );
    }
}
