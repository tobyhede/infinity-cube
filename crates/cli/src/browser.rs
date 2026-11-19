//! Opening the run in the system's browser, as `cube run` does unless
//! `--no-open`: the platform's own opener, never waited on.

use std::process::{Command, Stdio};

use crate::output::say;

fn opener(url: &str) -> Command {
    #[cfg(target_os = "macos")]
    let command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };
    #[cfg(windows)]
    let command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    };
    #[cfg(not(any(target_os = "macos", windows)))]
    let command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };
    command
}

/// Open `url`; a browser that cannot be opened is reported, never fatal.
pub(crate) fn open(url: &str) {
    let spawned = opener(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    match spawned {
        // Reaped on a thread of its own, so it never lingers as a zombie.
        Ok(mut child) => drop(std::thread::spawn(move || child.wait())),
        Err(error) => say(&format!("Could not open a browser at {url}: {error}")),
    }
}
