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

/// How a folder question that opened no Space ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unopened {
    /// The presenter cancelled it.
    Cancelled,
    /// The folder chosen did not open, for a reason the presenter is told.
    Failed,
}

/// What comes after a folder question that opened no Space.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Next {
    /// End the application: nothing is open and the presenter wants nothing.
    Exit,
    /// Say why the folder did not open, and wait for that to be read before
    /// asking again: nothing else is open.
    AskAgain,
    /// Leave the open Spaces as they are, saying why a folder did not open
    /// if it failed.
    Stay,
}

/// What comes after a folder question asked for `opening` that ended
/// `unopened`, while `any_aggregate` (one open, starting or closing). A
/// Space opened meanwhile from File › Open… makes a launch question into
/// one asked from the menu.
#[must_use]
pub fn after(opening: Opening, unopened: Unopened, any_aggregate: bool) -> Next {
    match (opening, unopened, any_aggregate) {
        (Opening::FromMenu, _, _) | (Opening::AtLaunch, _, true) => Next::Stay,
        (Opening::AtLaunch, Unopened::Cancelled, false) => Next::Exit,
        (Opening::AtLaunch, Unopened::Failed, false) => Next::AskAgain,
    }
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

    mod given_a_folder_question_that_opened_nothing {
        use super::*;

        #[test]
        fn a_launch_question_cancelled_with_nothing_open_ends_the_application() {
            assert_eq!(
                after(Opening::AtLaunch, Unopened::Cancelled, false),
                Next::Exit
            );
        }

        #[test]
        fn a_launch_question_that_failed_with_nothing_open_asks_again() {
            assert_eq!(
                after(Opening::AtLaunch, Unopened::Failed, false),
                Next::AskAgain
            );
        }

        #[test]
        fn a_launch_question_leaves_a_space_opened_meanwhile_from_the_menu() {
            for unopened in [Unopened::Cancelled, Unopened::Failed] {
                assert_eq!(
                    after(Opening::AtLaunch, unopened, true),
                    Next::Stay,
                    "{unopened:?} with a Space open"
                );
            }
        }

        #[test]
        fn a_menu_question_changes_nothing_else() {
            for unopened in [Unopened::Cancelled, Unopened::Failed] {
                for any_aggregate in [false, true] {
                    assert_eq!(
                        after(Opening::FromMenu, unopened, any_aggregate),
                        Next::Stay,
                        "{unopened:?}, any Aggregate {any_aggregate}"
                    );
                }
            }
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
