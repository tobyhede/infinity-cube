//! Which Aggregate directories are open, in which window, and how far each
//! has got: starting its server, open, or closing while the server writes
//! its last edit.
//!
//! The registry is generic over what serves a talk, so its transitions are
//! tested without starting a process.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// The prefix every talk window's label starts with.
pub const TALK_WINDOW_PREFIX: &str = "talk-";

/// Each talk by its window's label.
#[derive(Debug)]
pub struct Registry<S> {
    talks: HashMap<String, Talk<S>>,
    next: u64,
}

#[derive(Debug)]
struct Talk<S> {
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
}

/// What a request to close a window came to.
#[derive(Debug, PartialEq, Eq)]
pub enum Close<S> {
    /// The window's talk is open: stop `server`, which serves `directory`,
    /// and keep the window until it has stopped.
    Stop { server: S, directory: PathBuf },
    /// The window's server is already being stopped: keep the window.
    StillClosing,
    /// The window holds no open talk: let it close.
    NotOpen,
}

impl<S> Default for Registry<S> {
    fn default() -> Self {
        Self {
            talks: HashMap::new(),
            next: 0,
        }
    }
}

impl<S> Registry<S> {
    /// Claim `directory` for a new talk window, unless a window already has it.
    ///
    /// `directory` should be canonical, so two spellings of one directory are
    /// one talk.
    pub fn reserve(&mut self, directory: &Path) -> Reserved {
        if let Some((label, _)) = self
            .talks
            .iter()
            .find(|(_, talk)| talk.directory == directory)
        {
            return Reserved::Existing(label.clone());
        }
        let label = format!("{TALK_WINDOW_PREFIX}{}", self.next);
        self.next += 1;
        self.talks.insert(
            label.clone(),
            Talk {
                directory: directory.to_path_buf(),
                state: State::Starting,
            },
        );
        Reserved::New(label)
    }

    /// The reserved talk `label` is served by `server`.
    ///
    /// # Errors
    ///
    /// Hands `server` back if `label` is not a talk still starting.
    pub fn opened(&mut self, label: &str, server: S) -> Result<(), S> {
        match self.talks.get_mut(label) {
            Some(talk) if matches!(talk.state, State::Starting) => {
                talk.state = State::Open(server);
                Ok(())
            }
            _ => Err(server),
        }
    }

    /// Forget talk `label`, which did not open, answering its server if it had one.
    pub fn abandon(&mut self, label: &str) -> Option<S> {
        match self.talks.remove(label)?.state {
            State::Open(server) => Some(server),
            State::Starting | State::Closing => None,
        }
    }

    /// Begin closing window `label`.
    pub fn begin_close(&mut self, label: &str) -> Close<S> {
        let Some(talk) = self.talks.get_mut(label) else {
            return Close::NotOpen;
        };
        match std::mem::replace(&mut talk.state, State::Closing) {
            State::Open(server) => Close::Stop {
                server,
                directory: talk.directory.clone(),
            },
            State::Closing => Close::StillClosing,
            State::Starting => {
                talk.state = State::Starting;
                Close::NotOpen
            }
        }
    }

    /// Window `label`'s server has stopped: its directory may be opened again.
    pub fn closed(&mut self, label: &str) {
        self.talks.remove(label);
    }

    /// Whether window `label`'s talk is closing: its server is still being
    /// stopped, though its window may be gone.
    #[must_use]
    pub fn is_closing(&self, label: &str) -> bool {
        self.talks
            .get(label)
            .is_some_and(|talk| matches!(talk.state, State::Closing))
    }

