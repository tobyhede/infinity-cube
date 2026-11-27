//! Which Aggregate directories are open, in which window, and how far each
//! has got: starting its server, open, or closing while the server writes
//! its last edit.
//!
//! The registry is generic over what serves an Aggregate, so its transitions are
//! tested without starting a process.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

/// The prefix every Space window's label starts with.
pub const SPACE_WINDOW_PREFIX: &str = "space-";

/// The data behind `mutex`, even if a thread panicked holding it: a map of
/// servers stays valid whatever panicked, and losing one would lose its edits.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Each Aggregate by its window's label.
#[derive(Debug)]
pub struct Registry<S> {
    aggregates: HashMap<String, Aggregate<S>>,
    next: u64,
    quitting: bool,
}

#[derive(Debug)]
struct Aggregate<S> {
    directory: PathBuf,
    state: State<S>,
}

#[derive(Debug)]
enum State<S> {
    Starting,
    Open(S),
    Closing,
}

/// What asking to open a directory came to.
#[derive(Debug, PartialEq, Eq)]
pub enum Reserved {
    /// Nothing has the directory: start it in the window with this label.
    New(String),
    /// The window with this label already has the directory, or is starting
    /// or closing it.
    Existing(String),
    /// The application is quitting: open nothing more.
    Quitting,
}

/// What a request to close a window came to.
#[derive(Debug, PartialEq, Eq)]
pub enum Close<S> {
    /// The window's Aggregate is open: stop `server`, which serves `directory`,
    /// and keep the window until it has stopped.
    Stop { server: S, directory: PathBuf },
    /// The window's server is already being stopped: keep the window.
    StillClosing,
    /// The window holds no open Aggregate: let it close.
    NotOpen,
}

impl<S> Default for Registry<S> {
    fn default() -> Self {
        Self {
            aggregates: HashMap::new(),
            next: 0,
            quitting: false,
        }
    }
}

impl<S> Registry<S> {
    /// Claim `directory` for a new Space window, unless a window already has it.
    ///
    /// `directory` should be canonical, so two spellings of one directory are
    /// one Aggregate. Once [`Self::take_all`] has been called, nothing more
    /// is reserved.
    pub fn reserve(&mut self, directory: &Path) -> Reserved {
        if self.quitting {
            return Reserved::Quitting;
        }
        if let Some((label, _)) = self
            .aggregates
            .iter()
            .find(|(_, aggregate)| aggregate.directory == directory)
        {
            return Reserved::Existing(label.clone());
        }
        let label = format!("{SPACE_WINDOW_PREFIX}{}", self.next);
        self.next += 1;
        self.aggregates.insert(
            label.clone(),
            Aggregate {
                directory: directory.to_path_buf(),
                state: State::Starting,
            },
        );
        Reserved::New(label)
    }

    /// The reserved Aggregate `label` is served by `server`.
    ///
    /// # Errors
    ///
    /// Hands `server` back if `label` is not an Aggregate still starting, or
    /// once [`Self::take_all`] has been called.
    pub fn opened(&mut self, label: &str, server: S) -> Result<(), S> {
        match self.aggregates.get_mut(label) {
            Some(aggregate) if !self.quitting && matches!(aggregate.state, State::Starting) => {
                aggregate.state = State::Open(server);
                Ok(())
            }
            _ => Err(server),
        }
    }

    /// Forget Aggregate `label`, which did not open, answering its server if it had one.
    pub fn abandon(&mut self, label: &str) -> Option<S> {
        match self.aggregates.remove(label)?.state {
            State::Open(server) => Some(server),
            State::Starting | State::Closing => None,
        }
    }

    /// Begin closing window `label`.
    pub fn begin_close(&mut self, label: &str) -> Close<S> {
        let Some(aggregate) = self.aggregates.get_mut(label) else {
            return Close::NotOpen;
        };
        match std::mem::replace(&mut aggregate.state, State::Closing) {
            State::Open(server) => Close::Stop {
                server,
                directory: aggregate.directory.clone(),
            },
            State::Closing => Close::StillClosing,
            State::Starting => {
                aggregate.state = State::Starting;
                Close::NotOpen
            }
        }
    }

    /// Window `label`'s server has stopped: its directory may be opened again.
    pub fn closed(&mut self, label: &str) {
        self.aggregates.remove(label);
    }

    /// Whether window `label`'s Aggregate is closing: its server is still being
    /// stopped, though its window may be gone.
    #[must_use]
    pub fn is_closing(&self, label: &str) -> bool {
        self.aggregates
            .get(label)
            .is_some_and(|aggregate| matches!(aggregate.state, State::Closing))
    }

    /// Whether a quit has begun ([`Self::take_all`]), after which nothing
    /// opens.
    #[must_use]
    pub fn is_quitting(&self) -> bool {
        self.quitting
    }

