//! The Start window (Storage ST-131, ADR 0171): a window of the shell's own,
//! under the label [`START_WINDOW_LABEL`], drawn by the page `packages/app`
//! builds as `start.html` into the shell's `frontendDist` (ADR 0172). It
//! offers New Space, Open Folder… and the recent Spaces, and its capability
//! (`capabilities/start.json`) grants its window alone the `start_*`
//! commands here. It shows at launch when nothing else opens and for File ›
//! New Space…, and closes when a Space window opens from it.
//!
//! New Space writes `<location>/<name>` through the host's `init_directory`,
//! its Meta Space titled with the name, refusing a name and defaulting one by
//! [`crate::new_space_folder`]'s rules.

use std::path::{Path, PathBuf};
use std::thread;

use host::{Filesystem, IdSource, RandomIds, TokioFilesystem};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::launch::{self, Opening};
use crate::new_space;
use crate::new_space_folder::{
    FolderListing, Listing, Platform, Refused, default_name, new_space_folder,
};
use crate::not_opened::NotOpened;

/// The Start window's label, the one its capability names.
pub const START_WINDOW_LABEL: &str = "start";

/// The platform whose folder names New Space holds a name to.
const PLATFORM: Platform = if cfg!(windows) {
    Platform::Windows
} else {
    Platform::Unix
};

/// The name New Space offers when none can be worked out.
const UNTITLED: &str = "Untitled Space";

/// Which screen the Start window opens on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    /// New Space, Open Folder… and the recent Spaces.
    Start,
    /// The New Space form, as File › New Space… opens it.
    NewSpace,
}

/// The page in `frontendDist` the Start window opens on `screen`: the form
/// is the fragment `#new-space`, which the page reads.
#[must_use]
pub fn page(screen: Screen) -> &'static str {
    match screen {
        Screen::Start => "start.html",
        Screen::NewSpace => "start.html#new-space",
    }
}

/// What the New Space form starts with in a location.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSpaceDefaults {
    /// The folder the new Space's folder goes in.
    pub location: String,
    /// The name offered: `Untitled Space`, or the first free one after it.
    pub name: String,
    /// This platform's path separator, so the page can name
    /// `<location>/<name>` before anything is written.
    pub separator: String,
}

impl NewSpaceDefaults {
    /// As the page reads it.
    #[must_use]
    pub fn to_page(&self) -> Value {
        json!({
            "location": self.location,
            "name": self.name,
            "separator": self.separator,
        })
    }
}

/// The form's defaults for `location`. A location that cannot be listed
/// still offers `Untitled Space`; Create Space then says why.
pub fn defaults(listing: &impl Listing, location: &Path) -> NewSpaceDefaults {
    NewSpaceDefaults {
        location: location.display().to_string(),
        name: default_name(listing, location).unwrap_or_else(|_| UNTITLED.to_owned()),
        separator: std::path::MAIN_SEPARATOR_STR.to_owned(),
    }
}

/// Where New Space starts: the person's Documents folder, or the folder by
/// that name in their home when the platform names none.
#[must_use]
pub fn default_location(documents: Option<PathBuf>, home: Option<PathBuf>) -> PathBuf {
    documents
        .or_else(|| home.map(|home| home.join("Documents")))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Why New Space wrote nothing, or opened nothing, as the page shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotCreated {
    /// The name is not one folder name on the platform: shown beside Name.
    Name { message: String },
    /// The folder `<location>/<name>` holds something, or cannot be looked
    /// in: shown beside Name.
    Folder { message: String },
    /// The name and Location were accepted and the write, or opening what
    /// it wrote, failed: announced, with the form kept (UI-92).
    Failed { message: String },
}

impl NotCreated {
    /// As the page reads it: `{ of, message }`.
    #[must_use]
    pub fn to_page(&self) -> Value {
        let (of, message) = match self {
            Self::Name { message } => ("name", message),
            Self::Folder { message } => ("folder", message),
            Self::Failed { message } => ("failed", message),
        };
        json!({ "of": of, "message": message })
    }
}

impl From<Refused> for NotCreated {
    fn from(refused: Refused) -> Self {
        let message = refused.to_string();
        match refused {
            Refused::NotAFolderName
            | Refused::ForbiddenCharacter(_)
            | Refused::Reserved
            | Refused::TrailingDotOrSpace => Self::Name { message },
            Refused::NotEmpty(_) | Refused::Unlisted { .. } => Self::Folder { message },
        }
    }
}

/// Write a new Space to `<location>/<name>`, its Meta Space titled `name`,
/// answering the folder written.
///
/// # Errors
///
/// [`NotCreated`]: the name or the folder refused with nothing written, or
/// the write failed.
pub async fn create_new_space<L: Listing, F: Filesystem, I: IdSource>(
    listing: &L,
    fs: &F,
    ids: &I,
    location: &Path,
    name: &str,
    platform: Platform,
) -> Result<PathBuf, NotCreated> {
    let folder = new_space_folder(listing, location, name, platform)?;
    match new_space::create_space(fs, &folder, name, ids).await {
        Ok(()) => Ok(folder),
        // Filled between the check and the write.
        Err(NotOpened::NotEmpty(_)) => Err(Refused::NotEmpty(folder).into()),
        Err(reason) => Err(NotCreated::Failed {
            message: reason.to_string(),
        }),
    }
}

/// Show the Start window on `screen`: open it, or bring forward the one
/// open, moving it to the form when that is asked for.
pub fn show(app: &AppHandle, screen: Screen) {
    if let Some(window) = app.get_webview_window(START_WINDOW_LABEL) {
        let _ = window.set_focus();
        if screen == Screen::NewSpace {
            // The page moves to the form when its fragment becomes `#new-space`.
            let _ = window.eval("window.location.hash = 'new-space';");
        }
        return;
    }
    let built = WebviewWindowBuilder::new(
        app,
        START_WINDOW_LABEL,
        WebviewUrl::App(PathBuf::from(page(screen))),
    )
    .title("InfinityCube")
    .inner_size(720.0, 520.0)
    .min_inner_size(560.0, 420.0)
    .center()
    .focused(true)
    .build();
    if let Err(error) = built {
        crate::show_error(app, &format!("Could not open the Start window: {error}"));
    }
}

/// Close the Start window, if it is open.
pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(START_WINDOW_LABEL) {
        let _ = window.close();
    }
}