    /// Begin closing every open talk, answering each window's label, its
    /// directory and its server.
    pub fn take_all(&mut self) -> Vec<(String, PathBuf, S)> {
        let mut taken = Vec::new();
        for (label, talk) in &mut self.talks {
            if matches!(talk.state, State::Open(_))
                && let State::Open(server) = std::mem::replace(&mut talk.state, State::Closing)
            {
                taken.push((label.clone(), talk.directory.clone(), server));
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
        }
    }

    /// A registry with `directory` open in a window, served by `server`.
    fn open(directory: &str, server: &'static str) -> (Registry<&'static str>, String) {
        let mut registry = Registry::default();
        let label = label_of(registry.reserve(Path::new(directory)));
        assert_eq!(
            registry.opened(&label, server),
            Ok(()),
            "a reserved talk should take its server"
        );
        (registry, label)
    }

    mod given_a_directory_already_open {
        use super::*;

        #[test]
        fn opening_it_again_answers_its_window_instead_of_a_new_one() {
            let (mut registry, label) = open("/talks/rust", "first");
            assert_eq!(
                registry.reserve(Path::new("/talks/rust")),
                Reserved::Existing(label),
                "a directory already open should be focused, not served twice"
            );
        }

        #[test]
        fn another_directory_opens_in_a_window_of_its_own() {
            let (mut registry, label) = open("/talks/rust", "first");
            let other = registry.reserve(Path::new("/talks/go"));
            assert!(
                matches!(&other, Reserved::New(new) if *new != label),
                "a different directory should get a new window, got {other:?}"
            );
        }

        #[test]
        fn a_directory_still_starting_is_not_started_twice() {
            let mut registry: Registry<&str> = Registry::default();
            let label = label_of(registry.reserve(Path::new("/talks/rust")));
            assert_eq!(
                registry.reserve(Path::new("/talks/rust")),
                Reserved::Existing(label),
                "a directory whose server is starting should not start another"
            );
        }
    }

    mod given_a_window_closing {
        use super::*;

        #[test]
        fn the_first_request_stops_its_server() {
            let (mut registry, label) = open("/talks/rust", "server");
            assert_eq!(
                registry.begin_close(&label),
                Close::Stop {
                    server: "server",
                    directory: PathBuf::from("/talks/rust")
                },
                "closing an open talk should stop its server"
            );
        }

        #[test]
        fn a_repeated_request_keeps_the_window_while_the_server_writes() {
            let (mut registry, label) = open("/talks/rust", "server");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.begin_close(&label),
                Close::StillClosing,
                "a second close request should still be held"
            );
        }

        #[test]
        fn its_directory_is_not_opened_again_until_the_server_has_stopped() {
            let (mut registry, label) = open("/talks/rust", "server");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.reserve(Path::new("/talks/rust")),
                Reserved::Existing(label.clone()),
                "a directory still being written should not be read by a new server"
            );
            registry.closed(&label);
            assert!(
                matches!(registry.reserve(Path::new("/talks/rust")), Reserved::New(_)),
                "a closed directory should open again"
            );
        }

        #[test]
        fn a_closing_talk_is_not_stopped_again_on_quit() {
            let (mut registry, label) = open("/talks/rust", "server");
            let _ = registry.begin_close(&label);
            assert!(
                registry.take_all().is_empty(),
                "quitting should not take a server a close already took"
            );
        }

        #[test]
        fn it_is_closing_until_its_server_has_stopped_and_no_open_talk_is() {
            let (mut registry, label) = open("/talks/rust", "server");
            assert!(!registry.is_closing(&label), "an open talk is not closing");
            let _ = registry.begin_close(&label);
            assert!(registry.is_closing(&label), "its server is being stopped");
            registry.closed(&label);
            assert!(!registry.is_closing(&label), "a closed talk is gone");
        }

        #[test]
        fn a_window_that_is_no_talk_closes() {
            let mut registry: Registry<&str> = Registry::default();
            assert_eq!(
                registry.begin_close("home"),
                Close::NotOpen,
                "the home window should close at once"
            );
        }
    }

    mod given_two_talks_open {
        use super::*;

        #[test]
        fn quitting_takes_every_open_server() {
            let (mut registry, _) = open("/talks/rust", "first");
            let second = label_of(registry.reserve(Path::new("/talks/go")));
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
                "quitting should stop every open talk"
            );
        }
    }
}
