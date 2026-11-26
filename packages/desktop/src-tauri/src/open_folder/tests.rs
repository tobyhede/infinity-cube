//! A folder's open through the two entry points, with a recording fake of
//! the shell, the real [`Registry`], and real folders for new Spaces.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::cell::RefCell;
use std::collections::{HashSet, VecDeque};

use tempfile::TempDir;

use super::*;
use crate::aggregates::Close;

/// What serves an Aggregate in these tests: the directory it serves.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Server(PathBuf);

/// What starting a folder comes to, in the order the fake is asked.
enum Start {
    Serve,
    Empty,
    Fail,
}

/// Everything asked of the shell, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Call {
    Start(PathBuf),
    OpenWindow { label: String, title: String },
    Stop(Server),
    Focus(String),
    Offer(PathBuf),
    Error(String),
    ShowStart,
    CloseStart,
}

struct Fake<'r> {
    registry: &'r Mutex<Registry<Server>>,
    calls: RefCell<Vec<Call>>,
    starts: RefCell<VecDeque<Start>>,
    windows: RefCell<HashSet<String>>,
    accepts_offer: bool,
    window_fails: bool,
    quit_while_starting: bool,
}

impl<'r> Fake<'r> {
    fn new(registry: &'r Mutex<Registry<Server>>) -> Self {
        Self {
            registry,
            calls: RefCell::new(Vec::new()),
            starts: RefCell::new(VecDeque::new()),
            windows: RefCell::new(HashSet::new()),
            accepts_offer: false,
            window_fails: false,
            quit_while_starting: false,
        }
    }

    fn starting(self, starts: impl IntoIterator<Item = Start>) -> Self {
        self.starts.borrow_mut().extend(starts);
        self
    }

    fn calls(&self) -> Vec<Call> {
        self.calls.borrow().clone()
    }

    fn asked(&self, call: &Call) -> bool {
        self.calls.borrow().contains(call)
    }

    fn errors(&self) -> Vec<String> {
        self.calls
            .borrow()
            .iter()
            .filter_map(|call| match call {
                Call::Error(message) => Some(message.clone()),
                _ => None,
            })
            .collect()
    }

    fn record(&self, call: Call) {
        self.calls.borrow_mut().push(call);
    }
}

impl OpenFolderPort for Fake<'_> {
    type Server = Server;
    type Window = ();

    fn start(&self, directory: &Path, _label: &str) -> Result<Started<Server>, OpenError> {
        self.record(Call::Start(directory.to_path_buf()));
        if self.quit_while_starting {
            let _taken = lock(self.registry).take_all();
        }
        match self.starts.borrow_mut().pop_front().unwrap_or(Start::Serve) {
            Start::Serve => Ok(Started::Serving(Server(directory.to_path_buf()))),
            Start::Empty => Ok(Started::Empty),
            Start::Fail => Err(OpenError::Url(url::ParseError::EmptyHost)),
        }
    }

    fn window_of(_server: &Server) -> Self::Window {}

    fn open_window(&self, label: &str, (): (), title: &str) -> Result<(), OpenError> {
        self.record(Call::OpenWindow {
            label: label.to_owned(),
            title: title.to_owned(),
        });
        if self.window_fails {
            return Err(OpenError::Url(url::ParseError::EmptyHost));
        }
        let _new = self.windows.borrow_mut().insert(label.to_owned());
        Ok(())
    }

    fn stop(&self, server: Server, _directory: &Path) {
        self.record(Call::Stop(server));
    }

    fn focus(&self, label: &str) -> bool {
        self.record(Call::Focus(label.to_owned()));
        self.windows.borrow().contains(label)
    }

    fn offer_new_space(&self, directory: &Path) -> bool {
        self.record(Call::Offer(directory.to_path_buf()));
        self.accepts_offer
    }

    fn show_error(&self, message: &str) {
        self.record(Call::Error(message.to_owned()));
    }

    fn show_start(&self) {
        self.record(Call::ShowStart);
    }

    fn close_start(&self) {
        self.record(Call::CloseStart);
    }
}

/// A folder that exists, as the shell canonicalises it, in a directory of
/// its own.
fn folder(name: &str) -> (TempDir, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let folder = temporary.path().join(name);
    std::fs::create_dir(&folder).unwrap();
    let folder = std::fs::canonicalize(folder).unwrap();
    (temporary, folder)
}

/// Reserve `directory` as another request would, answering its label.
fn reserved_elsewhere(registry: &Mutex<Registry<Server>>, directory: &Path) -> String {
    match lock(registry).reserve(directory) {
        Reserved::New(label) => label,
        other => panic!(
            "expected {} to be free, found {other:?}",
            directory.display()
        ),
    }
}

mod given_a_folder_that_opens {
    use super::*;

