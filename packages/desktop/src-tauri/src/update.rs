//! Offers a newer preview build when the shell starts, and when Check for
//! Updates… asks (rust-host issue 06).
//!
//! A build whose configuration names the updater (`plugins.updater` in
//! `tauri.conf.json`: the endpoint and the public key its updates are signed
//! with) asks the endpoint once, at launch, whether a newer build is published,
//! and again each time the menu asks. When one is, a dialog offers to install
//! it. The installed build replaces the
//! application on disk and is the one the next launch starts: nothing restarts
//! the running shell, so no open Aggregate's run is stopped before its last
//! write (Storage ST-122). A failed check or install is reported on standard
//! error and changes nothing; asked from the menu, a dialog also says so, or
//! says this build is the newest.

use tauri::{AppHandle, Config};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Whether this build's configuration names the updater. The updater plugin
/// refuses a configuration without its public key, so a build without one,
/// such as a development build, registers no updater.
pub fn configured(config: &Config) -> bool {
    config.plugins.0.contains_key("updater")
}

/// Who asked for a check, which decides what a check that finds nothing says.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Checking {
    /// The launch's own check, which says nothing unless it finds a build.
    AtLaunch,
    /// Check for Updates…, which the person asked for, so every outcome is
    /// answered in a dialog.
    FromMenu,
}

/// Asks the endpoint for a newer build and, if there is one, offers it.
#[expect(
    clippy::print_stderr,
    reason = "a check for an update that fails is reported on standard error and changes nothing"
)]
pub async fn offer(app: AppHandle, checking: Checking) {
    let found = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match found {
        Ok(Some(update)) => ask(app, update),
        Ok(None) => {
            if checking == Checking::FromMenu {
                let version = app.package_info().version.to_string();
                tell(
                    &app,
                    format!("InfinityCube {version} is the newest build."),
                    MessageDialogKind::Info,
                );
            }
        }
        Err(error) => {
            eprintln!("Could not check for a newer InfinityCube: {error}");
            if checking == Checking::FromMenu {
                tell(
                    &app,
                    format!("Could not check for a newer InfinityCube: {error}"),
                    MessageDialogKind::Error,
                );
            }
        }
    }
}

fn tell(app: &AppHandle, message: String, kind: MessageDialogKind) {
    app.dialog()
        .message(message)
        .title("InfinityCube")
        .kind(kind)
        .show(|_| {});
}

fn ask(app: AppHandle, update: Update) {
    let question = format!(
        "InfinityCube {} is available (this is {}). Install it now? It opens the next time you open InfinityCube.",
        update.version, update.current_version
    );
    let dialogs = app.clone();
    dialogs
        .dialog()
        .message(question)
        .title("InfinityCube")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install".to_owned(),
            "Not now".to_owned(),
        ))
        .show(move |install| {
            if install {
                drop(tauri::async_runtime::spawn(self::install(app, update)));
            }
        });
}

async fn install(app: AppHandle, update: Update) {
    let version = update.version.clone();
    let (message, kind) = match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => (
            format!(
                "InfinityCube {version} is installed. It opens the next time you open InfinityCube."
            ),
            MessageDialogKind::Info,
        ),
        Err(error) => (
            format!("Could not install InfinityCube {version}: {error}"),
            MessageDialogKind::Error,
        ),
    };
    tell(&app, message, kind);
}
