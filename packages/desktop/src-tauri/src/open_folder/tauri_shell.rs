//! The Tauri adapter of [`OpenFolderPort`], and the shell's requests for a
//! folder to open: the platform's folder chooser, a list of folders, and
//! New Space.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, Manager, WebviewUrl};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use super::{OpenFolderPort, Origin};
use crate::server::{AggregateServer, OpenError, SpaceWindows, Started};
use crate::start::{self, NotCreated};
use crate::{Aggregates, open_window, show_error_and_wait, stop_server};

/// The shell's windows, servers and dialogs, through the application.
pub struct TauriShell<'a>(pub &'a AppHandle);

impl OpenFolderPort for TauriShell<'_> {
    type Server = AggregateServer;
    type Window = (WebviewUrl, Arc<SpaceWindows>);

    fn start(&self, directory: &Path, label: &str) -> Result<Started, OpenError> {
        AggregateServer::start(self.0, directory, label)
    }

    fn window_of(server: &AggregateServer) -> Self::Window {
        (server.window_url(), server.windows())
    }

    fn open_window(
        &self,
        label: &str,
        (url, windows): Self::Window,
        title: &str,
    ) -> Result<(), OpenError> {
        open_window(self.0, label, url, title, windows).map_err(OpenError::from)
    }

    fn stop(&self, server: AggregateServer, directory: &Path) {
        stop_server(self.0, server, directory);
    }

    fn focus(&self, label: &str) -> bool {
        let Some(window) = self.0.get_webview_window(label) else {
            return false;
        };
        let _ = window.set_focus();
        true
    }

    fn offer_new_space(&self, directory: &Path) -> bool {
        self.0
            .dialog()
            .message(format!(
                "{} holds no Space yet. Create a new Space in it?",
                directory.display()
            ))
            .title("InfinityCube")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Create Space".to_owned(),
                "Cancel".to_owned(),
            ))
            .blocking_show()
    }

    fn show_error(&self, message: &str) {
        show_error_and_wait(self.0, message);
    }

    fn show_start(&self) {
        start::show(self.0, start::Screen::Start);
    }

    fn close_start(&self) {
        start::close(self.0);
    }
}

/// Open each of `folders`, asked for from `origin` ([`super::open`]).
/// Off the event loop's thread.
pub fn open(app: &AppHandle, origin: Origin, folders: &[PathBuf]) {
    super::open(
        &TauriShell(app),
        &app.state::<Aggregates>().registry,
        origin,
        folders,
    );
}

/// New Space's Create Space ([`super::create_space`]). Off the event loop's
/// thread.
///
/// # Errors
///
/// [`NotCreated`], as the Start window's page draws it.
pub fn create_space(app: &AppHandle, location: &Path, name: &str) -> Result<(), NotCreated> {
    super::create_space(
        &TauriShell(app),
        &app.state::<Aggregates>().registry,
        location,
        name,
    )
}

/// Ask for a folder with the platform's chooser, and open it as an
/// Aggregate. Cancelling does nothing.
pub fn choose_folder(app: &AppHandle, origin: Origin) {
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("Open a Space")
        .pick_folder(move |folder| {
            let Some(path) = folder.and_then(|folder| folder.into_path().ok()) else {
                return;
            };
            // Starting a run reads the whole directory, so it stays off the
            // thread the dialog answered on.
            thread::spawn(move || open(&handle, origin, &[path]));
        });
}