    #[test]
    fn its_space_window_opens_titled_with_the_folder_name() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::Menu, std::slice::from_ref(&rust));

        assert_eq!(
            shell.calls(),
            [
                Call::Start(rust),
                Call::OpenWindow {
                    label: "space-0".to_owned(),
                    title: "rust".to_owned(),
                },
            ]
        );
    }

    #[test]
    fn from_the_start_window_it_closes_the_start_window() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::StartWindow, &[rust]);

        assert_eq!(shell.calls().last(), Some(&Call::CloseStart));
    }

    #[test]
    fn from_the_menu_or_the_command_line_it_leaves_the_start_window_as_it_is() {
        for origin in [Origin::Menu, Origin::CommandLine] {
            let (_temporary, rust) = folder("rust");
            let registry: Mutex<Registry<Server>> = Mutex::default();
            let shell = Fake::new(&registry);

            open(&shell, &registry, origin, &[rust]);

            assert!(!shell.asked(&Call::CloseStart), "{origin:?}");
            assert!(!shell.asked(&Call::ShowStart), "{origin:?}");
        }
    }

    #[test]
    fn two_spellings_of_one_folder_are_one_aggregate() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::Menu, std::slice::from_ref(&rust));
        open(&shell, &registry, Origin::StartWindow, &[rust.join(".")]);

        let starts = shell
            .calls()
            .into_iter()
            .filter(|call| matches!(call, Call::Start(_)))
            .count();
        assert_eq!(starts, 1);
        assert!(shell.asked(&Call::Focus("space-0".to_owned())));
        // Focused from the Start window, a Space window shows from it.
        assert_eq!(shell.calls().last(), Some(&Call::CloseStart));
    }
}

mod given_a_new_space {
    use super::*;

    #[test]
    fn it_is_written_opened_and_the_start_window_closes() {
        let (_temporary, location) = folder("spaces");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry);

        let created = create_space(&shell, &registry, &location, "Rust");

        assert_eq!(created, Ok(()));
        let written = location.join("Rust");
        assert!(written.join("aggregate.json").is_file());
        assert_eq!(
            shell.calls(),
            [
                Call::Start(written),
                Call::OpenWindow {
                    label: "space-0".to_owned(),
                    title: "Rust".to_owned(),
                },
                Call::CloseStart,
            ]
        );
    }

    #[test]
    fn a_name_that_is_no_folder_name_writes_and_opens_nothing() {
        let (_temporary, location) = folder("spaces");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry);

        let created = create_space(&shell, &registry, &location, "..");

        assert!(
            matches!(created, Err(NotCreated::Name { .. })),
            "{created:?}"
        );
        assert_eq!(shell.calls(), []);
        assert_eq!(std::fs::read_dir(&location).unwrap().count(), 0);
    }
}

mod given_a_folder_another_request_is_still_starting {
    use super::*;

    #[test]
    fn it_neither_starts_it_again_nor_closes_the_start_window() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let label = reserved_elsewhere(&registry, &rust);
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::StartWindow, &[rust]);

        assert_eq!(shell.calls(), [Call::Focus(label)]);
    }

    #[test]
    fn a_new_space_written_there_comes_back_written_and_not_opened() {
        let (_temporary, location) = folder("spaces");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let written = location.join("Rust");
        let _label = reserved_elsewhere(&registry, &written);
        let shell = Fake::new(&registry);

        let created = create_space(&shell, &registry, &location, "Rust");

        let Err(NotCreated::NotOpened { folder, detail }) = created else {
            panic!("expected the Space written and not opened, found {created:?}");
        };
        assert_eq!(folder, written);
        assert!(detail.contains("still being opened"), "{detail}");
        assert!(written.join("aggregate.json").is_file());
        assert!(!shell.asked(&Call::CloseStart));
    }
}

mod given_a_folder_whose_last_write_is_still_running {
    use super::*;

    #[test]
    fn opening_it_again_is_refused_with_why() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let label = reserved_elsewhere(&registry, &rust);
        lock(&registry)
            .opened(&label, Server(rust.clone()))
            .unwrap();
        // Closed without saving: its window is gone while its write runs on.
        let close = lock(&registry).begin_close(&label);
        assert!(matches!(close, Close::Stop { .. }));
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::Menu, &[rust]);

        let errors = shell.errors();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("still being written"), "{errors:?}");
    }
}

mod given_a_folder_that_holds_no_space {
    use super::*;

