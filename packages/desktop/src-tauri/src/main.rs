//! The InfinityCube desktop application (ADR 0155).
//!
//! A directory named on the command line opens at once; with none named, or
//! none that opens, the Start window shows ([`launch`], [`start`]), which
//! offers New Space, Open Folder… and the recent Spaces, and File › Open…
//! asks for another folder. A folder holding no Space is offered a new one
//! ([`new_space`]). Every window is the Start window, a Space's, a window a
//! Space's page opened, or a close's question. Each directory opens in a
//! window of its own, served by a run of the Rust host of its own, in this
//! process, through the application's URI scheme at the Aggregate's own origin; opening it again
//! focuses that window. A window the Aggregate's page opens (a Resource opened
//! independently, the Notes window) opens under the same origin. Closing the
//! Aggregate's window stops its run, which writes any edit not yet on disk first,
//! and says so in a dialog if that write failed. A write still running ten
//! seconds after a close, or a quit, asks whether to keep waiting
//! ([`waiting`], [`question`]). The menus follow each platform's
//! conventions ([`menu`]), and Help opens InfinityCube's pages in the system
//! browser, never in a window of the shell's.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod address;
mod aggregates;
mod database;
mod launch;
mod menu;
mod new_space;
mod new_space_folder;
mod not_opened;
mod open_folder;
mod question;
mod saving;
mod scheme;
mod server;
mod start;
#[cfg(test)]
mod test_support;
mod update;
mod waiting;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;

