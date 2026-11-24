//! New Space's folder rules, with the Windows rules tested as data on every
//! platform.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use super::*;

/// Folders by path, each with the names it holds; a path not listed is missing.
#[derive(Default)]
struct Folders(BTreeMap<PathBuf, Vec<&'static str>>);

impl Folders {
    fn with(mut self, folder: &str, names: &[&'static str]) -> Self {
        self.0.insert(PathBuf::from(folder), names.to_vec());
        self
    }
}

impl Listing for Folders {
    fn names(&self, folder: &Path) -> io::Result<Option<Vec<String>>> {
        Ok(self
            .0
            .get(folder)
            .map(|names| names.iter().map(|name| (*name).to_owned()).collect()))
    }
}

fn folder(folders: &Folders, name: &str, platform: Platform) -> Result<PathBuf, Refused> {
    new_space_folder(folders, Path::new("/home/ada/Documents"), name, platform)
}

mod given_a_name_that_is_free {
    use super::*;

    #[test]
    fn answers_the_folder_of_that_name_in_the_location() {
        assert_eq!(
            folder(&Folders::default(), "Deck", Platform::Unix).unwrap(),
            PathBuf::from("/home/ada/Documents/Deck")
        );
    }

    #[test]
    fn answers_a_folder_that_holds_only_dot_entries() {
        let folders = Folders::default().with("/home/ada/Documents/Deck", &[".git", ".DS_Store"]);
        assert_eq!(
            folder(&folders, "Deck", Platform::Unix).unwrap(),
            PathBuf::from("/home/ada/Documents/Deck")
        );
    }
}

mod given_a_folder_that_cannot_be_listed {
    use super::*;

    struct Unreadable;

    impl Listing for Unreadable {
        fn names(&self, _folder: &Path) -> io::Result<Option<Vec<String>>> {
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        }
    }

    #[test]
    fn refuses_it_naming_the_folder() {
        let refused = folder_in(&Unreadable, "Deck").unwrap_err();
        assert!(
            matches!(&refused, Refused::Unlisted { folder, .. } if folder == Path::new("/home/ada/Documents/Deck")),
            "{refused:?}"
        );
    }

    fn folder_in(listing: &impl Listing, name: &str) -> Result<PathBuf, Refused> {
        new_space_folder(
            listing,
            Path::new("/home/ada/Documents"),
            name,
            Platform::Unix,
        )
    }
}

mod the_folders_on_disk {
    use super::*;

    #[test]
    fn list_a_missing_folder_as_nothing_there() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(
            FolderListing.names(&root.path().join("missing")).unwrap(),
            None
        );
    }

    #[test]
    fn list_the_names_a_folder_holds() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join(".git")).unwrap();
        std::fs::write(root.path().join("notes.md"), "mine\n").unwrap();
        let mut names = FolderListing.names(root.path()).unwrap().unwrap();
        names.sort();
        assert_eq!(names, [".git", "notes.md"]);
    }
}

mod the_default_name {
    use super::*;

    fn default(folders: &Folders) -> String {
        default_name(folders, Path::new("/home/ada/Documents")).unwrap()
    }

    #[test]
    fn is_untitled_space_when_that_folder_is_free() {
        assert_eq!(default(&Folders::default()), "Untitled Space");
    }

    #[test]
    fn is_untitled_space_when_that_folder_holds_only_dot_entries() {
        let folders = Folders::default().with("/home/ada/Documents/Untitled Space", &[".git"]);
        assert_eq!(default(&folders), "Untitled Space");
    }

    #[test]
    fn is_untitled_space_2_when_untitled_space_is_taken() {
        let folders =
            Folders::default().with("/home/ada/Documents/Untitled Space", &["aggregate.json"]);
        assert_eq!(default(&folders), "Untitled Space 2");
    }

