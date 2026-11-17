//! The InfinityCube desktop application (ADR 0155, first stage).
//!
//! A home window offers to open a talk folder, and a folder named on the
//! command line opens at once. Each folder opens in a window
//! of its own, served by a sidecar of its own; closing the window stops that
//! sidecar, which writes any edit not yet on disk first.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::sidecar::{Sidecar, Started, Stopped};

/// How long a sidecar has to write its last edit before it is killed.
const STOP_GRACE: Duration = Duration::from_secs(5);

const TALK_WINDOW_PREFIX: &str = "talk-";

/// The sidecar behind each open talk window, by window label.
#[derive(Default)]
struct Talks {
    sidecars: Mutex<HashMap<String, Sidecar>>,
    next: AtomicU64,
}

impl Talks {
    fn insert(&self, label: String, sidecar: Sidecar) {
        if let Ok(mut sidecars) = self.sidecars.lock() {
            sidecars.insert(label, sidecar);
        }
    }

    fn take(&self, label: &str) -> Option<Sidecar> {
        self.sidecars.lock().ok()?.remove(label)
    }

    fn take_all(&self) -> Vec<Sidecar> {
        self.sidecars
            .lock()
            .map(|mut sidecars| sidecars.drain().map(|(_, sidecar)| sidecar).collect())
            .unwrap_or_default()
    }
}

#[derive(Debug, thiserror::Error)]
enum OpenError {
    #[error("could not find where the application keeps its files: {0}")]
    Paths(#[from] tauri::Error),
    #[error("could not find the application's own executable: {0}")]
    Executable(#[source] std::io::Error),
    #[error(transparent)]
    Sidecar(#[from] sidecar::SidecarError),
    #[error("the sidecar's address is not a URL: {0}")]
    Url(#[from] url::ParseError),
}

/// The sidecar executable, which the bundle puts beside the application's own.
fn sidecar_binary() -> Result<PathBuf, OpenError> {
    let executable = std::env::current_exe().map_err(OpenError::Executable)?;
    let name = if cfg!(windows) {
        "desktop-sidecar.exe"
    } else {
        "desktop-sidecar"
    };
    Ok(executable.with_file_name(name))
}

/// Ask for a folder, and open it as a talk.
#[tauri::command]
fn open_talk(app: AppHandle) {
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("Open a talk folder")
        .pick_folder(move |folder| {
            let Some(path) = folder.and_then(|folder| folder.into_path().ok()) else {
                return;
            };
            // Starting a sidecar waits for it to announce itself, so it stays
            // off the thread the dialog answered on.
            thread::spawn(move || {
                if let Err(error) = open_talk_at(&handle, &path) {
                    show_error(
                        &handle,
                        &format!("Could not open {}: {error}", path.display()),
                    );
                }
            });
        });
}

fn open_talk_at(app: &AppHandle, folder: &Path) -> Result<(), OpenError> {
    let built = app.path().resource_dir()?.join("app");
    match sidecar::start(&sidecar_binary()?, folder, &built)? {
        Started::Refused { message } => {
            show_error(app, &message);
            Ok(())
        }
        Started::Listening {
            sidecar,
            port,
            secret,
        } => {
            let talks = app.state::<Talks>();
            let label = format!(
                "{TALK_WINDOW_PREFIX}{}",
                talks.next.fetch_add(1, Ordering::Relaxed)
            );
            let url = url::Url::parse(&format!("http://127.0.0.1:{port}/?launch={secret}"))?;
            let title = folder.file_name().map_or_else(
                || folder.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            );
            talks.insert(label.clone(), sidecar);
            let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
                .title(title)
                .inner_size(1280.0, 800.0)
                .build();
            if let Err(error) = built {
                if let Some(sidecar) = talks.take(&label) {
                    stop_sidecar(sidecar);
                }
                return Err(error.into());
            }
            Ok(())
        }
    }
}

/// Stop a talk's sidecar, saying on standard error if its last write may not have landed.
fn stop_sidecar(sidecar: Sidecar) {
    match sidecar.stop(STOP_GRACE) {
        Stopped::Exited(status) if status.success() => {}
        Stopped::Exited(status) => {
            eprintln!("A talk's sidecar stopped with {status}; its last edit may not be on disk.")
        }
        Stopped::Killed => eprintln!(
            "A talk's sidecar did not stop within {STOP_GRACE:?} and was killed; its last edit may not be on disk."
        ),
    }
}

fn show_error(app: &AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("InfinityCube")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Talks::default())
        .invoke_handler(tauri::generate_handler![open_talk])
        .setup(|app| {
            // A folder named on the command line opens at once, as one chosen
            // from the home window would.
            for folder in std::env::args_os().skip(1).map(PathBuf::from) {
                let handle = app.handle().clone();
                thread::spawn(move || {
                    if let Err(error) = open_talk_at(&handle, &folder) {
                        show_error(
                            &handle,
                            &format!("Could not open {}: {error}", folder.display()),
                        );
                    }
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            let WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            if !window.label().starts_with(TALK_WINDOW_PREFIX) {
                return;
            }
            let Some(sidecar) = window.state::<Talks>().take(window.label()) else {
                return;
            };
            // The window stays until its sidecar has written the last edit.
            api.prevent_close();
            let window = window.clone();
            thread::spawn(move || {
                stop_sidecar(sidecar);
                let _ = window.destroy();
            });
        })
        .build(tauri::generate_context!());
    let app = match app {
        Ok(app) => app,
        Err(error) => {
            eprintln!("InfinityCube could not start: {error}");
            std::process::exit(1);
        }
    };
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // Every talk still open writes its last edit before the process ends.
            let stopping: Vec<_> = app
                .state::<Talks>()
                .take_all()
                .into_iter()
                .map(|sidecar| thread::spawn(move || stop_sidecar(sidecar)))
                .collect();
            for stop in stopping {
                let _ = stop.join();
            }
        }
    });
}
