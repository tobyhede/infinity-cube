//! The InfinityCube desktop application (ADR 0155).
//!
//! A home window offers to open an Aggregate directory, and a directory named
//! on the command line opens at once. Each directory opens in a window of its
//! own, served by a run of the Rust host of its own, in this process, through
//! the application's URI scheme at the talk's own origin; opening it again
//! focuses that window. A window the talk's page opens (a Resource opened
//! independently, the Notes window) opens under the same origin. Closing the
//! talk's window stops its run, which writes any edit not yet on disk first,
//! and says so in a dialog if that write failed. A write still running ten
//! seconds after a close, or a quit, asks whether to keep waiting
//! ([`waiting`], [`question`]).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod address;
mod built;
mod question;
mod scheme;
mod server;
mod talks;
#[cfg(test)]
mod test_support;
mod waiting;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread::{self, JoinHandle};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Manager, RunEvent, UriSchemeContext, UriSchemeResponder, WebviewUrl,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tokio::sync::mpsc::{self, UnboundedSender};
use url::Url;

use crate::address::{SCHEME, SchemeStyle, TalkKey};
use crate::scheme::{OpenTalks, VIEW_WINDOW_PREFIX};
use crate::server::{
    Navigation, OpenError, RegisteredSchemes, SharedTalks, Started, TalkServer, TalkWindows,
};
use crate::talks::{Close, Registry, Reserved, TALK_WINDOW_PREFIX};
use crate::waiting::{Choice, Effect, Event};

/// Every talk, the stops still under way for talks already closing, by
/// window label, and the talks whose last write the presenter abandoned.
#[derive(Default)]
struct Talks {
    registry: Mutex<Registry<TalkServer>>,
    stopping: Mutex<HashMap<String, JoinHandle<()>>>,
    abandoned: Mutex<HashSet<String>>,
}

/// Where the shell tells the close-wait decision ([`waiting::drive`]) what
/// happened, and whether that decision has let the application end.
struct Closings {
    events: UnboundedSender<Event<String>>,
    exit_allowed: AtomicBool,
}

impl Closings {
    fn send(&self, event: Event<String>) {
        // The decision runs as long as the application does.
        let _sent = self.events.send(event);
    }
}

/// The data behind `mutex`, even if a thread panicked holding it: a map of
/// servers stays valid whatever panicked, and losing one would lose its edits.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Talks {
    fn registry(&self) -> MutexGuard<'_, Registry<TalkServer>> {
        lock(&self.registry)
    }

    /// Keep a closing talk's stop, so quitting waits for it.
    fn keep_stopping(&self, label: String, stop: JoinHandle<()>) {
        let mut stopping = lock(&self.stopping);
        stopping.retain(|_, stop| !stop.is_finished());
        let _replaced = stopping.insert(label, stop);
    }

    fn take_stopping(&self) -> Vec<JoinHandle<()>> {
        lock(&self.stopping).drain().map(|(_, stop)| stop).collect()
    }

    /// The presenter gave up on window `label`'s last write: nothing waits
    /// for its stop any more, and a failure is reported on standard error
    /// only.
    fn abandon(&self, label: &str) {
        let _detached = lock(&self.stopping).remove(label);
        let _new = lock(&self.abandoned).insert(label.to_owned());
    }

    /// Whether window `label`'s last write was abandoned, forgetting it.
    fn take_abandoned(&self, label: &str) -> bool {
        lock(&self.abandoned).remove(label)
    }
}

/// Stop window `label`'s talk on a thread of its own, reporting a failed
/// write on standard error, and in a dialog when `dialog` and the write was
/// not abandoned; then free its directory and tell the close-wait decision
/// the write has ended.
fn spawn_stop(
    app: &AppHandle,
    label: String,
    directory: PathBuf,
    server: TalkServer,
    dialog: bool,
) {
    let handle = app.clone();
    let kept = label.clone();
    let stop = thread::spawn(move || {
        let failed = server.stop();
        let talks = handle.state::<Talks>();
        let abandoned = talks.take_abandoned(&label);
        if let Some(reason) = failed {
            report_unwritten(&handle, &directory, &reason, dialog && !abandoned);
        }
        talks.registry().closed(&label);
        handle.state::<Closings>().send(Event::WriteFinished(label));
    });
    app.state::<Talks>().keep_stopping(kept, stop);
}

/// Do what the close-wait decision decided.
fn apply(app: &AppHandle, effect: Effect<String>) {
    match effect {
        Effect::Ask { wait, folders } => question::ask(app, wait, &folders),
        Effect::Dismiss(wait) => question::dismiss(app, wait),
        Effect::Close(label) => {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.destroy();
            }
        }
        Effect::Abandon(abandoned) => {
            let talks = app.state::<Talks>();
            for (label, directory) in abandoned {
                talks.abandon(&label);
                // The windows its page opened go with it, as a stop that
                // ends takes them.
                let views = format!("{VIEW_WINDOW_PREFIX}{}-", TalkKey::of(&directory).as_str());
                for (other, window) in app.webview_windows() {
                    if other == label || other.starts_with(&views) {
                        let _ = window.destroy();
                    }
                }
            }
        }
        Effect::Exit => {
            app.state::<Closings>()
                .exit_allowed
                .store(true, Ordering::SeqCst);
            app.exit(0);
        }
        // The driver keeps its timers itself.
        Effect::StartTimer(_) => {}
    }
}

