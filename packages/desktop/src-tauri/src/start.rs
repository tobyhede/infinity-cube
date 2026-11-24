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

use std::io;
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
    FolderListing, Listing, Platform, Refused, UNTITLED, default_name, is_free, new_space_folder,
};
use crate::not_opened::NotOpened;

/// The Start window's label, the one its capability names.
pub const START_WINDOW_LABEL: &str = "start";

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

/// Where a Create Space that failed can be fixed, by what the system said
/// (UI-111). The page words each one (`packages/app/src/start-refusal.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cause {
    /// The Location may not be written to: shown on Location.
    NoPermission,
    /// The Location's disk is read-only: shown on Location.
    ReadOnly,
    /// The Location is not there, or is not a folder: shown on Location.
    LocationGone,
    /// The disk, or the person's share of it, is full: a notice.
    DiskFull,
    /// Anything else: a notice.
    Other,
}

impl Cause {
    /// Its stable code, as the page reads it.
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::NoPermission => "no-permission",
            Self::ReadOnly => "read-only",
            Self::LocationGone => "location-gone",
            Self::DiskFull => "disk-full",
            Self::Other => "failed",
        }
    }

    /// Whether it is fixed by choosing another Location, and shown there.
    #[must_use]
    pub fn is_in_the_location(self) -> bool {
        matches!(
            self,
            Self::NoPermission | Self::ReadOnly | Self::LocationGone
        )
    }

    fn of_kind(kind: io::ErrorKind) -> Self {
        match kind {
            io::ErrorKind::PermissionDenied => Self::NoPermission,
            io::ErrorKind::ReadOnlyFilesystem => Self::ReadOnly,
            io::ErrorKind::NotFound | io::ErrorKind::NotADirectory => Self::LocationGone,
            io::ErrorKind::StorageFull | io::ErrorKind::QuotaExceeded => Self::DiskFull,
            _ => Self::Other,
        }
    }
}

/// The cause of `error`, by the first [`io::Error`] in its chain of sources,
/// `error` itself first. A Location that is not there is
/// [`Cause::LocationGone`] whatever the system said, since the write makes a
/// missing Location and only fails to when it cannot; a failure with no
/// system error beneath it is [`Cause::Other`].
#[must_use]
pub fn cause_of(error: &(dyn std::error::Error + 'static), location_present: bool) -> Cause {
    let mut next = Some(error);
    while let Some(current) = next {
        if let Some(system) = current.downcast_ref::<io::Error>() {
            return if location_present {
                Cause::of_kind(system.kind())
            } else {
                Cause::LocationGone
            };
        }
        next = current.source();
    }
    Cause::Other
}

/// Which of New Space's rules for a name refused it. The page words each
/// one by its code (`packages/app/src/start-refusal.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameRule {
    /// Empty, `.` or `..`, or holding a path separator.
    NotAFolderName,
    /// Holding a character Windows forbids in a folder name.
    ForbiddenCharacter(char),
    /// A name Windows reserves for a device.
    Reserved,
    /// Ending in a dot or a space, which Windows drops.
    TrailingDotOrSpace,
    /// A file, not a folder, holds the name in the Location.
    TakenByAFile,
}

impl NameRule {
    /// Its stable code, as the page reads it.
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::NotAFolderName => "not-a-folder-name",
            Self::ForbiddenCharacter(_) => "forbidden-character",
            Self::Reserved => "reserved",
            Self::TrailingDotOrSpace => "trailing-dot-or-space",
            Self::TakenByAFile => "taken-by-a-file",
        }
    }
}

/// Why New Space wrote nothing, or opened nothing, as the page shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotCreated {
    /// The name breaks one of New Space's rules: shown beside Name.
    Name { rule: NameRule },
    /// The folder `<location>/<name>` holds something: shown beside Name,
    /// worded by the page from the name and Location it sent.
    Folder,
    /// The name and Location were accepted, and listing the folder or the
    /// write failed: shown where [`Cause`] says, with the system's words in
    /// `detail`, and whether anything was left in the folder (`kept`).
    Failed {
        cause: Cause,
        detail: String,
        kept: bool,
    },
    /// The Space was written to `folder` and did not open: a notice
    /// offering to open the folder.
    NotOpened { folder: PathBuf, detail: String },
}

