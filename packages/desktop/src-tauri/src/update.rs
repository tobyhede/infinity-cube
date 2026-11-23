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
//!
//! One check runs at a time, from the check through the offer to the install
//! ([`Updating`]): a check asked for while one runs, or once a newer build is
//! installed (the running build still being the old one), starts nothing,
//! and from the menu says why.

use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Config, Manager};
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

/// Where the application's one check stands, managed by the shell.
#[derive(Debug, Default)]
pub struct Updating(Mutex<Phase>);

#[derive(Clone, Debug, Default, PartialEq, Eq)]
enum Phase {
    #[default]
    Idle,
    /// Checking, offering or installing.
    Busy,
    /// This version is installed and opens at the next launch.
    Installed(String),
}

/// What asking for a check did.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Begun {
    Started,
    AlreadyRunning,
    AlreadyInstalled(String),
}

impl Phase {
    fn begin(&mut self) -> Begun {
        match self {
            Self::Idle => {
                *self = Self::Busy;
                Begun::Started
            }
            Self::Busy => Begun::AlreadyRunning,
            Self::Installed(version) => Begun::AlreadyInstalled(version.clone()),
        }
    }

    /// Ends the running check, with the version it installed, if any.
    fn end(&mut self, installed: Option<String>) {
        *self = installed.map_or(Self::Idle, Self::Installed);
    }
}

impl Updating {
    fn begin(&self) -> Begun {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .begin()
    }

    fn end(&self, installed: Option<String>) {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .end(installed);
    }
}

fn end(app: &AppHandle, installed: Option<String>) {
    app.state::<Updating>().end(installed);
}

/// Asks the endpoint for a newer build and, if there is one, offers it,
/// unless a check is already running or a newer build is installed.
#[expect(
    clippy::print_stderr,
    reason = "a check for an update that fails is reported on standard error and changes nothing"
)]
pub async fn offer(app: AppHandle, checking: Checking) {
    match app.state::<Updating>().begin() {
        Begun::Started => {}
        Begun::AlreadyRunning => {
            if checking == Checking::FromMenu {
                tell(
                    &app,
                    "InfinityCube is already checking for, or installing, a newer build."
                        .to_owned(),
                    MessageDialogKind::Info,
                );
            }
            return;
        }
        Begun::AlreadyInstalled(version) => {
            if checking == Checking::FromMenu {
                tell(&app, installed_message(&version), MessageDialogKind::Info);
            }
            return;
        }
    }
    let found = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    if !matches!(found, Ok(Some(_))) {
        end(&app, None);
    }
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
            } else {
                end(&app, None);
            }
        });
}

async fn install(app: AppHandle, update: Update) {
    let version = update.version.clone();
    let (message, kind) = match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            end(&app, Some(version.clone()));
            (installed_message(&version), MessageDialogKind::Info)
        }
        Err(error) => {
            end(&app, None);
            (
                format!("Could not install InfinityCube {version}: {error}"),
                MessageDialogKind::Error,
            )
        }
    };
    tell(&app, message, kind);
}

fn installed_message(version: &str) -> String {
    format!("InfinityCube {version} is installed. It opens the next time you open InfinityCube.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_a_check_when_none_is_running() {
        let mut phase = Phase::Idle;
        assert_eq!(phase.begin(), Begun::Started);
        assert_eq!(phase, Phase::Busy);
    }

    mod given_a_check_running {
        use super::*;

        #[test]
        fn starts_no_second_check() {
            let mut phase = Phase::Busy;
            assert_eq!(phase.begin(), Begun::AlreadyRunning);
            assert_eq!(phase, Phase::Busy);
        }

        #[test]
        fn another_may_start_once_it_ends_with_nothing_installed() {
            let mut phase = Phase::Busy;
            phase.end(None);
            assert_eq!(phase.begin(), Begun::Started);
        }
    }

    mod given_a_newer_build_installed {
        use super::*;

        #[test]
        fn starts_no_check_and_names_the_installed_version() {
            let mut phase = Phase::Busy;
            phase.end(Some("0.2.0".to_owned()));
            assert_eq!(phase.begin(), Begun::AlreadyInstalled("0.2.0".to_owned()));
            assert_eq!(phase.begin(), Begun::AlreadyInstalled("0.2.0".to_owned()));
        }
    }
}
