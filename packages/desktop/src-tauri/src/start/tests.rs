//! The Start window's New Space (Storage ST-131) over real folders, and the
//! capabilities that keep its commands to its own window.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::fs;
use std::io;
use std::path::Path;

use host::{
    EntryKind, Filesystem, MemorySpaceRepository, RandomIds, TokioFilesystem, import_directory,
};

use super::*;
use crate::new_space_folder::{FolderListing, Platform};

async fn create(location: &Path, name: &str) -> Result<PathBuf, NotCreated> {
    create_new_space(
        &FolderListing,
        &TokioFilesystem,
        &RandomIds,
        location,
        name,
        Platform::Unix,
    )
    .await
}

/// The Meta Space's Title in the Space written to `folder`.
fn meta_title(folder: &Path) -> String {
    let aggregate: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(folder.join("aggregate.json")).unwrap()).unwrap();
    let meta = aggregate["metaSpaceId"]
        .as_str()
        .expect("aggregate.json names its Meta Space");
    let space: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(folder.join(meta).join("space.json")).unwrap())
            .unwrap();
    space["title"].as_str().unwrap().to_owned()
}

mod given_the_defaults {
    use super::*;

    #[tokio::test]
    async fn writes_untitled_space_in_the_location_titled_with_its_name() {
        let documents = tempfile::tempdir().unwrap();
        let shown = defaults(&FolderListing, documents.path());
        assert_eq!(shown.name, "Untitled Space");

        let folder = create(documents.path(), &shown.name).await.unwrap();

        assert_eq!(folder, documents.path().join("Untitled Space"));
        assert_eq!(meta_title(&folder), "Untitled Space");
        import_directory(
            &MemorySpaceRepository::new(),
            &TokioFilesystem,
            &folder,
            &RandomIds,
        )
        .await
        .expect("the new Space should read in as `check` reads it");
    }

    #[tokio::test]
    async fn offers_and_writes_untitled_space_2_when_untitled_space_is_a_space() {
        let documents = tempfile::tempdir().unwrap();
        create(documents.path(), "Untitled Space").await.unwrap();

        let shown = defaults(&FolderListing, documents.path());
        assert_eq!(shown.name, "Untitled Space 2");
        let folder = create(documents.path(), &shown.name).await.unwrap();

        assert_eq!(folder, documents.path().join("Untitled Space 2"));
        assert_eq!(meta_title(&folder), "Untitled Space 2");
    }

    #[test]
    fn names_the_location_as_given_and_this_platform_s_separator() {
        let shown = defaults(&FolderListing, Path::new("/nowhere/Documents"));
        assert_eq!(shown.location, "/nowhere/Documents");
        assert_eq!(shown.separator, std::path::MAIN_SEPARATOR_STR);
    }

    #[test]
    fn still_offers_untitled_space_where_the_location_cannot_be_listed() {
        let file = tempfile::NamedTempFile::new().unwrap();
        assert_eq!(defaults(&FolderListing, file.path()).name, "Untitled Space");
    }
}

mod given_the_location {
    use super::*;

    #[test]
    fn is_the_documents_folder_the_platform_names() {
        assert_eq!(
            default_location(
                Some(PathBuf::from("/home/ada/Docs")),
                Some(PathBuf::from("/home/ada"))
            ),
            PathBuf::from("/home/ada/Docs")
        );
    }

    #[test]
    fn is_documents_in_the_home_folder_when_the_platform_names_none() {
        assert_eq!(
            default_location(None, Some(PathBuf::from("/home/ada"))),
            PathBuf::from("/home/ada/Documents")
        );
    }
}

mod given_a_name_refused {
    use super::*;

    fn refused_as_name(refused: NotCreated) {
        assert!(
            matches!(refused, NotCreated::Name { ref message } if !message.is_empty()),
            "{refused:?}"
        );
    }

