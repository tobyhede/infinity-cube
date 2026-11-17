//! The desktop sidecar, as the shell starts and stops it (ADR 0155).
//!
//! A sidecar runs one Aggregate directory. It announces itself with one JSON line on
//! standard output (`src/desktop/announcement.ts`) and is stopped by closing
//! its standard input, on which it writes any edit not yet on disk and exits.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

/// How long a sidecar has to say where it listens before it is killed.
pub const ANNOUNCE_DEADLINE: Duration = Duration::from_secs(30);

/// How long a sidecar has to write its last edit before it is killed.
pub const STOP_GRACE: Duration = Duration::from_secs(5);

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
    #[error("the sidecar did not say where it listens within {0:?}, and was stopped")]
    Timeout(Duration),
    #[error("could not read the sidecar's announcement: {0}")]
    Read(#[from] std::io::Error),
    #[error("the sidecar's announcement is not one this shell reads: {0}")]
    Announcement(#[from] serde_json::Error),
}

/// A sidecar that is serving an Aggregate directory.
///
/// Dropping one stops it as [`Sidecar::stop`] does with [`STOP_GRACE`], so
/// no path leaves it running or unreaped.
#[derive(Debug)]
pub struct Sidecar {
    child: Child,
    stdin: Option<ChildStdin>,
    ended: Option<Stopped>,
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
#[derive(Debug, Clone, Copy)]
pub enum Stopped {
    /// It exited by itself, writing its last edit if the status is success.
    Exited(ExitStatus),
    /// It had not exited within the grace period and was killed.
    Killed,
}

impl Stopped {
    /// Why the last edit may not be on disk, or `None` if the sidecar
    /// exited successfully, having written it.
    #[must_use]
    pub fn unwritten(&self) -> Option<String> {
        match self {
            Self::Exited(status) if status.success() => None,
            Self::Exited(status) => Some(format!("its sidecar stopped with {status}")),
            Self::Killed => Some("its sidecar did not stop in time and was killed".to_owned()),
        }
    }
}

/// Start a sidecar on `talk`, serving the built application in `built`, and
/// wait up to `deadline` for it to say where it listens or why it will not.
///
/// # Errors
///
/// [`SidecarError`] when the sidecar cannot be started, exits without a
/// word, says nothing within `deadline`, or announces something this shell
/// does not read. The sidecar is stopped and reaped before any error returns.
pub fn start(
    binary: &Path,
    talk: &Path,
    built: &Path,
    deadline: Duration,
) -> Result<Started, SidecarError> {
    let mut command = Command::new(binary);
    command
        .arg(talk)
        .arg(built)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    // The sidecar is a console program and the shell is not: without this,
    // Windows opens a console window beside each talk.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|source| SidecarError::Spawn {
        path: binary.to_path_buf(),
        source,
    })?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let mut sidecar = Sidecar {
        child,
        stdin,
        ended: None,
    };
    let Some(stdout) = stdout else {
        return Err(SidecarError::Silent);
    };
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let read = reader.read_line(&mut line).map(|_| line);
        let _ = sender.send(read);
        // Keep reading, so the sidecar never writes into a closed pipe.
        let mut sink = Vec::new();
        let _ = reader.read_to_end(&mut sink);
    });
    let line = match receiver.recv_timeout(deadline) {
        Ok(read) => read?,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            sidecar.kill();
            return Err(SidecarError::Timeout(deadline));
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => return Err(SidecarError::Silent),
    };
    if line.is_empty() {
        return Err(SidecarError::Silent);
    }
    match serde_json::from_str::<Announcement>(&line)? {
        Announcement::Listening { port, secret } => Ok(Started::Listening {
            sidecar,
            port,
            secret,
        }),
        Announcement::Refused { message } => Ok(Started::Refused { message }),
    }
}

impl Sidecar {
    /// Close the sidecar's standard input, so it writes its last edit and
    /// exits, and wait up to `grace` for it; kill it if it has not exited.
    #[must_use]
    pub fn stop(mut self, grace: Duration) -> Stopped {
        self.finish(grace)
    }

    /// How the sidecar exited, if it has, without asking it to stop.
    pub fn exited(&mut self) -> Option<ExitStatus> {
        if let Some(Stopped::Exited(status)) = self.ended {
            return Some(status);
        }
        let status = self.child.try_wait().ok().flatten()?;
        self.ended = Some(Stopped::Exited(status));
        Some(status)
    }

