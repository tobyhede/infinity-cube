//! What the shell opens when it starts. Every window it has is a Space's
//! (or a window a Space's page opened, or a close's question): there is no
//! home window. A directory named on the command line opens at once; with
//! none named, the shell asks for a folder, and File › Open… asks for
//! another while the application runs. `tauri.conf.json` declares no
//! window, so Tauri opens nothing by itself.

use std::ffi::OsString;
use std::path::PathBuf;

/// What to open on starting.
#[derive(Debug, PartialEq, Eq)]
pub enum Launch {
    /// No directory was named: ask for a folder.
    Choose,
    /// Open each of these directories, and ask for a folder only if none of
    /// them opens.
    Folders(Vec<PathBuf>),
}

/// Why a folder is being asked for, which decides what cancelling, or a
/// folder that does not open, comes to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Opening {
    /// At launch, with no Space open: cancelling ends the application, and
    /// a folder that does not open is reported before asking again.
    AtLaunch,
    /// From File › Open…: cancelling does nothing.
    FromMenu,
}

/// What to open, given the arguments after the program's name.
#[must_use]
pub fn launch(arguments: impl IntoIterator<Item = OsString>) -> Launch {
    let folders: Vec<PathBuf> = arguments.into_iter().map(PathBuf::from).collect();
    if folders.is_empty() {
        Launch::Choose
    } else {
        Launch::Folders(folders)
    }
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]
mod tests {
    use super::*;

    #[test]
    fn asks_for_a_folder_when_none_is_named() {
        assert_eq!(launch(Vec::new()), Launch::Choose);
    }

    #[test]
    fn opens_each_named_directory() {
        assert_eq!(
            launch([OsString::from("/a"), OsString::from("b")]),
            Launch::Folders(vec![PathBuf::from("/a"), PathBuf::from("b")]),
        );
    }

    /// Tauri opens every window `tauri.conf.json` declares when it starts,
    /// which is how a home window came to open beside the Space a command
    /// line named.
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
