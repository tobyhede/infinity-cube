//! A folder opens as an Aggregate here, wherever it was asked for: named
//! on the command line, chosen from the Start window (Open Folder…, a recent
//! Space, New Space) or from File › Open… (Storage ST-121, ST-131).
//!
//! Two entry points: [`open`] for folders, always a batch, and
//! [`create_space`] for the Start window's New Space, the one request whose
//! caller reads an answer. Both take one path: reserve the folder in the
//! [`Registry`], start it, register its server and open its window, undoing
//! what was done if a later step fails, and decide whether the Start window
//! closes or shows. Only [`open`] offers a new Space in a folder that holds
//! none; [`create_space`] has just written one. A
//! Space window that shows from the Start window closes it, and only a
//! launch can be left with no window, so only a launch shows it, and never
//! once a quit has begun (Storage ST-121).
//!
//! What the shell does with windows, servers and dialogs crosses the
//! [`OpenFolderPort`], which the Tauri adapter ([`tauri_shell`]) and the tests'
//! recording fake implement. Both entry points block until the presenter
//! has answered every dialog they show, and so are called off the thread
//! the event loop runs on.

use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use host::{NEW_SPACE_TITLE, RandomIds, TokioFilesystem};

use crate::aggregates::{Registry, Reserved, lock};
use crate::database::{Database, capitalized};
use crate::new_space;
use crate::new_space_folder::{FolderListing, Platform};
use crate::not_opened::NotOpened;
use crate::server::{OpenError, Started};
use crate::start::{NotCreated, create_new_space};

pub mod tauri_shell;

/// Where a folder was asked for, which decides what is said when it does
/// not open and whether the Start window closes or shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    /// Named on the command line.
    CommandLine,
    /// From the Start window's Open Folder… or a recent Space.
    StartWindow,
    /// From File › Open….
    Menu,
}

/// How a folder that opened came to: its window shows, or another request
/// is still starting it and opens its window when it has.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Opened {
    /// Its Space window shows: opened now, or already open and focused.
    Shown,
    /// Another request (a File › Open… of the same folder, say) is still
    /// starting it, so no window shows yet, and that start may yet fail.
    Starting,
    /// A close or a quit took it while it started: nothing is said, and
    /// nothing is left for the Start window to stay open for.
    Overtaken,
}

/// What a folder's open does to the shell's windows and servers. Each
/// method returns once its work is done, a dialog's once the presenter has
/// answered it.
pub trait OpenFolderPort {
    /// What serves one Aggregate, held by the [`Registry`] while it is open.
    type Server;
    /// What a Space window is opened on, taken from its server before the
    /// server goes to the [`Registry`].
    type Window;

    /// Start serving `directory` for the Space window `label`.
    ///
    /// # Errors
    ///
    /// The server could not be started.
    fn start(&self, directory: &Path, label: &str) -> Result<Started<Self::Server>, OpenError>;

    /// Start serving `database` for the Space window `label` (ADR 0181).
    ///
    /// # Errors
    ///
    /// The server could not be started; a database the shell cannot serve
    /// is [`Started::Refused`].
    fn start_database(
        &self,
        database: &Database,
        label: &str,
    ) -> Result<Started<Self::Server>, OpenError>;

    /// What `server`'s Space window opens on.
    fn window_of(server: &Self::Server) -> Self::Window;

    /// Open the Space window `label`, titled `title`, on `window`.
    ///
    /// # Errors
    ///
    /// The window could not be opened.
    fn open_window(&self, label: &str, window: Self::Window, title: &str) -> Result<(), OpenError>;

    /// Stop `server`, which serves `directory`, saying so if its last write
    /// may not have landed.
    fn stop(&self, server: Self::Server, directory: &Path);

    /// Bring the window `label` forward, answering whether there is one.
    fn focus(&self, label: &str) -> bool;

    /// Ask whether to write a new Space in `directory`, which holds none.
    fn offer_new_space(&self, directory: &Path) -> bool;

    /// Tell the presenter why a folder did not open.
    fn show_error(&self, message: &str);

    /// Show the Start window.
    fn show_start(&self);

    /// Close the Start window.
    fn close_start(&self);
}

