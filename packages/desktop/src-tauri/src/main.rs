//! The InfinityCube desktop application (ADR 0155, first stage).
//!
//! A home window offers to open an Aggregate directory, and a directory named
//! on the command line opens at once. Each directory opens in a window of its
//! own, served by a sidecar of its own; opening it again focuses that window.
//! Closing the window stops that sidecar, which writes any edit not yet on
//! disk first, and says so in a dialog if that write may not have landed. A
//! sidecar that stops by itself closes its window with a dialog saying why.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;
mod talks;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::sidecar::{ANNOUNCE_DEADLINE, STOP_GRACE, Sidecar, Started};
use crate::talks::{Close, Registry, Reserved, TALK_WINDOW_PREFIX};

/// How often the shell looks for a sidecar that stopped by itself.
const WATCH_EVERY: Duration = Duration::from_millis(500);

/// Every talk, and the stops still under way for windows already closing.
#[derive(Default)]
struct Talks {
    registry: Mutex<Registry<Sidecar>>,
    stopping: Mutex<Vec<JoinHandle<()>>>,
}

/// The data behind `mutex`, even if a thread panicked holding it: a map of
/// sidecars stays valid whatever panicked, and losing one would orphan it.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Talks {
    fn registry(&self) -> MutexGuard<'_, Registry<Sidecar>> {
        lock(&self.registry)
    }

    /// Keep a closing window's stop, so quitting waits for it.
    fn keep_stopping(&self, stop: JoinHandle<()>) {
        let mut stopping = lock(&self.stopping);
        stopping.retain(|stop| !stop.is_finished());
        stopping.push(stop);
    }

    fn take_stopping(&self) -> Vec<JoinHandle<()>> {
        std::mem::take(&mut *lock(&self.stopping))
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
        .set_title("Open")
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
    // Two spellings of one directory are one talk; a path that cannot be
    // resolved is passed on as given, for the sidecar to refuse.
    let directory = std::fs::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
    let talks = app.state::<Talks>();
    let reserved = talks.registry().reserve(&directory);
    let label = match reserved {
        Reserved::New(label) => label,
        Reserved::Existing(label) => {
            // Still starting, there is no window yet, and it shows when it opens.
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.set_focus();
            }
            return Ok(());
        }
    };
    let opened = start_talk(app, &directory, &label);
    if !matches!(opened, Ok(true)) {
        let abandoned = talks.registry().abandon(&label);
        if let Some(sidecar) = abandoned {
            stop_sidecar(app, sidecar, &directory);
        }
    }
    opened.map(|_| ())
}

/// Start `directory`'s sidecar and open its window as `label`, answering
/// whether the talk opened.
fn start_talk(app: &AppHandle, directory: &Path, label: &str) -> Result<bool, OpenError> {
    let built = app.path().resource_dir()?.join("app");
    match sidecar::start(&sidecar_binary()?, directory, &built, ANNOUNCE_DEADLINE)? {
        Started::Refused { message } => {
            show_error(app, &message);
            Ok(false)
        }
        Started::Listening {
            sidecar,
            port,
            secret,
        } => {
            let url = url::Url::parse(&format!("http://127.0.0.1:{port}/?launch={secret}"))?;
            let title = directory.file_name().map_or_else(
                || directory.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            );
            let opened = app.state::<Talks>().registry().opened(label, sidecar);
            if let Err(sidecar) = opened {
                stop_sidecar(app, sidecar, directory);
                return Ok(false);
            }
            let origin = url.origin();
            WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
                .title(title)
                .inner_size(1280.0, 800.0)
                // A talk window shows its own sidecar and nothing else: a link
                // to anywhere else in the talk's content is refused.
                .on_navigation(move |to| to.origin() == origin)
                .build()?;
            Ok(true)
        }
    }
}

/// Stop a talk's sidecar, and say in a dialog if its last write may not have landed.
fn stop_sidecar(app: &AppHandle, sidecar: Sidecar, directory: &Path) {
    if let Some(reason) = sidecar.stop(STOP_GRACE).unwritten() {
        show_error(app, &unwritten_message(directory, &reason));
    }
}

fn unwritten_message(directory: &Path, reason: &str) -> String {
    format!(
        "The last edit to {} may not be on disk: {reason}.",
        directory.display()
    )
}

/// Close the window of every talk whose sidecar stopped by itself, saying why.
fn watch_sidecars(app: &AppHandle) {
    loop {
        thread::sleep(WATCH_EVERY);
        let ended = app
            .state::<Talks>()
            .registry()
            .ended(|sidecar| sidecar.exited());
        for ended in ended {
            show_error(
                app,
                &format!(
                    "The talk in {} stopped by itself ({}), so its window was closed. An edit made since its last write may not be on disk.",
                    ended.directory.display(),
                    ended.how
                ),
            );
            if let Some(window) = app.get_webview_window(&ended.label) {
                let _ = window.destroy();
            }
        }
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
            let handle = app.handle().clone();
            thread::spawn(move || watch_sidecars(&handle));
            // A directory named on the command line opens at once, as one
            // chosen from the home window would.
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
            let talks = window.state::<Talks>();
            let close = talks.registry().begin_close(window.label());
            match close {
                Close::NotOpen => {}
                // The window stays until its sidecar has written the last edit.
                Close::StillClosing => api.prevent_close(),
                Close::Stop { sidecar, directory } => {
                    api.prevent_close();
                    let window = window.clone();
                    talks.keep_stopping(thread::spawn(move || {
                        let app = window.app_handle();
                        stop_sidecar(app, sidecar, &directory);
                        app.state::<Talks>().registry().closed(window.label());
                        let _ = window.destroy();
                    }));
                }
            }
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
            // Every talk still open, or still closing, writes its last edit
            // before the process ends. The event loop is ending, so a write
            // that may not have landed is reported on standard error only.
            let talks = app.state::<Talks>();
            let open = talks.registry().take_all();
            let mut stopping: Vec<_> = open
                .into_iter()
                .map(|(directory, sidecar)| {
                    thread::spawn(move || {
                        if let Some(reason) = sidecar.stop(STOP_GRACE).unwritten() {
                            eprintln!("{}", unwritten_message(&directory, &reason));
                        }
                    })
                })
                .collect();
            stopping.extend(talks.take_stopping());
            for stop in stopping {
                let _ = stop.join();
            }
        }
    });
}