    #[test]
    fn declined_at_launch_with_nothing_open_the_start_window_shows() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry).starting([Start::Empty]);

        open(
            &shell,
            &registry,
            Origin::CommandLine,
            std::slice::from_ref(&rust),
        );

        assert_eq!(
            shell.calls(),
            [
                Call::Start(rust.clone()),
                Call::Offer(rust),
                Call::ShowStart
            ]
        );
    }

    #[test]
    fn declined_at_launch_beside_a_space_that_opened_nothing_more_shows() {
        let (_temporary, rust) = folder("rust");
        let (_other, notes) = folder("notes");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry).starting([Start::Empty, Start::Serve]);

        open(&shell, &registry, Origin::CommandLine, &[rust, notes]);

        assert!(!shell.asked(&Call::ShowStart));
    }

    #[test]
    fn declined_from_the_menu_it_leaves_the_windows_as_they_are() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry).starting([Start::Empty]);

        open(&shell, &registry, Origin::Menu, std::slice::from_ref(&rust));

        assert_eq!(
            shell.calls(),
            [Call::Start(rust.clone()), Call::Offer(rust)]
        );
        assert!(lock(&registry).is_empty());
    }

    #[test]
    fn accepted_from_the_start_window_it_writes_opens_and_closes_the_start_window() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake {
            accepts_offer: true,
            ..Fake::new(&registry)
        }
        .starting([Start::Empty, Start::Serve]);

        open(
            &shell,
            &registry,
            Origin::StartWindow,
            std::slice::from_ref(&rust),
        );

        assert!(rust.join("aggregate.json").is_file());
        assert_eq!(
            shell.calls(),
            [
                Call::Start(rust.clone()),
                Call::Offer(rust.clone()),
                Call::Start(rust),
                Call::OpenWindow {
                    label: "space-1".to_owned(),
                    title: "rust".to_owned(),
                },
                Call::CloseStart,
            ]
        );
    }
}

mod given_a_start_that_fails {
    use super::*;

    #[test]
    fn before_it_serves_the_folder_is_freed_and_the_presenter_told() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry).starting([Start::Fail]);

        open(&shell, &registry, Origin::StartWindow, &[rust]);

        assert!(lock(&registry).is_empty());
        let errors = shell.errors();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].starts_with("Could not open"), "{errors:?}");
        assert!(!shell.asked(&Call::CloseStart));
    }

    #[test]
    fn named_at_launch_the_presenter_is_told_and_the_start_window_shows() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry).starting([Start::Fail]);

        open(
            &shell,
            &registry,
            Origin::CommandLine,
            std::slice::from_ref(&rust),
        );

        let calls = shell.calls.borrow().clone();
        assert!(
            matches!(
                calls.as_slice(),
                [Call::Start(started), Call::Error(_), Call::ShowStart] if *started == rust
            ),
            "a failed start at launch says why, then shows the Start window: {calls:?}"
        );
        assert!(lock(&registry).is_empty());
    }

    #[test]
    fn opening_its_window_stops_the_server_frees_the_folder_and_tells_the_presenter() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake {
            window_fails: true,
            ..Fake::new(&registry)
        };

        open(&shell, &registry, Origin::Menu, std::slice::from_ref(&rust));

        assert!(lock(&registry).is_empty());
        assert!(shell.asked(&Call::Stop(Server(rust))));
        assert_eq!(shell.errors().len(), 1);
    }
}

mod given_a_quit {
    use super::*;

    #[test]
    fn begun_while_a_folder_starts_its_server_is_stopped_and_nothing_is_said() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake {
            quit_while_starting: true,
            ..Fake::new(&registry)
        };

        open(
            &shell,
            &registry,
            Origin::CommandLine,
            std::slice::from_ref(&rust),
        );

        assert_eq!(
            shell.calls(),
            [Call::Start(rust.clone()), Call::Stop(Server(rust))]
        );
    }

    #[test]
    fn begun_before_a_folder_is_asked_for_nothing_starts() {
        let (_temporary, rust) = folder("rust");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let _taken = lock(&registry).take_all();
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::StartWindow, &[rust]);

        // Nothing starts, nothing is said, and nothing is left for the
        // Start window to stay open for.
        assert_eq!(shell.calls(), [Call::CloseStart]);
    }

    #[test]
    fn begun_before_a_launch_naming_no_folder_the_start_window_does_not_show() {
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let _taken = lock(&registry).take_all();
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::CommandLine, &[]);

        assert_eq!(shell.calls(), []);
    }

    #[test]
    fn begun_while_a_new_space_starts_it_is_written_and_nothing_is_said() {
        let (_temporary, location) = folder("spaces");
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake {
            quit_while_starting: true,
            ..Fake::new(&registry)
        };

        let created = create_space(&shell, &registry, &location, "Rust");

        assert_eq!(created, Ok(()));
        assert!(location.join("Rust").join("aggregate.json").is_file());
        assert!(!shell.asked(&Call::CloseStart));
        assert!(shell.errors().is_empty());
    }
}

mod given_a_launch {
    use super::*;

    #[test]
    fn naming_no_folder_shows_the_start_window() {
        let registry: Mutex<Registry<Server>> = Mutex::default();
        let shell = Fake::new(&registry);

        open(&shell, &registry, Origin::CommandLine, &[]);

        assert_eq!(shell.calls(), [Call::ShowStart]);
    }
}