/// The question window's answer.
#[tauri::command]
fn answer_closing(window: tauri::WebviewWindow, choice: String) {
    if let (Some(wait), Some(choice)) = (
        question::wait_of(window.label()),
        question::choice_named(&choice),
    ) {
        window.state::<Closings>().send(Event::Chose(wait, choice));
    }
}

/// The application's menu on macOS, whose Quit asks the application to
/// exit, so a quit waits for each talk's last write and may ask (the
/// predefined Quit ends the process without asking the application).
fn mac_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let quit = MenuItem::with_id(app, "quit", "Quit InfinityCube", true, Some("CmdOrCtrl+Q"))?;
    let application = Submenu::with_items(
        app,
        "InfinityCube",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&application, &edit, &window])
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
            // Starting a run reads the whole directory, so it stays off the
            // thread the dialog answered on.
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
    // resolved is passed on as given, for the run to refuse.
    let directory = std::fs::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
    let talks = app.state::<Talks>();
    let reserved = talks.registry().reserve(&directory);
    let label = match reserved {
        Reserved::New(label) => label,
        Reserved::Existing(label) => {
            // Still starting, there is no window yet, and it shows when it
            // opens. Closing without saving, its window is gone while its
            // last write runs on.
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.set_focus();
            } else if talks.registry().is_closing(&label) {
                show_error(
                    app,
                    &format!(
                        "{} is still being written. Open it again once that write has ended.",
                        directory.display()
                    ),
                );
            }
            return Ok(());
        }
    };
    let opened = start_talk(app, &directory, &label);
    if !matches!(opened, Ok(true)) {
        let abandoned = talks.registry().abandon(&label);
        if let Some(server) = abandoned {
            stop_server(app, server, &directory);
        }
    }
    opened.map(|_| ())
}

/// Start `directory`'s server and open its window as `label`, answering
/// whether the talk opened.
fn start_talk(app: &AppHandle, directory: &Path, label: &str) -> Result<bool, OpenError> {
    let server = match TalkServer::start(app, directory, label)? {
        Started::Refused { message } => {
            show_error(app, &message);
            return Ok(false);
        }
        Started::Serving(server) => server,
    };
    let url = server.window_url();
    let title = directory.file_name().map_or_else(
        || directory.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    let windows = server.windows();
    let opened = app.state::<Talks>().registry().opened(label, server);
    if let Err(server) = opened {
        stop_server(app, server, directory);
        return Ok(false);
    }
    open_window(app, label, url, &title, windows)?;
    Ok(true)
}

/// Open a window of a talk, held to what `windows` admits.
fn open_window(
    app: &AppHandle,
    label: &str,
    url: WebviewUrl,
    title: &str,
    windows: Arc<TalkWindows>,
) -> Result<(), tauri::Error> {
    let guard = Arc::clone(&windows);
    let navigating = app.clone();
    let own_label = label.to_owned();
    let handle = app.clone();
    let title_of_new = title.to_owned();
    WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(1280.0, 800.0)
        // A talk window shows its own talk and nothing else: a link to
        // anywhere else in the talk's content is refused, and its root,
        // whose redirect WebKitGTK does not follow, is replaced by the
        // address it redirects to.
        .on_navigation(move |to| match guard.navigation(to) {
            Navigation::Load => true,
            Navigation::Refuse => false,
            Navigation::Redirect(first) => {
                let app = navigating.clone();
                let label = own_label.clone();
                // Not from inside the webview's own navigation callback.
                thread::spawn(move || {
                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.navigate(first);
                    }
                });
                false
            }
        })
        // A window the page opens (`noopener`, so it needs no opener) is a
        // window of the same talk at the same origin, or none at all.
        .on_new_window(move |to, _features| {
            if let Some((label, url)) = windows.open_from_page(&to) {
                let handle = handle.clone();
                let windows = Arc::clone(&windows);
                let title = title_of_new.clone();
                thread::spawn(move || open_view(&handle, &label, url, &title, &windows));
            }
            NewWindowResponse::Deny
        })
        .build()?;
    Ok(())
}

/// Open a window the talk's page asked for. The talk may begin closing
/// while it is built, after its close has destroyed the windows it knew
/// of, so a window built for a talk that no longer holds it is destroyed.
fn open_view(app: &AppHandle, label: &str, url: Url, title: &str, windows: &Arc<TalkWindows>) {
    if !windows.holds(label) {
        return;
    }
    let opened = open_window(
        app,
        label,
        WebviewUrl::CustomProtocol(url),
        title,
        Arc::clone(windows),
    );
    if let Err(error) = opened {
        show_error(app, &format!("Could not open a window: {error}"));
        return;
    }
    if !windows.holds(label)
        && let Some(window) = app.get_webview_window(label)
    {
        let _ = window.destroy();
    }
}

