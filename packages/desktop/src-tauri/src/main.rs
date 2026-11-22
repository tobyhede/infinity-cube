//! The InfinityCube desktop application (ADR 0155).
//!
//! A directory named on the command line opens at once; with none named, or
//! none that opens, the shell asks for one, and File › Open… asks for another
//! ([`launch`]). A folder holding no Space is offered a new one, as File ›
//! New Space… writes one ([`new_space`]). Every window is a Space's, a window
//! a Space's page opened, or a close's question. Each directory opens in a
//! window of its own, served by a run of the Rust host of its own, in this
//! process, through the application's URI scheme at the Aggregate's own origin; opening it again
//! focuses that window. A window the Aggregate's page opens (a Resource opened
//! independently, the Notes window) opens under the same origin. Closing the
//! Aggregate's window stops its run, which writes any edit not yet on disk first,
//! and says so in a dialog if that write failed. A write still running ten
//! seconds after a close, or a quit, asks whether to keep waiting
//! ([`waiting`], [`question`]).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod address;
mod aggregates;
mod launch;
mod new_space;
mod not_opened;
mod question;
mod saving;
mod scheme;
mod server;
#[cfg(test)]
mod test_support;
mod waiting;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, TryRecvError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;

use host::{RandomIds, TokioFilesystem};
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Manager, RunEvent, UriSchemeContext, UriSchemeResponder, WebviewUrl,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogBuilder, MessageDialogButtons, MessageDialogKind,
};
use tokio::sync::mpsc::{self, UnboundedSender};
use url::Url;

use crate::address::{AggregateKey, SCHEME, SchemeStyle};
use crate::aggregates::{Close, Registry, Reserved, SPACE_WINDOW_PREFIX};
use crate::launch::{Launch, Next, Opening, Unopened};
use crate::not_opened::NotOpened;
use crate::scheme::{OpenAggregates, VIEW_WINDOW_PREFIX};
use crate::server::{
    AggregateServer, Navigation, OpenError, RegisteredSchemes, SharedAggregates, SpaceWindows,
    Started,
};
use crate::waiting::{Choice, Effect, Event};

/// Every Aggregate, the stops still under way for Aggregates already closing, by
/// window label, and the Aggregates whose last write the presenter abandoned.
#[derive(Default)]
struct Aggregates {
    registry: Mutex<Registry<AggregateServer>>,
    stopping: Mutex<HashMap<String, Receiver<()>>>,
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

impl Aggregates {
    fn registry(&self) -> MutexGuard<'_, Registry<AggregateServer>> {
        lock(&self.registry)
    }

    /// Keep word of when a closing Aggregate's last write ends, so quitting
    /// waits for the write, and never for a dialog reporting it, which
    /// needs the event loop quitting holds.
    fn keep_stopping(&self, label: String, written: Receiver<()>) {
        let mut stopping = lock(&self.stopping);
        stopping.retain(|_, written| matches!(written.try_recv(), Err(TryRecvError::Empty)));
        let _replaced = stopping.insert(label, written);
    }