    /// Whether no Aggregate is starting, open or closing.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.aggregates.is_empty()
    }

    /// Begin closing every open Aggregate, answering each window's label, its
    /// directory and its server. A quit calls it, and from then on nothing
    /// opens, so nothing opens that the quit does not wait for.
    pub fn take_all(&mut self) -> Vec<(String, PathBuf, S)> {
        self.quitting = true;
        let mut taken = Vec::new();
        for (label, aggregate) in &mut self.aggregates {
            if matches!(aggregate.state, State::Open(_))
                && let State::Open(server) = std::mem::replace(&mut aggregate.state, State::Closing)
            {
                taken.push((label.clone(), aggregate.directory.clone(), server));
            }
        }
        taken
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label_of(reserved: Reserved) -> String {
        match reserved {
            Reserved::New(label) | Reserved::Existing(label) => label,
            Reserved::Quitting => panic!("nothing has quit"),
        }
    }

    /// A registry with `directory` open in a window, served by `server`.
    fn open(directory: &str, server: &'static str) -> (Registry<&'static str>, String) {
        let mut registry = Registry::default();
        let label = label_of(registry.reserve(Path::new(directory)));
        assert_eq!(
            registry.opened(&label, server),
            Ok(()),
            "a reserved Aggregate should take its server"
        );
        (registry, label)
    }

    mod given_a_directory_already_open {
        use super::*;

        #[test]
        fn opening_it_again_answers_its_window_instead_of_a_new_one() {
            let (mut registry, label) = open("/spaces/rust", "first");
            assert_eq!(
                registry.reserve(Path::new("/spaces/rust")),
                Reserved::Existing(label),
                "a directory already open should be focused, not served twice"
            );
        }

        #[test]
        fn another_directory_opens_in_a_window_of_its_own() {
            let (mut registry, label) = open("/spaces/rust", "first");
            let other = registry.reserve(Path::new("/spaces/go"));
            assert!(
                matches!(&other, Reserved::New(new) if *new != label),
                "a different directory should get a new window, got {other:?}"
            );
        }

        #[test]
        fn a_directory_still_starting_is_not_started_twice() {
            let mut registry: Registry<&str> = Registry::default();
            let label = label_of(registry.reserve(Path::new("/spaces/rust")));
            assert_eq!(
                registry.reserve(Path::new("/spaces/rust")),
                Reserved::Existing(label),
                "a directory whose server is starting should not start another"
            );
        }
    }

    mod given_a_window_closing {
        use super::*;

        #[test]
        fn the_first_request_stops_its_server() {
            let (mut registry, label) = open("/spaces/rust", "server");
            assert_eq!(
                registry.begin_close(&label),
                Close::Stop {
                    server: "server",
                    directory: PathBuf::from("/spaces/rust")
                },
                "closing an open Aggregate should stop its server"
            );
        }

        #[test]
        fn a_repeated_request_keeps_the_window_while_the_server_writes() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.begin_close(&label),
                Close::StillClosing,
                "a second close request should still be held"
            );
        }

        #[test]
        fn its_directory_is_not_opened_again_until_the_server_has_stopped() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.reserve(Path::new("/spaces/rust")),
                Reserved::Existing(label.clone()),
                "a directory still being written should not be read by a new server"
            );
            registry.closed(&label);
            assert!(
                matches!(
                    registry.reserve(Path::new("/spaces/rust")),
                    Reserved::New(_)
                ),
                "a closed directory should open again"
            );
        }

        #[test]
        fn a_closing_aggregate_is_not_stopped_again_on_quit() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            assert!(
                registry.take_all().is_empty(),
                "quitting should not take a server a close already took"
            );
        }

        #[test]
        fn it_is_closing_until_its_server_has_stopped_and_no_open_aggregate_is() {
            let (mut registry, label) = open("/spaces/rust", "server");
            assert!(
                !registry.is_closing(&label),
                "an open Aggregate is not closing"
            );
            let _ = registry.begin_close(&label);
            assert!(registry.is_closing(&label), "its server is being stopped");
            registry.closed(&label);
            assert!(!registry.is_closing(&label), "a closed Aggregate is gone");
        }

        #[test]
        fn holds_an_aggregate_from_starting_until_it_has_closed() {
            let mut registry: Registry<&str> = Registry::default();
            assert!(registry.is_empty(), "nothing is open at first");
            let Reserved::New(label) = registry.reserve(Path::new("/spaces/rust")) else {
                panic!("a new directory should be reserved");
            };
            assert!(!registry.is_empty(), "a starting Aggregate counts");
            registry.opened(&label, "server").unwrap();
            let _ = registry.begin_close(&label);
            assert!(!registry.is_empty(), "a closing Aggregate counts");
            registry.closed(&label);
            assert!(registry.is_empty(), "a closed Aggregate is gone");
        }

        #[test]
        fn a_window_that_is_no_aggregate_closes() {
            let mut registry: Registry<&str> = Registry::default();
            assert_eq!(
                registry.begin_close("closing-0"),
                Close::NotOpen,
                "a question window should close at once"
            );
        }
    }

    mod given_two_aggregates_open {
        use super::*;

        #[test]
        fn quitting_takes_every_open_server() {
            let (mut registry, _) = open("/spaces/rust", "first");
            let second = label_of(registry.reserve(Path::new("/spaces/go")));
            assert_eq!(
                registry.opened(&second, "second"),
                Ok(()),
                "a second directory should open beside the first"
            );
            let mut taken: Vec<_> = registry.take_all().into_iter().map(|(_, _, s)| s).collect();
            taken.sort_unstable();
            assert_eq!(
                taken,
                vec!["first", "second"],
                "quitting should stop every open Aggregate"
            );
        }
    }

    mod given_a_quit_begun {
        use super::*;

        #[test]
        fn opening_another_directory_is_refused() {
            let (mut registry, _label) = open("/spaces/rust", "first");
            let _taken = registry.take_all();
            assert_eq!(
                registry.reserve(Path::new("/spaces/go")),
                Reserved::Quitting,
                "a directory opened once a quit has collected the open Aggregates would not be waited for"
            );
        }

        #[test]
        fn an_aggregate_still_starting_does_not_open() {
            let mut registry = Registry::default();
            let label = label_of(registry.reserve(Path::new("/spaces/rust")));
            let _taken = registry.take_all();
            assert_eq!(
                registry.opened(&label, "late"),
                Err("late"),
                "an Aggregate that finished starting after the quit collected the open ones would not be waited for"
            );
        }
    }
}