/// Open each of `folders`, asked for from `origin`, offering a new Space in
/// one that holds none and saying why one did not open. A Space window that
/// shows from the Start window closes it. After a launch, the Start window
/// shows if a folder named is still unopened, or none was named, no
/// Aggregate is open, starting or closing, and no quit has begun.
pub fn open<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    origin: Origin,
    folders: &[PathBuf],
) {
    match origin {
        // Every folder named starts before any is answered, so a dialog
        // about one does not hold up the others.
        Origin::CommandLine => {
            let unopened: Vec<NotOpened> = folders
                .iter()
                .filter_map(|folder| open_aggregate_at(shell, registry, folder).err())
                .collect();
            let mut still_unopened = folders.is_empty();
            for reason in unopened {
                still_unopened |= answer(shell, registry, reason).is_none();
            }
            let nothing_open = {
                let registry = lock(registry);
                registry.is_empty() && !registry.is_quitting()
            };
            if still_unopened && nothing_open {
                shell.show_start();
            }
        }
        Origin::StartWindow | Origin::Menu => {
            for folder in folders {
                let opened = match open_aggregate_at(shell, registry, folder) {
                    Ok(opened) => Some(opened),
                    Err(reason) => answer(shell, registry, reason),
                };
                if closes_start(origin, opened) {
                    shell.close_start();
                }
            }
        }
    }
}

/// New Space's Create Space: write `<location>/<name>` and open it, closing
/// the Start window once its window shows. A folder another request is
/// still starting has no window to close on, so it comes back as written
/// and not opened, which the page offers to open again.
///
/// # Errors
///
/// [`NotCreated`], as the Start window's page draws it: the name or the
/// folder refused, the write failed, or the Space written did not open.
pub fn create_space<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    location: &Path,
    name: &str,
) -> Result<(), NotCreated> {
    let written = one_write_at_a_time(create_new_space(
        &FolderListing,
        &TokioFilesystem,
        &RandomIds,
        location,
        name,
        Platform::CURRENT,
    ))?;
    match open_aggregate_at(shell, registry, &written) {
        Ok(opened) if closes_start(Origin::StartWindow, Some(opened)) => {
            shell.close_start();
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
}

/// Whether the Start window closes once a folder asked for from `origin`
/// has `opened`. It closes when a Space window opens from it (ST-131); a
/// folder another request is still starting has no window yet, and leaves
/// the Start window showing, so a start that fails leaves the presenter a
/// window to go on from.
fn closes_start(origin: Origin, opened: Option<Opened>) -> bool {
    origin == Origin::StartWindow && matches!(opened, Some(Opened::Shown | Opened::Overtaken))
}

/// Write a new Space, titled as `init` titles one, to `directory` and open
/// it: the offer made for a folder that holds no Space.
fn create_and_open<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    directory: &Path,
) -> Result<Opened, NotOpened> {
    one_write_at_a_time(new_space::create_space(
        &TokioFilesystem,
        directory,
        NEW_SPACE_TITLE,
        &RandomIds,
    ))?;
    open_aggregate_at(shell, registry, directory)
}

/// Run `write`, a new Space's write, to its end on this thread, one at a
/// time: two asked for at once cannot both find a folder empty and both
/// write to it, since the second finds the first's files and is refused.
fn one_write_at_a_time<T>(write: impl Future<Output = T>) -> T {
    static CREATING: Mutex<()> = Mutex::new(());
    let _creating = lock(&CREATING);
    tauri::async_runtime::block_on(write)
}

/// Answer why a folder did not open, returning once the presenter has, with
/// how it came to open after all, or `None` while it is still unopened. A
/// folder holding no Space is offered a new one; declining, the folder stays
/// unopened. A close or a quit that took the Aggregate is not answered.
fn answer<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    reason: NotOpened,
) -> Option<Opened> {
    match reason {
        NotOpened::Empty(directory) => {
            if !shell.offer_new_space(&directory) {
                return None;
            }
            match create_and_open(shell, registry, &directory) {
                Ok(opened) => Some(opened),
                Err(reason) => answer(shell, registry, reason),
            }
        }
        reason if reason.tells_the_presenter() => {
            shell.show_error(&reason.to_string());
            None
        }
        _ => Some(Opened::Overtaken),
    }
}