/// The folder New Space starts in, on this machine.
fn location_here(app: &AppHandle) -> PathBuf {
    let paths = app.path();
    default_location(paths.document_dir().ok(), paths.home_dir().ok())
}

/// What the page draws first: the recent Spaces, and the form's defaults.
/// Nothing is kept across launches yet (ticket 03), so Recent is empty.
#[tauri::command]
pub fn start_window_view(app: AppHandle) -> Value {
    json!({
        "recents": [],
        "newSpace": defaults(&FolderListing, &location_here(&app)).to_page(),
    })
}

/// Ask for a Location with the platform's folder chooser, starting at
/// `location`, answering the form's defaults there, or nothing when
/// cancelled.
#[tauri::command]
pub async fn start_browse(app: AppHandle, location: String) -> Option<Value> {
    let (chosen, answered) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose where to keep the new Space")
        .set_directory(&location)
        .pick_folder(move |folder| {
            let _sent = chosen.send(folder.and_then(|folder| folder.into_path().ok()));
        });
    let folder = answered.await.ok().flatten()?;
    Some(defaults(&FolderListing, &folder).to_page())
}

/// New Space's Create Space: write `<location>/<name>` and open it, closing
/// the Start window once its window shows ([`launch::closes_start`]). Answers nothing then, or
/// why not ([`NotCreated`], as the page reads it): a refusal is an answer
/// the page draws, not a failed invoke.
#[tauri::command]
pub async fn start_create_space(app: AppHandle, location: String, name: String) -> Option<Value> {
    let created = tauri::async_runtime::spawn_blocking(move || {
        let written = {
            // One Space is written at a time (`crate::create_and_open`).
            let _creating = crate::lock(&crate::CREATING);
            tauri::async_runtime::block_on(create_new_space(
                &FolderListing,
                &TokioFilesystem,
                &RandomIds,
                Path::new(&location),
                &name,
                PLATFORM,
            ))
        }?;
        match crate::open_aggregate_at(&app, &written) {
            Ok(opened) => {
                if launch::closes_start(Opening::StartWindow, opened) {
                    close(&app);
                }
                Ok(())
            }
            Err(reason) if reason.tells_the_presenter() => Err(NotCreated::Failed {
                message: reason.to_string(),
            }),
            // A quit took it: nothing more to say.
            Err(_) => Ok(()),
        }
    })
    .await;
    match created {
        Ok(result) => result.err().map(|refused| refused.to_page()),
        Err(error) => Some(
            NotCreated::Failed {
                message: format!("Could not create the Space: {error}"),
            }
            .to_page(),
        ),
    }
}

/// Open Folder…: the platform's folder chooser, as File › Open… asks.
#[tauri::command]
pub fn start_open_folder(app: AppHandle) {
    crate::choose_folder(&app, Opening::StartWindow);
}

/// Open a recent Space's folder, as Open Folder… would.
#[tauri::command]
pub fn start_open_recent(app: AppHandle, folder: String) {
    let _opening = thread::spawn(move || {
        crate::open_from(&app, Path::new(&folder), Opening::StartWindow);
    });
}

/// Close the Start window: Cancel on the form File › New Space… opened.
#[tauri::command]
pub fn start_close(app: AppHandle) {
    close(&app);
}

#[cfg(test)]
mod tests;