    fn take_stopping(&self) -> Vec<Receiver<()>> {
        lock(&self.stopping)
            .drain()
            .map(|(_, written)| written)
            .collect()
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

/// Stop window `label`'s Aggregate on a thread of its own, reporting a failed
/// write on standard error, and in a dialog when `dialog` and the write was
/// not abandoned; then free its directory and tell the close-wait decision
/// the write has ended.
fn spawn_stop(
    app: &AppHandle,
    label: String,
    directory: PathBuf,
    server: AggregateServer,
    dialog: bool,
) {
    let handle = app.clone();
    let kept = label.clone();
    let (written, ended) = std::sync::mpsc::channel();
    let _stop = thread::spawn(move || {
        let failed = server.stop();
        // Quitting waits for this, not for the dialog below.
        let _told = written.send(());
        let aggregates = handle.state::<Aggregates>();
        let abandoned = aggregates.take_abandoned(&label);
        if let Some(reason) = failed {
            report_unwritten(&handle, &directory, &reason, dialog && !abandoned);
        }
        aggregates.registry().closed(&label);
        handle.state::<Closings>().send(Event::WriteFinished(label));
    });
    app.state::<Aggregates>().keep_stopping(kept, ended);
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
            let aggregates = app.state::<Aggregates>();
            for (label, directory) in abandoned {
                aggregates.abandon(&label);
                // The windows its page opened go with it, as a stop that
                // ends takes them.
                let views = format!(
                    "{VIEW_WINDOW_PREFIX}{}-",
                    AggregateKey::of(&directory).as_str()
                );
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

/// The application's menu. File › New Space… asks for a folder to write a
/// new Space to and opens it, and File › Open… asks for a folder to open. Its Quit
/// asks the application to exit, so a quit waits for each Aggregate's last
/// write and may ask (the predefined Quit ends the process without asking
/// the application). On macOS the menu also carries the application, Edit
/// and Window menus a Mac application has, Edit being what gives a webview
/// Cut, Copy and Paste there.
fn app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let new = MenuItem::with_id(app, NEW_MENU_ITEM, "New Space…", true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(app, OPEN_MENU_ITEM, "Open…", true, Some("CmdOrCtrl+O"))?;
    let quit = MenuItem::with_id(
        app,
        QUIT_MENU_ITEM,
        "Quit InfinityCube",
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    // File ends with Close Window on macOS, whose application menu holds
    // Quit, and with Quit elsewhere, where File is the only menu.
    let close_window;
    let file_end: &dyn IsMenuItem<Wry> = if cfg!(target_os = "macos") {
        close_window = PredefinedMenuItem::close_window(app, None)?;
        &close_window
    } else {
        &quit
    };
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[&new, &open, &PredefinedMenuItem::separator(app)?, file_end],
    )?;
    if !cfg!(target_os = "macos") {
        return Menu::with_items(app, &[&file]);
    }
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
        ],
    )?;
    Menu::with_items(app, &[&application, &file, &edit, &window])
}

/// The menu items the shell answers itself.
const NEW_MENU_ITEM: &str = "new";
const OPEN_MENU_ITEM: &str = "open";
const QUIT_MENU_ITEM: &str = "quit";

/// Ask for a folder, and open it as an Aggregate. At launch, with nothing
/// open, cancelling ends the application and a folder that does not open is
/// reported before asking again, so the application never runs with no
/// window; from the menu, or once a Space has opened meanwhile, cancelling
/// does nothing and a failure is reported alone ([`launch::after`]).
fn choose_folder(app: &AppHandle, opening: Opening) {
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("Open a Space")
        .pick_folder(move |folder| {
            let Some(path) = folder.and_then(|folder| folder.into_path().ok()) else {
                if next(&handle, opening, Unopened::Cancelled) == Next::Exit {
                    handle.exit(0);
                }
                return;
            };
            // Starting a run reads the whole directory, so it stays off the
            // thread the dialog answered on.
            thread::spawn(move || {
                if let Err(reason) = open_aggregate_at(&handle, &path) {
                    settle(&handle, opening, reason);
                }
            });
        });
}

/// Ask for a folder to write a new Space to, and open it. Cancelling does
/// nothing; a folder that is not empty, or a Space that could not be
/// written, is reported.
fn choose_new_space(app: &AppHandle) {
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("New Space: choose an empty folder")
        .pick_folder(move |folder| {
            let Some(path) = folder.and_then(|folder| folder.into_path().ok()) else {
                return;
            };
            thread::spawn(move || {
                if let Err(reason) = create_and_open(&handle, &path) {
                    settle(&handle, Opening::FromMenu, reason);
                }
            });
        });
}

/// Write a new Space to `directory` and open it.
fn create_and_open(app: &AppHandle, directory: &Path) -> Result<(), NotOpened> {
    {
        // One Space is written at a time, so two asked for at once cannot
        // both find a folder empty and both write to it: the second finds
        // the first's files and is refused.
        let _creating = lock(&CREATING);
        tauri::async_runtime::block_on(new_space::create_space(
            &TokioFilesystem,
            directory,
            &RandomIds,
        ))?;
    }
    open_aggregate_at(app, directory)
}

/// Held while a new Space is written ([`create_and_open`]).
static CREATING: Mutex<()> = Mutex::new(());

/// Answer a folder asked for `opening` that did not open: offer a new Space
/// in one that holds none, and otherwise say why, returning once the
/// presenter has answered. Then, at launch with nothing open, ask for a
/// folder again ([`launch::after`]).
fn settle(app: &AppHandle, opening: Opening, reason: NotOpened) {
    if answer(app, reason) && next(app, opening, Unopened::Failed) == Next::AskAgain {
        choose_folder(app, Opening::AtLaunch);
    }
}

/// Answer why a folder did not open, returning once the presenter has, and
/// whether it is still unopened. A folder holding no Space is offered a new
/// one; declining, the folder stays unopened, so at launch the shell asks
/// for another rather than ending. A close or a quit that took the
/// Aggregate is not answered.
fn answer(app: &AppHandle, reason: NotOpened) -> bool {
    match reason {
        NotOpened::Empty(directory) => {
            let create = app
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
                .blocking_show();
            if !create {
                return true;
            }
            match create_and_open(app, &directory) {
                Ok(()) => false,
                Err(reason) => answer(app, reason),
            }
        }
        reason if reason.tells_the_presenter() => {
            show_error_and_wait(app, &reason.to_string());
            true
        }
        _ => false,
    }
}

/// What comes after a folder question for `opening` that ended `unopened`.
fn next(app: &AppHandle, opening: Opening, unopened: Unopened) -> Next {
    let any_aggregate = !app.state::<Aggregates>().registry().is_empty();
    launch::after(opening, unopened, any_aggregate)
}

/// Open each folder named on the command line, then answer each that did
/// not, asking for one if nothing else is open.
fn open_from_command_line(app: &AppHandle, folders: &[PathBuf]) {
    let unopened: Vec<NotOpened> = folders
        .iter()
        .filter_map(|folder| open_aggregate_at(app, folder).err())
        .collect();
    let mut still_unopened = false;
    for reason in unopened {
        still_unopened |= answer(app, reason);
    }
    if still_unopened && next(app, Opening::AtLaunch, Unopened::Failed) == Next::AskAgain {
        choose_folder(app, Opening::AtLaunch);
    }
}

/// Open `folder` as an Aggregate in a window of its own, or focus the window
/// that already has it, answering why if neither.
fn open_aggregate_at(app: &AppHandle, folder: &Path) -> Result<(), NotOpened> {
    // Two spellings of one directory are one Aggregate; a path that cannot be
    // resolved is passed on as given, for the run to refuse.
    let directory = std::fs::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
    let aggregates = app.state::<Aggregates>();
    let reserved = aggregates.registry().reserve(&directory);
    let label = match reserved {
        Reserved::New(label) => label,
        // A quit has begun: say nothing, as for any open a quit overtakes.
        Reserved::Quitting => return Err(NotOpened::Abandoned(directory)),
        Reserved::Existing(label) => {
            // Still starting, there is no window yet, and it shows when it
            // opens. Closing without saving, its window is gone while its
            // last write runs on.
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.set_focus();
            } else if aggregates.registry().is_closing(&label) {
                return Err(NotOpened::StillWriting(directory));
            }
            return Ok(());
        }
    };
    let opened = start_aggregate(app, &directory, &label);
    if opened.is_err() {
        let abandoned = aggregates.registry().abandon(&label);
        if let Some(server) = abandoned {
            stop_server(app, server, &directory);
        }
    }
    opened
}

/// Start `directory`'s server and open its window as `label`, answering why
/// if the Aggregate did not open.
fn start_aggregate(app: &AppHandle, directory: &Path, label: &str) -> Result<(), NotOpened> {
    let could_not = |source: OpenError| NotOpened::Failed {
        directory: directory.to_path_buf(),
        source,
    };
    let server = match AggregateServer::start(app, directory, label).map_err(could_not)? {
        Started::Empty => return Err(NotOpened::Empty(directory.to_path_buf())),
        Started::Refused { message } => return Err(NotOpened::Refused(message)),
        Started::Serving(server) => server,
    };
    let url = server.window_url();
    let title = directory.file_name().map_or_else(
        || directory.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    let windows = server.windows();
    let opened = app.state::<Aggregates>().registry().opened(label, server);
    if let Err(server) = opened {
        stop_server(app, server, directory);
        return Err(NotOpened::Abandoned(directory.to_path_buf()));
    }
    open_window(app, label, url, &title, windows).map_err(|error| could_not(error.into()))
}

/// Open a window of an Aggregate, held to what `windows` admits.
fn open_window(
    app: &AppHandle,
    label: &str,
    url: WebviewUrl,
    title: &str,
    windows: Arc<SpaceWindows>,
) -> Result<(), tauri::Error> {
    let guard = Arc::clone(&windows);
    let navigating = app.clone();
    let own_label = label.to_owned();
    let handle = app.clone();
    let title_of_new = title.to_owned();
    WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(1280.0, 800.0)
        // A Space window shows its own Aggregate and nothing else: a link to
        // anywhere else in the Aggregate's content is refused, and its root,
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
        // window of the same Aggregate at the same origin, or none at all.
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

/// Open a window the Aggregate's page asked for. The Aggregate may begin closing
/// while it is built, after its close has destroyed the windows it knew
/// of, so a window built for an Aggregate that no longer holds it is destroyed.
fn open_view(app: &AppHandle, label: &str, url: Url, title: &str, windows: &Arc<SpaceWindows>) {
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
        app.state::<SharedAggregates>().forget_view(label);
        show_error(app, &format!("Could not open a window: {error}"));
        return;
    }
    if !windows.holds(label)
        && let Some(window) = app.get_webview_window(label)
    {
        let _ = window.destroy();
    }
}

/// Answer one request a webview made to an Aggregate's scheme, off the thread the
/// webview asked on.
pub(crate) fn respond(
    open_aggregates: &SharedAggregates,
    context: &UriSchemeContext<'_, Wry>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let open_aggregates = Arc::clone(open_aggregates);
    let window = context.webview_label().to_owned();
    tauri::async_runtime::spawn(async move {
        responder.respond(open_aggregates.answer(&window, request).await);
    });
}

/// Stop an Aggregate's server, and if its last write may not have landed, say so
/// on standard error and in a dialog, returning once the dialog is
/// dismissed: the caller may then close the Aggregate's window, and with the
/// last window the application, which would take a dialog still showing
/// with it. Never called on the event loop's thread, which the dialog needs.
fn stop_server(app: &AppHandle, server: AggregateServer, directory: &Path) {
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
        let _dismissed = error_dialog(app, message).blocking_show();
    }
}

fn unwritten_message(directory: &Path, reason: &str) -> String {
    format!(
        "The last edit to {} may not be on disk: {reason}.",
        directory.display()
    )
}

/// An error dialog saying `message`.
fn error_dialog(app: &AppHandle, message: impl Into<String>) -> MessageDialogBuilder<Wry> {
    app.dialog()
        .message(message)
        .title("InfinityCube")
        .kind(MessageDialogKind::Error)
}

/// Show `message` in an error dialog, returning once it is dismissed.
fn show_error_and_wait(app: &AppHandle, message: &str) {
    let _dismissed = error_dialog(app, message).blocking_show();
}

fn show_error(app: &AppHandle, message: &str) {
    error_dialog(app, message).show(|_| {});
}

#[expect(
    clippy::print_stderr,
    reason = "a shell that cannot start, and a write that failed on quitting, are reported on standard error"
)]
fn main() {
    let open_aggregates: SharedAggregates = Arc::new(OpenAggregates::new(SchemeStyle::CURRENT));
    let scheme_aggregates = Arc::clone(&open_aggregates);
    let (events, received) = mpsc::unbounded_channel();
    let timers = events.clone();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Aggregates::default())
        .manage(Closings {
            events,
            exit_allowed: AtomicBool::new(false),
        })
        .manage(open_aggregates)
        .manage(RegisteredSchemes::default());
    if SchemeStyle::CURRENT == SchemeStyle::HostPerAggregate {
        // One scheme serves every Aggregate, each at the origin its key names.
        builder = builder.register_asynchronous_uri_scheme_protocol(
            SCHEME,
            move |context, request, responder| {
                respond(&scheme_aggregates, &context, request, responder);
            },
        );
    }
    let app = builder
        .invoke_handler(tauri::generate_handler![answer_closing])
        .on_menu_event(|app, event| {
            if event.id() == QUIT_MENU_ITEM {
                app.exit(0);
            } else if event.id() == NEW_MENU_ITEM {
                choose_new_space(app);
            } else if event.id() == OPEN_MENU_ITEM {
                choose_folder(app, Opening::FromMenu);
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            drop(tauri::async_runtime::spawn(waiting::drive(
                received,
                timers,
                move |effect| apply(&handle, effect),
            )));
            let _previous = app.set_menu(app_menu(app.handle())?)?;
            // A directory named on the command line opens at once, as one
            // chosen from File › Open… would; with none named, the shell
            // asks for one.
            match launch::launch(std::env::args_os().skip(1)) {
                Launch::Choose => choose_folder(app.handle(), Opening::AtLaunch),
                Launch::Folders(folders) => {
                    let handle = app.handle().clone();
                    thread::spawn(move || open_from_command_line(&handle, &folders));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed)
                && window.label().starts_with(VIEW_WINDOW_PREFIX)
            {
                window
                    .state::<SharedAggregates>()
                    .forget_view(window.label());
                return;
            }
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
            if !window.label().starts_with(SPACE_WINDOW_PREFIX) {
                return;
            }
            let aggregates = window.state::<Aggregates>();
            let close = aggregates.registry().begin_close(window.label());
            match close {
                Close::NotOpen => {}
                // The window stays until its run has written the last edit,
                // or the presenter closes it without saving.
                Close::StillClosing => api.prevent_close(),
                Close::Stop { server, directory } => {
                    api.prevent_close();
                    let label = window.label().to_owned();
                    window.state::<Closings>().send(Event::CloseRequested {
                        aggregate: label.clone(),
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
            // A quit waits for each Aggregate's last write, and asks once
            // whether to keep waiting if one takes too long; the
            // close-wait decision ends the application when it may.
            let closings = app.state::<Closings>();
            if closings.exit_allowed.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            let open = app.state::<Aggregates>().registry().take_all();
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
            // the Dock, or logging out). Then every Aggregate still open, or
            // still closing and not abandoned, writes its last edit before
            // the process ends, reported on standard error only.
            if app.state::<Closings>().exit_allowed.load(Ordering::SeqCst) {
                return;
            }
            let aggregates = app.state::<Aggregates>();
            let open = aggregates.registry().take_all();
            let stopping: Vec<_> = open
                .into_iter()
                .map(|(_label, directory, server)| {
                    thread::spawn(move || {
                        if let Some(reason) = server.stop() {
                            eprintln!("{}", unwritten_message(&directory, &reason));
                        }
                    })
                })
                .collect();
            for written in aggregates.take_stopping() {
                // Answered once the write ends, or at once if its stop
                // ended without saying so.
                let _ = written.recv();
            }
            for stop in stopping {
                let _ = stop.join();
            }
        }
        _ => {}
    });
}
