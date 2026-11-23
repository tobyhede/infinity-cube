//! An Aggregate served by the Rust host in the shell's own process (ADR 0155):
//! starting its run, the address its window opens at, what each of its
//! windows may navigate to and open, and stopping it when its window closes.
//!
//! Each Aggregate is one [`Run`] of `host`, served through the scheme handler
//! ([`crate::scheme`]) at the Aggregate's own origin ([`crate::address`]): no
//! port, no `Host` check and no launch secret. Stopping an Aggregate first stops
//! serving it, so no Edit arrives after the last write, then waits for
//! the run to write any Edit not yet on disk, however long that takes.

use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use host::{
    BuiltApplicationDirectory, BuiltApplicationError, BuiltFiles, ImportError, RandomIds, Run,
    RunEvent, RunStopped, Shell, TokioClock,
};
use tauri::{AppHandle, Manager as _, WebviewUrl};
use tauri_plugin_dialog::{DialogExt as _, MessageDialogKind};
use url::Url;

use crate::address::{AggregateAddress, AggregateKey, SchemeStyle};
use crate::saving::{SaveNotice, SaveStreak};
use crate::scheme::{Closed, OpenAggregates};

/// Why an Aggregate could not be opened.
#[derive(Debug, thiserror::Error)]
pub enum OpenError {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error("could not serve the built application: {0}")]
    Built(#[source] BuiltApplicationError),
    #[error("could not start the Space: {0}")]
    Import(#[source] ImportError),
    #[error("the Space's address is not a URL: {0}")]
    Url(#[from] url::ParseError),
}

/// The shell for the built application in `directory`, the one the bundle
/// carries as a resource.
///
/// # Errors
///
/// The directory cannot be resolved, or its `index.html` does not resolve to
/// a readable regular file inside it; a link to one inside it is followed.
pub fn built_shell(
    directory: &Path,
) -> Result<Shell<BuiltApplicationDirectory>, BuiltApplicationError> {
    let (page, files) = BuiltApplicationDirectory::open(directory)?;
    Ok(Shell::new(page, files))
}

/// What starting an Aggregate came to.
#[derive(Debug)]
pub enum Started {
    /// The Aggregate is served; open its window at [`AggregateServer::window_url`].
    Serving(AggregateServer),
    /// The folder is missing or holds nothing but dot-entries: there is no
    /// Space to run, and a new one can be written there.
    Empty,
    /// The folder cannot be run; `message` says why, in the author's words.
    Refused { message: String },
}

/// Every open Aggregate, which the scheme handler reads.
pub type SharedAggregates = Arc<OpenAggregates>;

/// The schemes registered so far, where each Aggregate has a scheme of its own.
#[derive(Debug, Default)]
pub struct RegisteredSchemes(Mutex<HashSet<String>>);

/// Close an Aggregate: stop serving it, so no Edit arrives after the last
/// write, wait for every change still being answered, so an Edit the page
/// is told landed is in the last write, then stop its run, which writes
/// any Edit not yet on disk and answers once the write has landed or
/// failed. Nothing is given up on: a read still being answered commits no
/// Edit, and a change waits on nothing outside the process.
pub async fn close_aggregate<B: BuiltFiles>(
    open_aggregates: &OpenAggregates,
    key: &AggregateKey,
    run: Run<RandomIds, B>,
) -> (Vec<String>, RunStopped) {
    let windows = match open_aggregates.close(key) {
        Some(Closed { windows, in_flight }) => {
            in_flight.settled().await;
            windows
        }
        None => Vec::new(),
    };
    (windows, run.stop().await)
}

/// Start a run of `directory` with the built application `shell`. A failed
/// write and a store failure the application answers are reported on
/// standard error, naming the directory, and `notify` is handed the first
/// failed write of a streak and the write that ends one ([`SaveStreak`]).
///
/// # Errors
///
/// [`ImportError`] when the directory cannot be run; nothing is written.
#[expect(
    clippy::print_stderr,
    reason = "a failed write and a store failure are reported on standard error"
)]
pub async fn open_run<B: BuiltFiles>(
    directory: &Path,
    shell: Shell<B>,
    notify: impl Fn(SaveNotice) + Send + Sync + 'static,
) -> Result<Run<RandomIds, B>, ImportError> {
    let written = directory.display().to_string();
    let served = written.clone();
    let streak = Mutex::new(SaveStreak::default());
    Run::builder()
        .directory(directory)
        .ids(RandomIds)
        .clock(TokioClock)
        .on_event(move |event| {
            let mut streak = streak.lock().unwrap_or_else(PoisonError::into_inner);
            let notice = match event {
                RunEvent::Written => streak.written(),
                RunEvent::WriteFailed(error) => {
                    eprintln!(
                        "Could not write {written}: {error}; trying again once edits are quiet."
                    );
                    streak.failed(error)
                }
                _ => None,
            };
            drop(streak);
            if let Some(notice) = notice {
                notify(notice);
            }
        })
        .on_error(move |failed, error| eprintln!("{failed} for {served}: {error}"))
        .start(shell)
        .await
}