    fn finish(&mut self, grace: Duration) -> Stopped {
        if let Some(ended) = self.ended {
            return ended;
        }
        drop(self.stdin.take());
        let deadline = Instant::now() + grace;
        let ended = loop {
            match self.child.try_wait() {
                Ok(Some(status)) => break Stopped::Exited(status),
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
                Ok(None) | Err(_) => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    break Stopped::Killed;
                }
            }
        };
        self.ended = Some(ended);
        ended
    }

    fn kill(&mut self) {
        if self.ended.is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
            self.ended = Some(Stopped::Killed);
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.finish(STOP_GRACE);
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

    /// A fake sidecar: `sh` runs the directory argument as its script.
    #[cfg(target_os = "linux")]
    fn fake_sidecar(name: &str, script: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "infinity-cube-fake-sidecar-{}-{name}.sh",
            std::process::id()
        ));
        let written = std::fs::write(&path, script);
        assert!(
            written.is_ok(),
            "the fake sidecar's script should be written"
        );
        path
    }

    /// The state letter of process `pid` from `/proc`, or `None` once it is reaped.
    #[cfg(target_os = "linux")]
    fn process_state(pid: &str) -> Option<char> {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        stat.rsplit_once(") ")?.1.chars().next()
    }

    #[cfg(target_os = "linux")]
    fn pid_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "infinity-cube-fake-sidecar-{}-{name}.pid",
            std::process::id()
        ))
    }

    /// Wait up to ten seconds for process `pid` to be reaped, and say whether it was.
    #[cfg(target_os = "linux")]
    fn reaped(pid: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        while process_state(pid).is_some() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        process_state(pid).is_none()
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn gives_up_on_a_sidecar_that_never_announces_and_reaps_it() {
        let pid_file = pid_file("silent");
        let script = fake_sidecar(
            "silent",
            &format!("echo $$ > '{}'\nexec sleep 90\n", pid_file.display()),
        );
        let begun = Instant::now();
        let started = start(
            Path::new("/bin/sh"),
            &script,
            Path::new("unused"),
            Duration::from_secs(1),
        );
        let waited = begun.elapsed();
        let pid = std::fs::read_to_string(&pid_file).unwrap_or_default();
        let pid = pid.trim().to_owned();
        let _ = std::fs::remove_file(&script);
        let _ = std::fs::remove_file(&pid_file);
        assert!(
            matches!(started, Err(SidecarError::Timeout(_))),
            "a sidecar that never announces should time out"
        );
        assert!(
            waited < Duration::from_secs(5),
            "starting should give up at its deadline, not wait {waited:?}"
        );
        assert!(
            !pid.is_empty(),
            "the fake sidecar should have written its pid"
        );
        assert!(
            reaped(&pid),
            "a sidecar that timed out should be killed and reaped"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn reaps_a_sidecar_whose_announcement_cannot_be_read() {
        let pid_file = pid_file("garbled");
        let script = fake_sidecar(
            "garbled",
            &format!(
                "echo $$ > '{}'\necho 'not an announcement'\nexec cat > /dev/null\n",
                pid_file.display()
            ),
        );
        let started = start(
            Path::new("/bin/sh"),
            &script,
            Path::new("unused"),
            ANNOUNCE_DEADLINE,
        );
        assert!(
            matches!(started, Err(SidecarError::Announcement(_))),
            "a line that is not an announcement should be refused"
        );
        let pid = std::fs::read_to_string(&pid_file).unwrap_or_default();
        let pid = pid.trim().to_owned();
        let _ = std::fs::remove_file(&script);
        let _ = std::fs::remove_file(&pid_file);
        assert!(
            !pid.is_empty(),
            "the fake sidecar should have written its pid"
        );
        assert!(
            reaped(&pid),
            "a sidecar refused after it started should be stopped and reaped, not left behind"
        );
    }

    #[cfg(unix)]
    mod given_a_stopped_sidecar {
        use super::*;
        use std::os::unix::process::ExitStatusExt;

        #[test]
        fn a_successful_exit_wrote_the_last_edit() {
            assert_eq!(
                Stopped::Exited(ExitStatus::from_raw(0)).unwritten(),
                None,
                "a sidecar that exited zero should have written its last edit"
            );
        }

        #[test]
        fn a_failed_exit_may_not_have_written_it() {
            let reason = Stopped::Exited(ExitStatus::from_raw(1 << 8)).unwritten();
            assert!(
                reason
                    .as_deref()
                    .is_some_and(|reason| reason.contains("exit status: 1")),
                "a sidecar that exited non-zero should say its last edit may be lost, got {reason:?}"
            );
        }

        #[test]
        fn a_killed_sidecar_may_not_have_written_it() {
            assert!(
                Stopped::Killed.unwritten().is_some(),
                "a sidecar killed after the grace period should say its last edit may be lost"
            );
        }
    }

    #[cfg(target_os = "linux")]
    mod given_a_sidecar_that_has_announced {
        use super::*;

        const LISTENING: &str = r#"echo '{"kind":"listening","port":1,"secret":"s"}'"#;

        /// A fake sidecar that announces it listens, then runs `then`.
        fn listening(name: &str, then: &str) -> Option<(Sidecar, PathBuf)> {
            let script = fake_sidecar(name, &format!("{LISTENING}\n{then}\n"));
            match start(
                Path::new("/bin/sh"),
                &script,
                Path::new("unused"),
                ANNOUNCE_DEADLINE,
            ) {
                Ok(Started::Listening { sidecar, .. }) => Some((sidecar, script)),
                _ => {
                    let _ = std::fs::remove_file(&script);
                    None
                }
            }
        }

        #[test]
        fn an_exit_of_its_own_is_seen_with_its_status() {
            let listening = listening("dies", "exit 3");
            assert!(
                listening.is_some(),
                "the fake sidecar should announce that it listens"
            );
            let Some((mut sidecar, script)) = listening else {
                return;
            };
            let deadline = Instant::now() + Duration::from_secs(10);
            let mut status = sidecar.exited();
            while status.is_none() && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(50));
                status = sidecar.exited();
            }
            let _ = std::fs::remove_file(&script);
            assert_eq!(
                status.and_then(|status| status.code()),
                Some(3),
                "a sidecar that exits by itself should be seen to have exited, with its code"
            );
        }

        #[test]
        fn a_running_sidecar_has_not_exited() {
            let listening = listening("serves", "exec cat > /dev/null");
            assert!(
                listening.is_some(),
                "the fake sidecar should announce that it listens"
            );
            let Some((mut sidecar, script)) = listening else {
                return;
            };
            thread::sleep(Duration::from_millis(200));
            let status = sidecar.exited();
            let stopped = sidecar.stop(STOP_GRACE);
            let _ = std::fs::remove_file(&script);
            assert_eq!(
                status, None,
                "a sidecar still serving should not be seen to exit"
            );
            assert_eq!(
                stopped.unwritten(),
                None,
                "a sidecar that exits when its input closes should have written its last edit"
            );
        }
    }
}