    #[test]
    fn is_untitled_space_3_when_untitled_space_2_is_taken_too() {
        let folders = Folders::default()
            .with("/home/ada/Documents/Untitled Space", &["aggregate.json"])
            .with("/home/ada/Documents/Untitled Space 2", &["notes.md"]);
        assert_eq!(default(&folders), "Untitled Space 3");
    }
}

mod given_a_folder_that_holds_something {
    use super::*;

    #[test]
    fn refuses_it_naming_the_folder() {
        let folders = Folders::default().with("/home/ada/Documents/Deck", &[".git", "notes.md"]);
        let refused = folder(&folders, "Deck", Platform::Unix).unwrap_err();
        assert!(
            matches!(&refused, Refused::NotEmpty(at) if at == Path::new("/home/ada/Documents/Deck")),
            "{refused:?}"
        );
    }
}

mod given_a_name_that_is_not_one_folder_name {
    use super::*;

    #[test]
    fn refuses_it_on_every_platform() {
        for platform in [Platform::Unix, Platform::Windows] {
            for name in ["", ".", "..", "Decks/Q3", "Decks\\Q3", "/", "\\"] {
                let refused = folder(&Folders::default(), name, platform).unwrap_err();
                assert!(
                    matches!(refused, Refused::NotAFolderName),
                    "{name:?} on {platform:?}: {refused:?}"
                );
            }
        }
    }
}

mod given_a_character_windows_forbids {
    use super::*;

    const NAMES: [&str; 7] = ["a<b", "a>b", "a:b", "a\"b", "a|b", "a?b", "a*b"];

    #[test]
    fn refuses_it_for_windows() {
        for name in NAMES {
            let refused = folder(&Folders::default(), name, Platform::Windows).unwrap_err();
            assert!(
                matches!(refused, Refused::ForbiddenCharacter(_)),
                "{name:?}: {refused:?}"
            );
        }
    }

    #[test]
    fn accepts_it_elsewhere() {
        for name in NAMES {
            assert_eq!(
                folder(&Folders::default(), name, Platform::Unix).unwrap(),
                Path::new("/home/ada/Documents").join(name),
                "{name:?}"
            );
        }
    }
}

mod given_a_name_windows_reserves {
    use super::*;

    const NAMES: [&str; 10] = [
        "CON",
        "con",
        "Prn",
        "AUX",
        "NUL",
        "COM1",
        "com9",
        "LPT1",
        "con.txt",
        "NUL.tar.gz",
    ];

    #[test]
    fn refuses_it_for_windows_in_any_case_and_with_any_extension() {
        for name in NAMES {
            let refused = folder(&Folders::default(), name, Platform::Windows).unwrap_err();
            assert!(
                matches!(refused, Refused::Reserved),
                "{name:?}: {refused:?}"
            );
        }
    }

    #[test]
    fn accepts_it_elsewhere() {
        for name in NAMES {
            assert!(
                folder(&Folders::default(), name, Platform::Unix).is_ok(),
                "{name:?}"
            );
        }
    }

    #[test]
    fn accepts_a_name_that_only_begins_like_one_for_windows() {
        for name in ["CONSOLE", "COM10", "LPT0x", "nul-deck", "Auxiliary"] {
            assert!(
                folder(&Folders::default(), name, Platform::Windows).is_ok(),
                "{name:?}"
            );
        }
    }
}

mod given_a_name_ending_in_a_dot_or_a_space {
    use super::*;

    const NAMES: [&str; 3] = ["Deck.", "Deck ", "Deck. "];

    #[test]
    fn refuses_it_for_windows() {
        for name in NAMES {
            let refused = folder(&Folders::default(), name, Platform::Windows).unwrap_err();
            assert!(
                matches!(refused, Refused::TrailingDotOrSpace),
                "{name:?}: {refused:?}"
            );
        }
    }

    #[test]
    fn accepts_it_elsewhere() {
        for name in NAMES {
            assert!(
                folder(&Folders::default(), name, Platform::Unix).is_ok(),
                "{name:?}"
            );
        }
    }
}