    #[tokio::test]
    async fn refuses_each_name_that_is_not_one_folder_name_beside_the_name_writing_nothing() {
        let documents = tempfile::tempdir().unwrap();
        for name in ["", ".", "..", "Q3/Q4", "a\\b"] {
            refused_as_name(create(documents.path(), name).await.unwrap_err());
        }
        assert_eq!(fs::read_dir(documents.path()).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn refuses_a_name_windows_forbids_on_windows() {
        let documents = tempfile::tempdir().unwrap();
        for name in ["a:b", "CON", "trailing."] {
            let refused = create_new_space(
                &FolderListing,
                &TokioFilesystem,
                &RandomIds,
                documents.path(),
                name,
                Platform::Windows,
            )
            .await
            .unwrap_err();
            refused_as_name(refused);
        }
        assert_eq!(fs::read_dir(documents.path()).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn refuses_a_folder_that_holds_something_as_the_folder_writing_nothing() {
        let documents = tempfile::tempdir().unwrap();
        let notes = documents.path().join("Meeting notes");
        fs::create_dir(&notes).unwrap();
        fs::write(notes.join("agenda.md"), "mine\n").unwrap();

        let refused = create(documents.path(), "Meeting notes").await.unwrap_err();

        assert!(
            matches!(&refused, NotCreated::Folder { message } if message.contains("Meeting notes")),
            "{refused:?}"
        );
        assert_eq!(
            fs::read_dir(&notes).unwrap().count(),
            1,
            "nothing is written there"
        );
    }
}

/// The real filesystem, but no file can be created.
struct Unwritable;

impl Filesystem for Unwritable {
    async fn list(&self, directory: &Path) -> io::Result<Vec<(String, EntryKind)>> {
        TokioFilesystem.list(directory).await
    }
    async fn kind(&self, path: &Path) -> io::Result<Option<EntryKind>> {
        TokioFilesystem.kind(path).await
    }
    async fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        TokioFilesystem.read(path).await
    }
    async fn create_dir_all(&self, directory: &Path) -> io::Result<()> {
        TokioFilesystem.create_dir_all(directory).await
    }
    async fn create_new(&self, _path: &Path, _bytes: &[u8]) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::StorageFull,
            "the disk is full",
        ))
    }
    async fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        TokioFilesystem.rename(from, to).await
    }
    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        TokioFilesystem.remove_file(path).await
    }
    async fn remove_dir(&self, path: &Path) -> io::Result<()> {
        TokioFilesystem.remove_dir(path).await
    }
}

mod given_a_write_that_fails {
    use super::*;

    #[tokio::test]
    async fn answers_why_in_words_naming_the_folder() {
        let documents = tempfile::tempdir().unwrap();
        let refused = create_new_space(
            &FolderListing,
            &Unwritable,
            &RandomIds,
            documents.path(),
            "Untitled Space",
            Platform::Unix,
        )
        .await
        .unwrap_err();
        assert!(
            matches!(&refused, NotCreated::Failed { message }
                if message.contains("Untitled Space") && message.contains("the disk is full")),
            "{refused:?}"
        );
    }
}

mod given_the_page {
    use super::*;

    #[test]
    fn a_refusal_reaches_the_page_as_what_it_refused_and_why() {
        let as_json = |refused: NotCreated| refused.to_page();
        assert_eq!(
            as_json(NotCreated::Name {
                message: "m".to_owned()
            }),
            serde_json::json!({ "of": "name", "message": "m" })
        );
        assert_eq!(
            as_json(NotCreated::Folder {
                message: "m".to_owned()
            }),
            serde_json::json!({ "of": "folder", "message": "m" })
        );
        assert_eq!(
            as_json(NotCreated::Failed {
                message: "m".to_owned()
            }),
            serde_json::json!({ "of": "failed", "message": "m" })
        );
    }

    #[test]
    fn the_defaults_reach_the_page_by_name() {
        let shown = NewSpaceDefaults {
            location: "/home/ada/Documents".to_owned(),
            name: "Untitled Space".to_owned(),
            separator: "/".to_owned(),
        };
        assert_eq!(
            shown.to_page(),
            serde_json::json!({
                "location": "/home/ada/Documents",
                "name": "Untitled Space",
                "separator": "/",
            })
        );
    }

