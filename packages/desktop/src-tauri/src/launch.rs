//! What the shell opens when it starts, and what it does when its last
//! window closes (Storage ST-131). A directory named on the command line
//! opens at once; with none named, or none that opens, the Start window
//! shows. `tauri.conf.json` declares no window, so Tauri opens nothing by
//! itself.

use std::ffi::OsString;
use std::path::PathBuf;

use crate::menu::Platform;

/// What to open on starting.
#[derive(Debug, PartialEq, Eq)]
pub enum Launch {
    /// No directory was named: show the Start window.
    Start,
    /// Open each of these directories, and show the Start window only if
    /// none of them opens.
    Folders(Vec<PathBuf>),
}

/// Where a folder that did not open was asked for, which decides what comes
/// after it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Opening {
    /// Named on the command line.
    CommandLine,
    /// From the Start window's Open Folder… or a recent Space.
    StartWindow,
    /// From File › Open….
    Menu,
}

/// What comes after a folder that did not open.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Next {
    /// Show the Start window: nothing else is open.
    ShowStart,
    /// Leave the windows as they are, having said why the folder did not open.
    Stay,
}

/// What comes after a folder asked for from `opening` that did not open,
/// while `any_aggregate` (one open, starting or closing). Only a launch can
/// be left with no window, so only a launch shows the Start window.
#[must_use]
pub fn after(opening: Opening, any_aggregate: bool) -> Next {
    match (opening, any_aggregate) {
        (Opening::CommandLine, false) => Next::ShowStart,
        (Opening::CommandLine, true) | (Opening::StartWindow | Opening::Menu, _) => Next::Stay,
    }
}

/// What to open, given the arguments after the program's name.
#[must_use]
pub fn launch(arguments: impl IntoIterator<Item = OsString>) -> Launch {
    let folders: Vec<PathBuf> = arguments.into_iter().map(PathBuf::from).collect();
    if folders.is_empty() {
        Launch::Start
    } else {
        Launch::Folders(folders)
    }
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

    mod given_a_launch {
        use super::*;

        #[test]
        fn shows_the_start_window_when_no_folder_is_named() {
            assert_eq!(launch(Vec::new()), Launch::Start);
        }

        #[test]
        fn opens_each_named_directory() {
            assert_eq!(
                launch([OsString::from("/a"), OsString::from("b")]),
                Launch::Folders(vec![PathBuf::from("/a"), PathBuf::from("b")]),
            );
        }
    }

    mod given_a_folder_that_did_not_open {
        use super::*;

        #[test]
        fn a_folder_named_at_launch_with_nothing_open_shows_the_start_window() {
            assert_eq!(after(Opening::CommandLine, false), Next::ShowStart);
        }

        #[test]
        fn a_folder_named_at_launch_leaves_a_space_that_did_open() {
            assert_eq!(after(Opening::CommandLine, true), Next::Stay);
        }

        #[test]
        fn a_folder_from_the_start_window_leaves_it_showing() {
            for any_aggregate in [false, true] {
                assert_eq!(
                    after(Opening::StartWindow, any_aggregate),
                    Next::Stay,
                    "any Aggregate {any_aggregate}"
                );
            }
        }

        #[test]
        fn a_folder_from_the_menu_changes_nothing_else() {
            for any_aggregate in [false, true] {
                assert_eq!(
                    after(Opening::Menu, any_aggregate),
                    Next::Stay,
                    "any Aggregate {any_aggregate}"
                );
            }
        }
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