/// Show each [`SaveNotice`] for `directory` in a dialog, without waiting for
/// it to be dismissed, until `closing` is set: a closing Aggregate's last write
/// is reported when the close ends (Storage ST-122), not as news.
fn notify_in_dialog(
    app: &AppHandle,
    directory: &Path,
    closing: Arc<AtomicBool>,
) -> impl Fn(SaveNotice) + Send + Sync + 'static {
    let app = app.clone();
    let directory = directory.to_owned();
    move |notice| {
        if closing.load(Ordering::SeqCst) {
            return;
        }
        let kind = match notice {
            SaveNotice::Failing(_) => MessageDialogKind::Warning,
            SaveNotice::Recovered => MessageDialogKind::Info,
        };
        app.dialog()
            .message(notice.message(&directory))
            .title("InfinityCube")
            .kind(kind)
            .show(|_| {});
    }
}

/// Why a folder was not run, in what a presenter is offered or reads, or
/// `None` when the failure is not the folder's.
fn unrun(directory: &Path, error: &ImportError) -> Option<Started> {
    let shown = directory.display();
    let message = match error {
        // A presenter has no `pnpm cube init`: the shell offers to write a
        // new Space there instead.
        ImportError::Empty => return Some(Started::Empty),
        ImportError::Locked => {
            format!("{shown} is open in another InfinityCube window or run: close it there first.")
        }
        ImportError::Refused(refusals) => {
            let mut message = format!("{shown} is not a Space InfinityCube can open:");
            for refusal in refusals.as_slice() {
                message.push_str("\n- ");
                message.push_str(&refusal.located());
            }
            message
        }
        _ => return None,
    };
    Some(Started::Refused { message })
}

/// An Aggregate served by the Rust host in this process.
#[derive(Debug)]
pub struct AggregateServer {
    app: AppHandle,
    run: Run<RandomIds, BuiltApplicationDirectory>,
    /// Set once the Aggregate begins closing, which silences its save notices.
    closing: Arc<AtomicBool>,
    windows: Arc<SpaceWindows>,
}

/// The address an Aggregate's window opens at: where its root address redirects,
/// the Meta Space's product address, or the root when it does not redirect.
///
/// The shell follows the root's redirect itself and opens the window there,
/// since WebKitGTK was seen not to follow one a custom scheme answers a
/// navigation with (`.scratch/rust-host/issues/13-swap-the-sidecar-for-the-rust-host.md`).
pub async fn first_address<B: BuiltFiles>(
    application: &host::RunApplication<RandomIds, B>,
) -> String {
    let request = http::Request::get("/").body(String::new());
    let Ok(request) = request else {
        return "/".to_owned();
    };
    let response = application.handle(request).await;
    let location = response
        .headers()
        .get(http::header::LOCATION)
        .and_then(|location| location.to_str().ok());
    match location {
        Some(location)
            if response.status().is_redirection()
                && location.starts_with('/')
                && !location.starts_with("//") =>
        {
            location.to_owned()
        }
        _ => "/".to_owned(),
    }
}

/// Where a window of an Aggregate goes when it is asked to load an address.
#[derive(Debug, PartialEq, Eq)]
pub enum Navigation {
    /// Load it: an address of the Aggregate's own origin.
    Load,
    /// Load the Aggregate's first address instead: the Aggregate's root, which the
    /// application answers with a redirect WebKitGTK does not follow.
    Redirect(Url),
    /// Load nothing: an address outside the Aggregate's origin.
    Refuse,
}

/// What every window of one Aggregate is held to.
#[derive(Debug)]
pub struct SpaceWindows {
    address: AggregateAddress,
    first: Url,
    open_aggregates: SharedAggregates,
}

impl SpaceWindows {
    /// The windows of the Aggregate at `address`, whose window opens at `first`.
    #[must_use]
    pub fn new(address: AggregateAddress, first: Url, open_aggregates: SharedAggregates) -> Self {
        Self {
            address,
            first,
            open_aggregates,
        }
    }

    /// The address the Aggregate's window opens at.
    #[must_use]
    pub fn first(&self) -> &Url {
        &self.first
    }

    /// Where a window of the Aggregate asked to load `url` goes: within the
    /// Aggregate's own origin only, never to a remote one, and to its first
    /// address in place of its root.
    #[must_use]
    pub fn navigation(&self, url: &Url) -> Navigation {
        if !self.address.admits(url) {
            Navigation::Refuse
        } else if matches!(url.path(), "/" | "") && self.first.path() != "/" {
            Navigation::Redirect(self.first.clone())
        } else {
            Navigation::Load
        }
    }

    /// The label and address of a new window of the Aggregate, for a page of the
    /// Aggregate asking to open `url` (a Resource opened independently, or the
    /// Notes window), or `None` to refuse it.
    #[must_use]
    pub fn open_from_page(&self, url: &Url) -> Option<(String, Url)> {
        let url = match self.navigation(url) {
            Navigation::Refuse => return None,
            Navigation::Redirect(first) => first,
            Navigation::Load => url.clone(),
        };
        self.open_aggregates
            .open_view(self.address.key())
            .map(|label| (label, url))
    }