    #[test]
    fn the_form_opens_at_its_own_address_and_the_start_screen_at_the_page() {
        assert_eq!(page(Screen::Start), "start.html");
        assert_eq!(page(Screen::NewSpace), "start.html#new-space");
    }
}

mod given_the_capabilities {
    use super::*;
    use crate::aggregates::SPACE_WINDOW_PREFIX;
    use crate::question::QUESTION_WINDOW_PREFIX;
    use crate::scheme::VIEW_WINDOW_PREFIX;

    /// Every capability file: its name, the window labels it names and the
    /// permissions it grants.
    fn capabilities() -> Vec<(String, Vec<String>, Vec<String>)> {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        let mut found = Vec::new();
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            let text = fs::read_to_string(&path).unwrap();
            let capability: serde_json::Value = serde_json::from_str(&text).unwrap();
            let strings = |key: &str| -> Vec<String> {
                capability[key]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|value| value.as_str().unwrap().to_owned())
                    .collect()
            };
            found.push((
                path.file_name().unwrap().to_string_lossy().into_owned(),
                strings("windows"),
                strings("permissions"),
            ));
        }
        found.sort();
        found
    }

    /// Whether a capability's window pattern names `label`: Tauri reads `*`
    /// as any run of characters, and these patterns hold at most one, at the
    /// end.
    fn names(pattern: &str, label: &str) -> bool {
        match pattern.strip_suffix('*') {
            Some(prefix) => label.starts_with(prefix),
            None => pattern == label,
        }
    }

    /// The `start_*` names quoted in `text`, in order: `"start_x"` in
    /// `build.rs`, `start::start_x` in `main.rs`'s handler list.
    fn start_commands(text: &str, before: &str) -> Vec<String> {
        text.split(before)
            .skip(1)
            .filter(|rest| rest.starts_with("start_"))
            .map(|rest| {
                rest.chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                    .collect()
            })
            .collect()
    }

    #[test]
    fn the_start_window_s_commands_are_declared_and_handled_alike() {
        let declared = start_commands(include_str!("../../build.rs"), "\"");
        let handled = start_commands(include_str!("../main.rs"), "start::");
        assert_eq!(
            declared,
            [
                "start_window_view",
                "start_browse",
                "start_create_space",
                "start_open_folder",
                "start_open_recent",
                "start_close",
            ],
            "build.rs declares the Start window's commands"
        );
        for command in &declared {
            assert!(handled.contains(command), "main.rs handles {command}");
        }
    }

    #[test]
    fn the_start_window_alone_holds_its_commands_and_a_question_its_answer() {
        let mut start_permissions: Vec<String> =
            start_commands(include_str!("../../build.rs"), "\"")
                .iter()
                .map(|command| format!("allow-{}", command.replace('_', "-")))
                .collect();
        start_permissions.sort();
        assert_eq!(
            capabilities(),
            vec![
                (
                    "closing.json".to_owned(),
                    vec![format!("{QUESTION_WINDOW_PREFIX}*")],
                    vec!["allow-answer-closing".to_owned()],
                ),
                (
                    "start.json".to_owned(),
                    vec![START_WINDOW_LABEL.to_owned()],
                    start_permissions,
                ),
            ],
            "a close's question answers it, and the Start window calls its own commands"
        );
    }

    #[test]
    fn no_capability_names_a_space_window_or_a_window_its_page_opened() {
        for (file, windows, _) in capabilities() {
            for pattern in &windows {
                for label in [
                    format!("{SPACE_WINDOW_PREFIX}0"),
                    format!("{VIEW_WINDOW_PREFIX}0"),
                    format!("{SPACE_WINDOW_PREFIX}{START_WINDOW_LABEL}"),
                ] {
                    assert!(!names(pattern, &label), "{file}'s {pattern} names {label}");
                }
            }
        }
    }
}