/// Answer one request a webview made to a talk's scheme, off the thread the
/// webview asked on.
pub(crate) fn respond(
    open_talks: &SharedTalks,
    context: &UriSchemeContext<'_, Wry>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let open_talks = Arc::clone(open_talks);
    let window = context.webview_label().to_owned();
    tauri::async_runtime::spawn(async move {
        responder.respond(open_talks.answer(&window, request).await);
    });
}

/// Stop a talk's server, and if its last write may not have landed, say so
/// on standard error and in a dialog, returning once the dialog is
/// dismissed: the caller may then close the talk's window, and with the
/// last window the application, which would take a dialog still showing
/// with it. Never called on the event loop's thread, which the dialog needs.
fn stop_server(app: &AppHandle, server: TalkServer, directory: &Path) {
    if let Some(reason) = server.stop() {
        report_unwritten(app, directory, &reason, true);
    }
}

/// Say that `directory`'s last edit may not be on disk, on standard error,
/// and when `dialog`, in a dialog, returning once it is dismissed.
#[expect(
    clippy::print_stderr,
    reason = "a write that failed is reported on standard error"
)]
fn report_unwritten(app: &AppHandle, directory: &Path, reason: &str, dialog: bool) {
    let message = unwritten_message(directory, reason);
    eprintln!("{message}");
    if dialog {
        let _dismissed = app
            .dialog()
            .message(message)
            .title("InfinityCube")
            .kind(MessageDialogKind::Error)
            .blocking_show();
    }
}

fn unwritten_message(directory: &Path, reason: &str) -> String {
    format!(
        "The last edit to {} may not be on disk: {reason}.",
        directory.display()
    )
}

fn show_error(app: &AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("InfinityCube")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

#[expect(
    clippy::print_stderr,
    reason = "a shell that cannot start, and a write that failed on quitting, are reported on standard error"
)]
fn main() {
    let open_talks: SharedTalks = Arc::new(OpenTalks::new(SchemeStyle::CURRENT));
    let scheme_talks = Arc::clone(&open_talks);
    let (events, received) = mpsc::unbounded_channel();
    let timers = events.clone();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Talks::default())
        .manage(Closings {
            events,
            exit_allowed: AtomicBool::new(false),
        })
        .manage(open_talks)
        .manage(RegisteredSchemes::default());
    if SchemeStyle::CURRENT == SchemeStyle::HostPerTalk {
        // One scheme serves every talk, each at the origin its key names.
        builder = builder.register_asynchronous_uri_scheme_protocol(
            SCHEME,
            move |context, request, responder| {
                respond(&scheme_talks, &context, request, responder);
            },
        );
    }
    let app = builder
        .invoke_handler(tauri::generate_handler![open_talk, answer_closing])
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                app.exit(0);
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            drop(tauri::async_runtime::spawn(waiting::drive(
                received,
                timers,
                move |effect| apply(&handle, effect),
            )));
            if cfg!(target_os = "macos") {
                let _previous = app.set_menu(mac_menu(app.handle())?)?;
            }
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
            // A question closed by its window's own control is answered
            // as Escape answers it: keep waiting.
            if let Some(wait) = question::wait_of(window.label()) {
                window
                    .state::<Closings>()
                    .send(Event::Chose(wait, Choice::KeepWaiting));
                return;
            }
            if !window.label().starts_with(TALK_WINDOW_PREFIX) {
                return;
            }
            let talks = window.state::<Talks>();
            let close = talks.registry().begin_close(window.label());
            match close {
                Close::NotOpen => {}
                // The window stays until its run has written the last edit,
                // or the presenter closes it without saving.
                Close::StillClosing => api.prevent_close(),
                Close::Stop { server, directory } => {
                    api.prevent_close();
                    let label = window.label().to_owned();
                    window.state::<Closings>().send(Event::CloseRequested {
                        talk: label.clone(),
                        folder: directory.clone(),
                    });
                    spawn_stop(window.app_handle(), label, directory, server, true);
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
    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            // A quit waits for each talk's last write, and asks once
            // whether to keep waiting if one takes too long; the
            // close-wait decision ends the application when it may.
            let closings = app.state::<Closings>();
            if closings.exit_allowed.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            let open = app.state::<Talks>().registry().take_all();
            let mut writing = Vec::with_capacity(open.len());
            for (label, directory, server) in open {
                writing.push((label.clone(), directory.clone()));
                spawn_stop(app, label, directory, server, false);
            }
            closings.send(Event::QuitRequested { writing });
        }
        RunEvent::Exit => {
            // Reached only once the close-wait decision allowed it, every
            // write ended or abandoned, unless the process is ending by a
            // way the application is not asked about (on macOS, Quit from
            // the Dock, or logging out). Then every talk still open, or
            // still closing and not abandoned, writes its last edit before
            // the process ends, reported on standard error only.
            if app.state::<Closings>().exit_allowed.load(Ordering::SeqCst) {
                return;
            }
            let talks = app.state::<Talks>();
            let open = talks.registry().take_all();
            let mut stopping: Vec<_> = open
                .into_iter()
                .map(|(_label, directory, server)| {
                    thread::spawn(move || {
                        if let Some(reason) = server.stop() {
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
        _ => {}
    });
}