    /// Whether the window `label` is still one of the Aggregate's: false once the
    /// Aggregate has begun closing.
    #[must_use]
    pub fn holds(&self, label: &str) -> bool {
        self.open_aggregates.holds_window(self.address.key(), label)
    }
}

/// Register `address`'s scheme, where each Aggregate has a scheme of its own
/// (Windows). Tauri hands a webview the schemes registered when it is
/// created, and a plugin added to a running application registers its
/// schemes then (`tauri` 2.12.5, `AppHandle::plugin`, `plugin.rs`
/// `initialize`, `manager/webview.rs` `prepare_pending_webview`).
fn register_aggregate_scheme(
    app: &AppHandle,
    address: &AggregateAddress,
) -> Result<(), tauri::Error> {
    if SchemeStyle::CURRENT != SchemeStyle::SchemePerAggregate {
        return Ok(());
    }
    let scheme = address.scheme();
    let registered = app.state::<RegisteredSchemes>();
    let mut registered = registered.0.lock().unwrap_or_else(PoisonError::into_inner);
    if registered.contains(&scheme) {
        return Ok(());
    }
    let open_aggregates = Arc::clone(app.state::<SharedAggregates>().inner());
    // A plugin's name lives as long as the application, as the scheme does.
    let name: &'static str = Box::leak(scheme.clone().into_boxed_str());
    app.plugin(
        tauri::plugin::Builder::<tauri::Wry, ()>::new(name)
            .register_asynchronous_uri_scheme_protocol(name, move |context, request, responder| {
                crate::respond(&open_aggregates, &context, request, responder);
            })
            .build(),
    )?;
    let _new = registered.insert(scheme);
    Ok(())
}

impl AggregateServer {
    /// Start serving `directory`, whose window will have the label `label`.
    ///
    /// # Errors
    ///
    /// [`OpenError`] when the Aggregate cannot be started at all.
    pub fn start(app: &AppHandle, directory: &Path, label: &str) -> Result<Started, OpenError> {
        let shell =
            built_shell(&app.path().resource_dir()?.join("app")).map_err(OpenError::Built)?;
        let closing = Arc::new(AtomicBool::new(false));
        let notify = notify_in_dialog(app, directory, Arc::clone(&closing));
        let run = match tauri::async_runtime::block_on(open_run(directory, shell, notify)) {
            Ok(run) => run,
            Err(error) => {
                return unrun(directory, &error).ok_or(OpenError::Import(error));
            }
        };
        let address = AggregateAddress::new(AggregateKey::of(directory), SchemeStyle::CURRENT);
        let open_aggregates = Arc::clone(app.state::<SharedAggregates>().inner());
        if let Err(error) = register_aggregate_scheme(app, &address) {
            let _stopped = tauri::async_runtime::block_on(run.stop());
            return Err(OpenError::Tauri(error));
        }
        open_aggregates.open(address.clone(), Arc::clone(run.application()), label);
        let first = tauri::async_runtime::block_on(first_address(run.application()));
        let url = match address.window_url().and_then(|root| root.join(&first)) {
            Ok(url) => url,
            Err(error) => {
                drop(open_aggregates.close(address.key()));
                let _stopped = tauri::async_runtime::block_on(run.stop());
                return Err(OpenError::Url(error));
            }
        };
        Ok(Started::Serving(Self {
            app: app.clone(),
            run,
            closing,
            windows: Arc::new(SpaceWindows::new(address, url, open_aggregates)),
        }))
    }

    /// The address the Aggregate's window opens at.
    #[must_use]
    pub fn window_url(&self) -> WebviewUrl {
        WebviewUrl::CustomProtocol(self.windows.first().clone())
    }

    /// What every window of the Aggregate is held to.
    #[must_use]
    pub fn windows(&self) -> Arc<SpaceWindows> {
        Arc::clone(&self.windows)
    }

    /// Stop serving, writing any edit not yet on disk first, and destroy
    /// the windows the Aggregate's page opened. Answers why the last edit may
    /// not be on disk, or `None` when it is.
    pub fn stop(self) -> Option<String> {
        // How the last write ends is reported by the caller, not as news.
        self.closing.store(true, Ordering::SeqCst);
        let (opened, stopped) = tauri::async_runtime::block_on(close_aggregate(
            &self.windows.open_aggregates,
            self.windows.address.key(),
            self.run,
        ));
        for label in opened
            .iter()
            .filter(|label| label.starts_with(crate::scheme::VIEW_WINDOW_PREFIX))
        {
            if let Some(window) = self.app.get_webview_window(label) {
                let _ = window.destroy();
            }
        }
        match stopped {
            RunStopped::Stopped => None,
            RunStopped::Unwritten(error) => Some(format!("the last write failed: {error}")),
            other => Some(format!("the run stopped as {other:?}")),
        }
    }
}

#[cfg(test)]
mod tests;
