//! What the shell opens when it starts, and what it does when its last
//! window closes (Storage ST-131). Each directory named on the command line
//! opens at once, and with none named, or none that opens, the Start window
//! shows ([`crate::open_folder`]). `tauri.conf.json` declares no window, so
//! Tauri opens nothing by itself.

use std::ffi::OsString;
use std::path::PathBuf;

use crate::menu::Platform;

/// The folders a launch names, given the arguments after the program's
/// name; with none, the Start window shows ([`crate::open_folder::open`]).
#[must_use]
pub fn launch(arguments: impl IntoIterator<Item = OsString>) -> Vec<PathBuf> {
    arguments.into_iter().map(PathBuf::from).collect()
}

/// What the application does when its last window, a Space window or the
/// Start window, has closed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LastWindow {
    /// macOS: keep running with no window.
    RunOn,
    /// Linux and Windows: end, which is a quit (Storage ST-122).
    Quit,
}

/// What the application does on `platform` when its last window has closed.
#[must_use]
pub fn last_window_closed(platform: Platform) -> LastWindow {
    match platform {
        Platform::MacOs => LastWindow::RunOn,
        Platform::Other => LastWindow::Quit,
    }
}

/// Whether activating the application (its Dock icon on macOS) shows the
/// Start window: only with no window showing; otherwise the platform brings
/// the open windows forward itself.
#[must_use]
#[cfg_attr(
    all(not(test), not(target_os = "macos")),
    expect(
        dead_code,
        reason = "only macOS activates an application with no window"
    )
)]
pub fn activating_shows_start(any_window_showing: bool) -> bool {
    !any_window_showing
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_launch_opens_each_named_directory() {
        assert_eq!(
            launch([OsString::from("/a"), OsString::from("b")]),
            vec![PathBuf::from("/a"), PathBuf::from("b")],
        );
    }

    mod given_the_last_window_closed {
        use super::*;

        #[test]
        fn macos_runs_on_with_no_window() {
            assert_eq!(last_window_closed(Platform::MacOs), LastWindow::RunOn);
        }

        #[test]
        fn linux_and_windows_quit() {
            assert_eq!(last_window_closed(Platform::Other), LastWindow::Quit);
        }

        #[test]
        fn activating_shows_the_start_window_only_with_no_window_showing() {
            assert!(activating_shows_start(false));
            assert!(!activating_shows_start(true));
        }
    }

    /// Tauri opens every window `tauri.conf.json` declares when it starts,
    /// so the configuration declares none and this module decides what
    /// opens.
    #[test]
    fn the_configuration_declares_no_window() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json should be JSON");
        let windows = &config["app"]["windows"];
        assert!(
            windows.is_null() || windows.as_array().is_some_and(Vec::is_empty),
            "tauri.conf.json should declare no window, but declares {windows}"
        );
    }
}