impl NotCreated {
    /// As the page reads it: `{ of }`, with `rule` (and a forbidden
    /// `character`) for a name, `detail`
    /// for a failure, `kept` for a failure no field fixes, and `folder` for
    /// a Space written and not opened.
    #[must_use]
    pub fn to_page(&self) -> Value {
        match self {
            Self::Name {
                rule: NameRule::ForbiddenCharacter(character),
            } => json!({
                "of": "name",
                "rule": NameRule::ForbiddenCharacter(*character).code(),
                "character": character.to_string(),
            }),
            Self::Name { rule } => json!({ "of": "name", "rule": rule.code() }),
            Self::Folder => json!({ "of": "folder" }),
            Self::Failed {
                cause,
                detail,
                kept,
            } => {
                if cause.is_in_the_location() {
                    json!({ "of": cause.code(), "detail": detail })
                } else {
                    json!({ "of": cause.code(), "detail": detail, "kept": kept })
                }
            }
            Self::NotOpened { folder, detail } => json!({
                "of": "not-opened",
                "folder": folder.display().to_string(),
                "detail": detail,
            }),
        }
    }
}

/// Why nothing was written, from New Space's folder rules.
fn refused(listing: &impl Listing, location: &Path, refused: Refused) -> NotCreated {
    let name = |rule| NotCreated::Name { rule };
    match refused {
        Refused::NotAFolderName => name(NameRule::NotAFolderName),
        Refused::ForbiddenCharacter(character) => name(NameRule::ForbiddenCharacter(character)),
        Refused::Reserved => name(NameRule::Reserved),
        Refused::TrailingDotOrSpace => name(NameRule::TrailingDotOrSpace),
        Refused::IsAFile(_) => name(NameRule::TakenByAFile),
        Refused::NotEmpty(_) => NotCreated::Folder,
        Refused::Unlisted { ref source, .. } => NotCreated::Failed {
            cause: cause_of(source, location_present(listing, location)),
            detail: refused.to_string(),
            kept: false,
        },
    }
}

/// Whether `location` is there: a listing that fails says something is.
fn location_present(listing: &impl Listing, location: &Path) -> bool {
    !matches!(listing.names(location), Ok(None))
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
    let folder = new_space_folder(listing, location, name, platform)
        .map_err(|refusal| refused(listing, location, refusal))?;
    let reason = match new_space::create_space(fs, &folder, name, ids).await {
        Ok(()) => return Ok(folder),
        // Filled between the check and the write.
        Err(NotOpened::NotEmpty(_)) => return Err(NotCreated::Folder),
        Err(reason) => reason,
    };
    let (cause, detail) = match &reason {
        // The folder is named once, in the system's words beneath.
        NotOpened::NotCreated { source, .. } => (
            cause_of(source, location_present(listing, location)),
            source.to_string(),
        ),
        other => (Cause::Other, other.to_string()),
    };
    Err(NotCreated::Failed {
        cause,
        detail,
        // A folder that cannot be listed is not said to hold nothing.
        kept: !is_free(listing, &folder).unwrap_or(false),
    })
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
/// Async, so listing Documents runs off the main thread.
#[tauri::command(async)]
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
/// the Start window once its window shows ([`launch::closes_start`]).
/// Answers nothing then, or why not ([`NotCreated`], as the page reads it):
/// a refusal is an answer the page draws, not a failed invoke. A folder
/// another request is still starting has no window to close on, so it comes
/// back as written and not opened, which the page offers to open again.
#[tauri::command]
pub async fn start_create_space(app: AppHandle, location: String, name: String) -> Option<Value> {
    let created = tauri::async_runtime::spawn_blocking(move || {
        let written = crate::one_write_at_a_time(create_new_space(
            &FolderListing,
            &TokioFilesystem,
            &RandomIds,
            Path::new(&location),
            &name,
            Platform::CURRENT,
        ))?;
        match crate::open_aggregate_at(&app, &written) {
            Ok(opened) if launch::closes_start(Opening::StartWindow, opened) => {
                close(&app);
                Ok(())
            }
            Ok(_still_starting) => Err(NotCreated::NotOpened {
                detail: format!(
                    "{} is still being opened by another request.",
                    written.display()
                ),
                folder: written,
            }),
            Err(reason) if reason.tells_the_presenter() => Err(NotCreated::NotOpened {
                detail: reason.to_string(),
                folder: written,
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
                cause: Cause::Other,
                detail: format!("Could not create the Space: {error}"),
                // A task that ended part-way may have written some files.
                kept: true,
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

/// Open a recent Space's folder, or the folder of a new Space that was
/// written and did not open ([`NotCreated::NotOpened`]), as Open Folder…
/// would.
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