use menu::{Command, Platform, Predefined};
use tauri::menu::{AboutMetadata, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Manager, RunEvent, UriSchemeContext, UriSchemeResponder, WebviewUrl,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogBuilder, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::mpsc::{self, UnboundedSender};
use url::Url;

use crate::address::{AggregateKey, SCHEME, SchemeStyle};
use crate::aggregates::{Close, Registry, ReportIn, SPACE_WINDOW_PREFIX, lock};
use crate::launch::LastWindow;
use crate::open_folder::Origin;
use crate::scheme::{OpenAggregates, VIEW_WINDOW_PREFIX};
use crate::server::{
    AggregateServer, Navigation, RegisteredSchemes, SharedAggregates, SpaceWindows,
};
use crate::waiting::{Choice, Effect, Event};

/// Every Aggregate, from starting until its close has ended.
#[derive(Default)]
struct Aggregates {
    registry: Mutex<Registry<AggregateServer>>,
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

impl Aggregates {
    fn registry(&self) -> MutexGuard<'_, Registry<AggregateServer>> {
        lock(&self.registry)
    }
}

/// Stop window `label`'s Aggregate on a thread of its own, reporting a failed
/// write where the Registry says ([`aggregates::ReportIn`]); then free its
/// directory and tell the close-wait decision the write has ended.
fn spawn_stop(app: &AppHandle, label: String, directory: PathBuf, server: AggregateServer) {
    let handle = app.clone();
    let kept = label.clone();
    let (written, ended) = std::sync::mpsc::channel();
    let _stop = thread::spawn(move || {
        let failed = server.stop();
        // An exit waits for this, never for the dialog below, which needs
        // the event loop the exit holds.
        let _told = written.send(());
        let aggregates = handle.state::<Aggregates>();
        let report = aggregates.registry().stopped(&label);
        if let Some(reason) = failed {
            report_unwritten(&handle, &directory, &reason, report == ReportIn::Dialog);
        }
        aggregates.registry().closed(&label);
        handle.state::<Closings>().send(Event::WriteFinished(label));
    });
    app.state::<Aggregates>().registry().stopping(&kept, ended);
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
                aggregates.registry().abandon_close(&label);
                // The windows its page opened go with it, as a stop that
                // ends takes them.
                let key = AggregateKey::of(&directory);
                for (other, window) in app.webview_windows() {
                    if other == label || scheme::is_view_of(&other, &key) {
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

/// The application's menus, drawn from [`menu::layout`].
fn app_menu(app: &AppHandle, updates: bool) -> tauri::Result<Menu<Wry>> {
    let menus = menu::layout(Platform::CURRENT, updates)
        .into_iter()
        .map(|submenu| draw_submenu(app, submenu))
        .collect::<tauri::Result<Vec<_>>>()?;
    let items: Vec<&dyn IsMenuItem<Wry>> = menus
        .iter()
        .map(|submenu| submenu as &dyn IsMenuItem<Wry>)
        .collect();
    Menu::with_items(app, &items)
}

fn draw_submenu(app: &AppHandle, submenu: menu::Submenu) -> tauri::Result<Submenu<Wry>> {
    let items = submenu
        .items
        .into_iter()
        .map(|item| draw_item(app, item))
        .collect::<tauri::Result<Vec<_>>>()?;
    let items: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(AsRef::as_ref).collect();
    let drawn = Submenu::with_items(app, submenu.title, true, &items)?;
    #[cfg(target_os = "macos")]
    match submenu.role {
        Some(menu::Role::Window) => drawn.set_as_windows_menu_for_nsapp()?,
        Some(menu::Role::Help) => drawn.set_as_help_menu_for_nsapp()?,
        None => {}
    }
    #[cfg(not(target_os = "macos"))]
    let _ = submenu.role;
    Ok(drawn)
}

fn draw_item(app: &AppHandle, item: menu::Item) -> tauri::Result<Box<dyn IsMenuItem<Wry>>> {
    Ok(match item {
        menu::Item::Command(command) => Box::new(MenuItem::with_id(
            app,
            command.id(),
            command.label(),
            true,
            command.accelerator(),
        )?),
        menu::Item::Separator => Box::new(PredefinedMenuItem::separator(app)?),
        menu::Item::Predefined(predefined) => Box::new(match predefined {
            Predefined::About => {
                PredefinedMenuItem::about(app, Some("About InfinityCube"), Some(about(app)))?
            }
            Predefined::Hide => PredefinedMenuItem::hide(app, None)?,
            Predefined::HideOthers => PredefinedMenuItem::hide_others(app, None)?,
            Predefined::ShowAll => PredefinedMenuItem::show_all(app, None)?,
            Predefined::Undo => PredefinedMenuItem::undo(app, None)?,
            Predefined::Redo => PredefinedMenuItem::redo(app, None)?,
            Predefined::Cut => PredefinedMenuItem::cut(app, None)?,
            Predefined::Copy => PredefinedMenuItem::copy(app, None)?,
            Predefined::Paste => PredefinedMenuItem::paste(app, None)?,
            Predefined::SelectAll => PredefinedMenuItem::select_all(app, None)?,
            Predefined::FullScreen => PredefinedMenuItem::fullscreen(app, None)?,
            Predefined::Minimize => PredefinedMenuItem::minimize(app, None)?,
            Predefined::Zoom => PredefinedMenuItem::maximize(app, None)?,
            Predefined::CloseWindow => PredefinedMenuItem::close_window(app, None)?,
            Predefined::RaiseAll => PredefinedMenuItem::bring_all_to_front(app, None)?,
        }),
    })
}

/// The line About describes InfinityCube with.
const COMMENTS: &str = "Graph-native technical presentations";

/// What About says: the version, the commit the release workflow built from
/// (or that it is a local build), the licence and the website. macOS shows
/// `Version <short_version> (<version>)`, so there the commit is the version;
/// GTK and Windows show the version alone. macOS shows neither comments,
/// licence nor website, so there they are the credits instead.
fn about(app: &AppHandle) -> AboutMetadata<'_> {
    let commit = option_env!("INFINITY_CUBE_COMMIT")
        .filter(|commit| !commit.is_empty())
        .unwrap_or("local build");
    let number = app.package_info().version.to_string();
    let (version, short_version) = if cfg!(target_os = "macos") {
        (commit.to_owned(), Some(number))
    } else {
        (format!("{number} ({commit})"), None)
    };
    AboutMetadata {
        name: Some("InfinityCube".to_owned()),
        version: Some(version),
        short_version,
        comments: Some(COMMENTS.to_owned()),
        license: Some(env!("CARGO_PKG_LICENSE").to_owned()),
        website: Some(menu::WEBSITE.to_owned()),
        website_label: Some("InfinityCube on GitHub".to_owned()),
        credits: cfg!(target_os = "macos").then(|| {
            format!(
                "{COMMENTS}\nLicence: {}\n{}",
                env!("CARGO_PKG_LICENSE"),
                menu::WEBSITE
            )
        }),
        icon: app.default_window_icon().cloned(),
        ..AboutMetadata::default()
    }
}

/// Answers a menu item the shell drew itself.
fn answer_menu(app: &AppHandle, command: Command) {
    match command {
        Command::Quit => app.exit(0),
        Command::NewSpace => start::show(app, start::Screen::NewSpace),
        Command::Open => open_folder::tauri_shell::choose_folder(app, Origin::Menu),
        Command::OpenSqliteFile => {
            open_folder::tauri_shell::choose_sqlite_file(app, Origin::Menu);
        }
        // A URL reaches the shell only from the Start window's form (ADR 0181).
        Command::ConnectPostgres => start::show(app, start::Screen::Postgres),
        // Closed as its own control closes it, so a Space window's close
        // waits for its last write, and a close's question keeps waiting.
        Command::CloseWindow => {
            if let Some(window) = focused_window(app)
                && let Err(error) = window.close()
            {
                show_error(app, &format!("Could not close the window: {error}"));
            }
        }
        // A close's question stays the small window it is.
        Command::FullScreen => {
            if let Some(window) =
                focused_window(app).filter(|window| question::wait_of(window.label()).is_none())
            {
                let full = window.is_fullscreen().unwrap_or(false);
                if let Err(error) = window.set_fullscreen(!full) {
                    show_error(app, &format!("Could not change full screen: {error}"));
                }
            }
        }
        Command::Help | Command::ReportIssue => {
            if let Some(address) = command.address()
                && let Err(error) = app.opener().open_url(address, None::<&str>)
            {
                show_error(app, &format!("Could not open {address}: {error}"));
            }
        }
        Command::CheckForUpdates => {
            drop(tauri::async_runtime::spawn(update::offer(
                app.clone(),
                update::Checking::FromMenu,
            )));
        }
    }
}

/// The window the person is using, which a menu item acts on.
fn focused_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
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
    let context = tauri::generate_context!();
    let updates = update::configured(context.config());
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Only the shell opens an address (Help, Report an Issue…), so the
        // plugin's script that sends a page's link clicks to it is left out.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .manage(update::Updating::default())
        .manage(Aggregates::default())
        .manage(Closings {
            events,
            exit_allowed: AtomicBool::new(false),
        })
        .manage(open_aggregates)
        .manage(RegisteredSchemes::default());
    if updates {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
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
        .invoke_handler(tauri::generate_handler![
            answer_closing,
            start::start_window_view,
            start::start_browse,
            start::start_create_space,
            start::start_open_folder,
            start::start_open_recent,
            start::start_open_sqlite_file,
            start::start_connect_postgres,
            start::start_close,
        ])
        .on_menu_event(|app, event| {
            if let Some(command) = Command::named(event.id().as_ref()) {
                answer_menu(app, command);
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            drop(tauri::async_runtime::spawn(waiting::drive(
                received,
                timers,
                move |effect| apply(&handle, effect),
            )));
            let _previous = app.set_menu(app_menu(app.handle(), updates)?)?;
            if updates {
                drop(tauri::async_runtime::spawn(update::offer(
                    app.handle().clone(),
                    update::Checking::AtLaunch,
                )));
            }
            // A directory named on the command line opens at once, as one
            // chosen from File › Open… would; with none named, the shell
            // shows the Start window.
            let folders = launch::launch(std::env::args_os().skip(1));
            if folders.is_empty() {
                // Nothing to start, so the Start window shows here, before
                // the event loop can begin a quit or show it itself.
                open_folder::tauri_shell::open(app.handle(), Origin::CommandLine, &[]);
            } else {
                let handle = app.handle().clone();
                thread::spawn(move || {
                    open_folder::tauri_shell::open(&handle, Origin::CommandLine, &folders);
                });
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
                    spawn_stop(window.app_handle(), label, directory, server);
                }
            }
        })
        .build(context);
    let app = match app {
        Ok(app) => app,
        Err(error) => {
            eprintln!("InfinityCube could not start: {error}");
            std::process::exit(1);
        }
    };
    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, code, .. } => {
            // A quit waits for each Aggregate's last write, and asks once
            // whether to keep waiting if one takes too long; the
            // close-wait decision ends the application when it may.
            let closings = app.state::<Closings>();
            if closings.exit_allowed.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            // No code: the last window closed, which on macOS leaves the
            // application running with no window (Storage ST-131). Each
            // Space window's close has already waited for its last write.
            if code.is_none() && launch::last_window_closed(Platform::CURRENT) == LastWindow::RunOn
            {
                return;
            }
            let open = app.state::<Aggregates>().registry().take_all();
            let mut writing = Vec::with_capacity(open.len());
            for (label, directory, server) in open {
                writing.push((label.clone(), directory.clone()));
                spawn_stop(app, label, directory, server);
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
            let exit = app.state::<Aggregates>().registry().take_for_exit();
            let stopping: Vec<_> = exit
                .open
                .into_iter()
                .map(|(directory, server)| {
                    thread::spawn(move || {
                        if let Some(reason) = server.stop() {
                            eprintln!("{}", unwritten_message(&directory, &reason));
                        }
                    })
                })
                .collect();
            for written in exit.writing {
                // Answered once the write ends, or at once if its stop
                // ended without saying so.
                let _ = written.recv();
            }
            for stop in stopping {
                let _ = stop.join();
            }
        }
        // Activating the application (its Dock icon) with no window showing
        // shows the Start window; with windows, macOS brings them forward.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } if launch::activating_shows_start(has_visible_windows) => {
            start::show(app, start::Screen::Start);
        }
        _ => {}
    });
}