/// Open `folder` as an Aggregate in a window of its own, or focus the window
/// that already has it, answering how it opened, or why it did not.
fn open_aggregate_at<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    folder: &Path,
) -> Result<Opened, NotOpened> {
    // Two spellings of one directory are one Aggregate; a path that cannot be
    // resolved is passed on as given, for the run to refuse.
    let directory = std::fs::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
    let reserved = lock(registry).reserve(&directory);
    let label = match reserved {
        Reserved::New(label) => label,
        // A quit has begun: say nothing, as for any open a quit overtakes.
        Reserved::Quitting => return Err(NotOpened::Abandoned(directory)),
        Reserved::Existing(label) => {
            // Still starting, there is no window yet, and it shows when it
            // opens. Closing without saving, its window is gone while its
            // last write runs on.
            if shell.focus(&label) {
                return Ok(Opened::Shown);
            }
            if lock(registry).is_closing(&label) {
                return Err(NotOpened::StillWriting(directory));
            }
            return Ok(Opened::Starting);
        }
    };
    let opened = start_aggregate(shell, registry, &directory, &label).map(|()| Opened::Shown);
    if opened.is_err() {
        let abandoned = lock(registry).abandon(&label);
        if let Some(server) = abandoned {
            shell.stop(server, &directory);
        }
    }
    opened
}

/// Start `directory`'s server and open its window as `label`, answering why
/// if the Aggregate did not open.
fn start_aggregate<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    directory: &Path,
    label: &str,
) -> Result<(), NotOpened> {
    let could_not = |source: OpenError| NotOpened::Failed {
        directory: directory.to_path_buf(),
        source,
    };
    let server = match shell.start(directory, label).map_err(could_not)? {
        Started::Empty => return Err(NotOpened::Empty(directory.to_path_buf())),
        Started::Refused { message } => return Err(NotOpened::Refused(message)),
        Started::Serving(server) => server,
    };
    let window = S::window_of(&server);
    let opened = lock(registry).opened(label, server);
    if let Err(server) = opened {
        shell.stop(server, directory);
        return Err(NotOpened::Abandoned(directory.to_path_buf()));
    }
    shell
        .open_window(label, window, &title_of(directory))
        .map_err(could_not)
}

/// Open `database`, asked for from `origin`, in a Space window of its own,
/// or focus the window that already has it (ADR 0181). A Space window that
/// shows from the Start window closes it. It holds no Import, Export or
/// lock, so the registry's claim on its place is all that keeps two windows
/// from serving it in this process.
///
/// # Errors
///
/// Why it did not open, naming it without a password, for the caller to
/// show: the Start window's form beside its fields, a dialog otherwise.
/// Nothing is said when a quit took it.
pub fn open_database<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    origin: Origin,
    database: &Database,
) -> Result<(), String> {
    let place = database.place();
    let reserved = lock(registry).reserve(&place);
    let opened = match reserved {
        Reserved::New(label) => {
            let started = start_database(shell, registry, database, &label);
            if started.is_err() {
                let abandoned = lock(registry).abandon(&label);
                if let Some(server) = abandoned {
                    shell.stop(server, &place);
                }
            }
            started?
        }
        // A quit has begun: say nothing, as for any open a quit overtakes.
        Reserved::Quitting => Opened::Overtaken,
        Reserved::Existing(label) => {
            if shell.focus(&label) {
                Opened::Shown
            } else if lock(registry).is_closing(&label) {
                return Err(format!(
                    "{} is still closing. Open it again once its close has ended.",
                    capitalized(&database.named())
                ));
            } else {
                Opened::Starting
            }
        }
    };
    if closes_start(origin, Some(opened)) {
        shell.close_start();
    }
    Ok(())
}

/// Start `database`'s server and open its window as `label`, answering how
/// it opened, or why it did not.
fn start_database<S: OpenFolderPort>(
    shell: &S,
    registry: &Mutex<Registry<S::Server>>,
    database: &Database,
    label: &str,
) -> Result<Opened, String> {
    let could_not = |source: OpenError| format!("Could not open {}: {source}", database.named());
    let server = match shell.start_database(database, label).map_err(could_not)? {
        Started::Serving(server) => server,
        Started::Refused { message } => return Err(message),
        // A folder's answer alone: a database is never offered a new Space.
        Started::Empty => {
            return Err(format!(
                "{} holds no Space.",
                capitalized(&database.named())
            ));
        }
    };
    let window = S::window_of(&server);
    let opened = lock(registry).opened(label, server);
    if let Err(server) = opened {
        shell.stop(server, &database.place());
        return Ok(Opened::Overtaken);
    }
    shell
        .open_window(label, window, &database.title())
        .map_err(could_not)?;
    Ok(Opened::Shown)
}

/// A Space window's title: its folder's name.
fn title_of(directory: &Path) -> String {
    directory.file_name().map_or_else(
        || directory.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

#[cfg(test)]
mod tests;
