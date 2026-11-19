//! A talk served by the Rust host in the shell's own process (ADR 0155):
//! starting its run, the address its window opens at, what each of its
//! windows may navigate to and open, and stopping it when its window closes.
//!
//! Each talk is one [`Run`] of `host`, served through the scheme handler
//! ([`crate::scheme`]) at the talk's own origin ([`crate::address`]): no
//! port, no `Host` check and no launch secret. Stopping a talk first stops
//! serving it, so no Edit arrives after the last write, then waits for
//! the run to write any Edit not yet on disk, however long that takes.

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex, PoisonError};

use host::{BuiltFiles, ImportError, RandomIds, Run, RunEvent, RunStopped, Shell, TokioClock};
use tauri::{AppHandle, Manager as _, WebviewUrl};
use url::Url;

use crate::address::{SchemeStyle, TalkAddress, TalkKey};
use crate::built::{self, BuiltDirectory};
use crate::scheme::{Closed, OpenTalks};

/// Why a talk could not be opened.
#[derive(Debug, thiserror::Error)]
pub enum OpenError {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error("could not read the built application: {0}")]
    Built(#[source] std::io::Error),
    #[error("could not start the talk: {0}")]
    Import(#[source] ImportError),
    #[error("the talk's address is not a URL: {0}")]
    Url(#[from] url::ParseError),
}

/// What starting a talk came to.
#[derive(Debug)]
pub enum Started {
    /// The talk is served; open its window at [`TalkServer::window_url`].
    Serving(TalkServer),
    /// The folder cannot be run; `message` says why, in the author's words.
    Refused { message: String },
}

/// Every open talk, which the scheme handler reads.
pub type SharedTalks = Arc<OpenTalks>;

/// The schemes registered so far, where each talk has a scheme of its own.
#[derive(Debug, Default)]
pub struct RegisteredSchemes(Mutex<HashSet<String>>);

/// Close a talk: stop serving it, so no Edit arrives after the last
/// write, wait for every change still being answered, so an Edit the page
/// is told landed is in the last write, then stop its run, which writes
/// any Edit not yet on disk and answers once the write has landed or
/// failed. Nothing is given up on: a read still being answered commits no
/// Edit, and a change waits on nothing outside the process.
pub async fn close_talk<B: BuiltFiles>(
    open_talks: &OpenTalks,
    key: &TalkKey,
    run: Run<RandomIds, B>,
) -> (Vec<String>, RunStopped) {
    let windows = match open_talks.close(key) {
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
/// standard error, naming the directory.
///
/// # Errors
///
/// [`ImportError`] when the directory cannot be run; nothing is written.
pub async fn open_run<B: BuiltFiles>(
    directory: &Path,
    shell: Shell<B>,
) -> Result<Run<RandomIds, B>, ImportError> {
    let written = directory.display().to_string();
    let served = written.clone();
    Run::builder()
        .directory(directory)
        .ids(RandomIds)
        .clock(TokioClock)
        .on_event(move |event| {
            if let RunEvent::WriteFailed(error) = event {
                eprintln!("Could not write {written}: {error}; trying again once edits are quiet.");
            }
        })
        .on_error(move |failed, error| eprintln!("{failed} for {served}: {error}"))
        .start(shell)
        .await
}

/// What a presenter reads when a folder cannot be opened, or `None` when
/// the failure is not the folder's.
fn refusal(directory: &Path, error: &ImportError) -> Option<String> {
    let shown = directory.display();
    match error {
        // A presenter has no `pnpm cube init`, so no command is named.
        ImportError::Empty => Some(format!("{shown} holds no talk: it is missing or empty.")),
        ImportError::Refused(refusals) => {
            let mut message = format!("{shown} is not a talk InfinityCube can open:");
            for refusal in refusals.as_slice() {
                message.push_str("\n- ");
                message.push_str(&refusal.located());
            }
            Some(message)
        }
        _ => None,
    }
}

/// A talk served by the Rust host in this process.
#[derive(Debug)]
pub struct TalkServer {
    app: AppHandle,
    run: Run<RandomIds, BuiltDirectory>,
    windows: Arc<TalkWindows>,
}

/// The address a talk's window opens at: where its root address redirects,
/// the Meta Space's product address, or the root when it does not redirect.
///
/// WebKitGTK does not follow a redirect a custom scheme answers a navigation
/// with, so the shell follows the root's itself and opens the window there.
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

/// Where a window of a talk goes when it is asked to load an address.
#[derive(Debug, PartialEq, Eq)]
pub enum Navigation {
    /// Load it: an address of the talk's own origin.
    Load,
    /// Load the talk's first address instead: the talk's root, which the
    /// application answers with a redirect WebKitGTK does not follow.
    Redirect(Url),
    /// Load nothing: an address outside the talk's origin.
    Refuse,
}

/// What every window of one talk is held to.
#[derive(Debug)]
pub struct TalkWindows {
    address: TalkAddress,
    first: Url,
    open_talks: SharedTalks,
}

impl TalkWindows {
    /// The windows of the talk at `address`, whose window opens at `first`.
    #[must_use]
    pub fn new(address: TalkAddress, first: Url, open_talks: SharedTalks) -> Self {
        Self {
            address,
            first,
            open_talks,
        }
    }

    /// The address the talk's window opens at.
    #[must_use]
    pub fn first(&self) -> &Url {
        &self.first
    }

    /// Where a window of the talk asked to load `url` goes: within the
    /// talk's own origin only, never to a remote one, and to its first
    /// address in place of its root.
    #[must_use]
    pub fn navigation(&self, url: &Url) -> Navigation {
        if !self.address.admits(url) {
            Navigation::Refuse
        } else if url.path() == "/" && self.first.path() != "/" {
            Navigation::Redirect(self.first.clone())
        } else {
            Navigation::Load
        }
    }

    /// The label and address of a new window of the talk, for a page of the
    /// talk asking to open `url` (a Resource opened independently, or the
    /// Notes window), or `None` to refuse it.
    #[must_use]
    pub fn open_from_page(&self, url: &Url) -> Option<(String, Url)> {
        let url = match self.navigation(url) {
            Navigation::Refuse => return None,
            Navigation::Redirect(first) => first,
            Navigation::Load => url.clone(),
        };
        self.open_talks
            .open_view(self.address.key())
            .map(|label| (label, url))
    }

    /// Whether the window `label` is still one of the talk's: false once the
    /// talk has begun closing.
    #[must_use]
    pub fn holds(&self, label: &str) -> bool {
        self.open_talks.holds_window(self.address.key(), label)
    }
}

/// Register `address`'s scheme, where each talk has a scheme of its own
/// (Windows). Tauri hands a webview the schemes registered when it is
/// created, and a plugin added to a running application registers its
/// schemes then (`tauri` 2.12.5, `AppHandle::plugin`, `plugin.rs`
/// `initialize`, `manager/webview.rs` `prepare_pending_webview`).
fn register_talk_scheme(app: &AppHandle, address: &TalkAddress) -> Result<(), tauri::Error> {
    if SchemeStyle::CURRENT != SchemeStyle::SchemePerTalk {
        return Ok(());
    }
    let scheme = address.scheme();
    let registered = app.state::<RegisteredSchemes>();
    let mut registered = registered.0.lock().unwrap_or_else(PoisonError::into_inner);
    if registered.contains(&scheme) {
        return Ok(());
    }
    let open_talks = Arc::clone(app.state::<SharedTalks>().inner());
    // A plugin's name lives as long as the application, as the scheme does.
    let name: &'static str = Box::leak(scheme.clone().into_boxed_str());
    app.plugin(
        tauri::plugin::Builder::<tauri::Wry, ()>::new(name)
            .register_asynchronous_uri_scheme_protocol(name, move |context, request, responder| {
                crate::respond(&open_talks, &context, request, responder);
            })
            .build(),
    )?;
    let _new = registered.insert(scheme);
    Ok(())
}

impl TalkServer {
    /// Start serving `directory`, whose window will have the label `label`.
    ///
    /// # Errors
    ///
    /// [`OpenError`] when the talk cannot be started at all.
    pub fn start(app: &AppHandle, directory: &Path, label: &str) -> Result<Started, OpenError> {
        let shell =
            built::load(&app.path().resource_dir()?.join("app")).map_err(OpenError::Built)?;
        let run = match tauri::async_runtime::block_on(open_run(directory, shell)) {
            Ok(run) => run,
            Err(error) => {
                return match refusal(directory, &error) {
                    Some(message) => Ok(Started::Refused { message }),
                    None => Err(OpenError::Import(error)),
                };
            }
        };
        let address = TalkAddress::new(TalkKey::of(directory), SchemeStyle::CURRENT);
        let open_talks = Arc::clone(app.state::<SharedTalks>().inner());
        if let Err(error) = register_talk_scheme(app, &address) {
            let _stopped = tauri::async_runtime::block_on(run.stop());
            return Err(OpenError::Tauri(error));
        }
        open_talks.open(address.clone(), Arc::clone(run.application()), label);
        let first = tauri::async_runtime::block_on(first_address(run.application()));
        let url = match address.window_url().and_then(|root| root.join(&first)) {
            Ok(url) => url,
            Err(error) => {
                drop(open_talks.close(address.key()));
                let _stopped = tauri::async_runtime::block_on(run.stop());
                return Err(OpenError::Url(error));
            }
        };
        Ok(Started::Serving(Self {
            app: app.clone(),
            run,
            windows: Arc::new(TalkWindows::new(address, url, open_talks)),
        }))
    }

    /// The address the talk's window opens at.
    #[must_use]
    pub fn window_url(&self) -> WebviewUrl {
        WebviewUrl::CustomProtocol(self.windows.first().clone())
    }

    /// What every window of the talk is held to.
    #[must_use]
    pub fn windows(&self) -> Arc<TalkWindows> {
        Arc::clone(&self.windows)
    }

    /// Stop serving, writing any edit not yet on disk first, and destroy
    /// the windows the talk's page opened. Answers why the last edit may
    /// not be on disk, or `None` when it is.
    pub fn stop(self) -> Option<String> {
        let (opened, stopped) = tauri::async_runtime::block_on(close_talk(
            &self.windows.open_talks,
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
mod tests {
    #![allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        reason = "a test fails by panicking"
    )]

    use std::path::PathBuf;

    use super::*;
    use crate::test_support::{META, META_API, fixture_copy, rename_text, stand_in_build};

    /// Every file below `directory`, with its bytes.
    fn snapshot(directory: &Path) -> Vec<(PathBuf, Vec<u8>)> {
        let mut files = Vec::new();
        let mut pending = vec![directory.to_path_buf()];
        while let Some(next) = pending.pop() {
            for entry in std::fs::read_dir(&next).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    pending.push(path);
                } else {
                    files.push((path.clone(), std::fs::read(&path).unwrap()));
                }
            }
        }
        files.sort();
        files
    }

    /// A talk open in the window `talk-0`, as the shell opens one.
    async fn open(
        directory: &Path,
        built: &Path,
    ) -> (OpenTalks, TalkKey, Run<RandomIds, BuiltDirectory>) {
        let run = open_run(directory, built::load(built).unwrap())
            .await
            .unwrap();
        let key = TalkKey::of(directory);
        let open_talks = OpenTalks::new(SchemeStyle::HostPerTalk);
        open_talks.open(
            TalkAddress::new(key.clone(), SchemeStyle::HostPerTalk),
            Arc::clone(run.application()),
            "talk-0",
        );
        (open_talks, key, run)
    }

    fn request(key: &TalkKey, method: &str, path: &str, body: &str) -> http::Request<Vec<u8>> {
        let origin = TalkAddress::new(key.clone(), SchemeStyle::HostPerTalk).origin();
        http::Request::builder()
            .method(method)
            .uri(format!("{origin}{path}"))
            .header("origin", origin)
            .header("content-type", "application/json")
            .body(body.as_bytes().to_vec())
            .unwrap()
    }

    mod closing_a_talk {
        use super::*;

        #[tokio::test]
        async fn after_an_edit_leaves_the_directory_with_the_edit() {
            let (temporary, directory) = fixture_copy();
            let (open_talks, key, run) = open(&directory, &stand_in_build(&temporary)).await;
            let loaded = open_talks
                .answer("talk-0", request(&key, "GET", META_API, ""))
                .await;
            let loaded: serde_json::Value = serde_json::from_slice(loaded.body()).unwrap();
            let committed = open_talks
                .answer(
                    "talk-0",
                    request(
                        &key,
                        "POST",
                        "/api/spaces",
                        &rename_text(&loaded, "Closed with an edit"),
                    ),
                )
                .await;
            assert_eq!(committed.status(), 200, "the edit is committed");
            // Closed at once, inside the quiet period: the close writes it.
            let (windows, stopped) = close_talk(&open_talks, &key, run).await;
            assert_eq!(windows, vec!["talk-0".to_owned()], "its window");
            assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
            let written = std::fs::read_to_string(directory.join(META).join("space.json")).unwrap();
            assert!(
                written.contains("Closed with an edit"),
                "the directory should hold the edit: {written}"
            );
        }

        #[tokio::test]
        async fn opened_and_closed_without_an_edit_leaves_the_directory_unchanged() {
            let (temporary, directory) = fixture_copy();
            let before = snapshot(&directory);
            let (open_talks, key, run) = open(&directory, &stand_in_build(&temporary)).await;
            // Opening the talk's page reads it, which initializes its Spaces (ST-65).
            for path in [
                "/",
                "/spaces/AAAAAAAAQACAAAAAAAAAQA",
                "/api/spaces",
                META_API,
            ] {
                let response = open_talks
                    .answer("talk-0", request(&key, "GET", path, ""))
                    .await;
                assert!(
                    response.status().as_u16() < 400,
                    "{path}: {}",
                    response.status()
                );
            }
            let (_windows, stopped) = close_talk(&open_talks, &key, run).await;
            assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
            assert!(
                snapshot(&directory) == before,
                "the directory should be byte for byte as it was (ST-65)"
            );
        }

        /// An Edit the page has sent before the close, which the handler
        /// is still answering however long the close waits, is answered
        /// 200 and must be in the last write.
        #[tokio::test(start_paused = true)]
        async fn writes_an_edit_still_being_answered_however_long_it_takes() {
            let (temporary, directory) = fixture_copy();
            let (open_talks, key, run) = open(&directory, &stand_in_build(&temporary)).await;
            let loaded = open_talks
                .answer("talk-0", request(&key, "GET", META_API, ""))
                .await;
            let loaded: serde_json::Value = serde_json::from_slice(loaded.body()).unwrap();
            let Ok(admitted) = open_talks.admit(
                "talk-0",
                request(
                    &key,
                    "POST",
                    "/api/spaces",
                    &rename_text(&loaded, "Answered while closing"),
                ),
            ) else {
                panic!("the change should be admitted before the close");
            };
            let answer_late = async {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                admitted.answer().await
            };
            let ((_windows, stopped), committed) =
                tokio::join!(close_talk(&open_talks, &key, run), answer_late);
            assert_eq!(committed.status(), 200, "the page is told the edit landed");
            assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
            let written = std::fs::read_to_string(directory.join(META).join("space.json")).unwrap();
            assert!(
                written.contains("Answered while closing"),
                "an edit answered 200 should be on disk after the close: {written}"
            );
        }

        #[tokio::test]
        async fn refuses_a_request_made_once_it_is_closing() {
            let (temporary, directory) = fixture_copy();
            let (open_talks, key, run) = open(&directory, &stand_in_build(&temporary)).await;
            let (_windows, _stopped) = close_talk(&open_talks, &key, run).await;
            let response = open_talks
                .answer("talk-0", request(&key, "GET", "/api/spaces", ""))
                .await;
            assert_eq!(
                response.status(),
                404,
                "no Edit can arrive after the last write"
            );
        }
    }

    #[tokio::test]
    async fn a_talk_window_opens_at_the_meta_space_the_root_redirects_to() {
        let (temporary, directory) = fixture_copy();
        let (open_talks, key, run) = open(&directory, &stand_in_build(&temporary)).await;
        assert_eq!(
            first_address(run.application()).await,
            crate::test_support::META_ADDRESS,
            "the root's redirect, followed by the shell"
        );
        let (_windows, _stopped) = close_talk(&open_talks, &key, run).await;
    }

    mod a_talk_window {
        use super::*;

        fn windows() -> (TalkWindows, Url) {
            let address = TalkAddress::new(
                TalkKey::of(Path::new("/talks/rust")),
                SchemeStyle::HostPerTalk,
            );
            let root = address.window_url().unwrap();
            let first = root.join(crate::test_support::META_ADDRESS).unwrap();
            let open_talks = Arc::new(OpenTalks::new(SchemeStyle::HostPerTalk));
            (TalkWindows::new(address, first, open_talks), root)
        }

        #[test]
        fn asked_for_the_talks_root_loads_the_address_it_redirects_to() {
            let (windows, root) = windows();
            for asked in ["/", "/?reload=1", "/#top"] {
                assert_eq!(
                    windows.navigation(&root.join(asked).unwrap()),
                    Navigation::Redirect(windows.first().clone()),
                    "{asked}: WebKitGTK would stay on the redirect's empty body"
                );
            }
        }

        #[test]
        fn loads_any_other_address_of_its_talk_and_none_elsewhere() {
            let (windows, root) = windows();
            assert_eq!(
                windows.navigation(windows.first()),
                Navigation::Load,
                "its first address"
            );
            assert_eq!(
                windows.navigation(&root.join("/spaces/AAAAAAAAQACAAAAAAAAAQA/notes").unwrap()),
                Navigation::Load,
                "another page of the talk"
            );
            assert_eq!(
                windows.navigation(&Url::parse("https://example.com/").unwrap()),
                Navigation::Refuse,
                "a remote origin"
            );
        }

        #[tokio::test]
        async fn a_page_opening_the_talks_root_opens_its_first_address() {
            let (windows, root) = windows();
            let (temporary, directory) = fixture_copy();
            let run = open_run(
                &directory,
                built::load(&stand_in_build(&temporary)).unwrap(),
            )
            .await
            .unwrap();
            windows.open_talks.open(
                windows.address.clone(),
                Arc::clone(run.application()),
                "talk-0",
            );
            let opened = windows.open_from_page(&root);
            assert!(
                matches!(&opened, Some((_label, url)) if url == windows.first()),
                "{opened:?}"
            );
            let _stopped = run.stop().await;
        }
    }

    #[test]
    fn a_folder_with_no_talk_is_refused_naming_no_command() {
        let message = refusal(Path::new("/talks/empty"), &ImportError::Empty).unwrap();
        assert!(
            message.starts_with("/talks/empty holds no talk"),
            "{message}"
        );
        assert!(
            !message.contains("pnpm"),
            "a presenter has no pnpm: {message}"
        );
        assert!(
            !message.contains("aggregate.json"),
            "a folder holding files but no aggregate.json is refused by intake, not as empty: {message}"
        );
    }

    #[tokio::test]
    async fn a_folder_intake_refuses_is_refused_with_where_each_refusal_is() {
        let (temporary, directory) = fixture_copy();
        std::fs::remove_file(directory.join("aggregate.json")).unwrap();
        let error = open_run(
            &directory,
            built::load(&stand_in_build(&temporary)).unwrap(),
        )
        .await
        .unwrap_err();
        let message = refusal(&directory, &error).unwrap();
        assert!(
            message.contains("(aggregate-file-missing at aggregate.json)"),
            "each refusal names its kind and file: {message}"
        );
    }
}
