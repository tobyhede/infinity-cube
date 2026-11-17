//! Which Aggregate directories are open, in which window, and how far each
//! has got: starting its sidecar, open, or closing while the sidecar writes
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
    /// The window's talk is open: stop `sidecar`, which serves `directory`,
    /// and keep the window until it has stopped.
    Stop { sidecar: S, directory: PathBuf },
    /// The window's sidecar is already being stopped: keep the window.
    StillClosing,
    /// The window holds no open talk: let it close.
    NotOpen,
}

/// An open talk whose sidecar ended without being asked to.
#[derive(Debug, PartialEq, Eq)]
pub struct Ended<E> {
    pub label: String,
    pub directory: PathBuf,
    pub how: E,
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

    /// The reserved talk `label` is served by `sidecar`.
    ///
    /// # Errors
    ///
    /// Hands `sidecar` back if `label` is not a talk still starting.
    pub fn opened(&mut self, label: &str, sidecar: S) -> Result<(), S> {
        match self.talks.get_mut(label) {
            Some(talk) if matches!(talk.state, State::Starting) => {
                talk.state = State::Open(sidecar);
                Ok(())
            }
            _ => Err(sidecar),
        }
    }

    /// Forget talk `label`, which did not open, answering its sidecar if it had one.
    pub fn abandon(&mut self, label: &str) -> Option<S> {
        match self.talks.remove(label)?.state {
            State::Open(sidecar) => Some(sidecar),
            State::Starting | State::Closing => None,
        }
    }

    /// Begin closing window `label`.
    pub fn begin_close(&mut self, label: &str) -> Close<S> {
        let Some(talk) = self.talks.get_mut(label) else {
            return Close::NotOpen;
        };
        match std::mem::replace(&mut talk.state, State::Closing) {
            State::Open(sidecar) => Close::Stop {
                sidecar,
                directory: talk.directory.clone(),
            },
            State::Closing => Close::StillClosing,
            State::Starting => {
                talk.state = State::Starting;
                Close::NotOpen
            }
        }
    }

    /// Window `label`'s sidecar has stopped: its directory may be opened again.
    pub fn closed(&mut self, label: &str) {
        self.talks.remove(label);
    }

    /// Begin closing every open talk, answering each sidecar and its directory.
    pub fn take_all(&mut self) -> Vec<(PathBuf, S)> {
        let mut taken = Vec::new();
        for talk in self.talks.values_mut() {
            if matches!(talk.state, State::Open(_))
                && let State::Open(sidecar) = std::mem::replace(&mut talk.state, State::Closing)
            {
                taken.push((talk.directory.clone(), sidecar));
            }
        }
        taken
    }

    /// Forget every open talk whose sidecar `ended` says has ended, answering
    /// each with how.
    pub fn ended<E>(&mut self, mut ended: impl FnMut(&mut S) -> Option<E>) -> Vec<Ended<E>> {
        let mut found = Vec::new();
        for (label, talk) in &mut self.talks {
            if let State::Open(sidecar) = &mut talk.state
                && let Some(how) = ended(sidecar)
            {
                found.push(Ended {
                    label: label.clone(),
                    directory: talk.directory.clone(),
                    how,
                });
            }
        }
        for ended in &found {
            self.talks.remove(&ended.label);
        }
        found
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

    /// A registry with `directory` open in a window, served by `sidecar`.
    fn open(directory: &str, sidecar: &'static str) -> (Registry<&'static str>, String) {
        let mut registry = Registry::default();
        let label = label_of(registry.reserve(Path::new(directory)));
        assert_eq!(
            registry.opened(&label, sidecar),
            Ok(()),
            "a reserved talk should take its sidecar"
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
                "a directory whose sidecar is starting should not start another"
            );
        }
    }

    mod given_a_window_closing {
        use super::*;

        #[test]
        fn the_first_request_stops_its_sidecar() {
            let (mut registry, label) = open("/talks/rust", "sidecar");
            assert_eq!(
                registry.begin_close(&label),
                Close::Stop {
                    sidecar: "sidecar",
                    directory: PathBuf::from("/talks/rust")
                },
                "closing an open talk should stop its sidecar"
            );
        }

        #[test]
        fn a_repeated_request_keeps_the_window_while_the_sidecar_writes() {
            let (mut registry, label) = open("/talks/rust", "sidecar");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.begin_close(&label),
                Close::StillClosing,
                "a second close request should still be held"
            );
        }

        #[test]
        fn its_directory_is_not_opened_again_until_the_sidecar_has_stopped() {
            let (mut registry, label) = open("/talks/rust", "sidecar");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.reserve(Path::new("/talks/rust")),
                Reserved::Existing(label.clone()),
                "a directory still being written should not be read by a new sidecar"
            );
            registry.closed(&label);
            assert!(
                matches!(registry.reserve(Path::new("/talks/rust")), Reserved::New(_)),
                "a closed directory should open again"
            );
        }

        #[test]
        fn a_closing_talk_is_not_stopped_again_on_quit() {
            let (mut registry, label) = open("/talks/rust", "sidecar");
            let _ = registry.begin_close(&label);
            assert!(
                registry.take_all().is_empty(),
                "quitting should not take a sidecar a close already took"
            );
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

    mod given_a_sidecar_that_ends_by_itself {
        use super::*;

        #[test]
        fn its_talk_is_answered_and_forgotten() {
            let (mut registry, label) = open("/talks/rust", "sidecar");
            let ended = registry.ended(|_| Some(3));
            assert_eq!(
                ended,
                vec![Ended {
                    label: label.clone(),
                    directory: PathBuf::from("/talks/rust"),
                    how: 3
                }],
                "an ended sidecar should be reported with its directory"
            );
            assert_eq!(
                registry.begin_close(&label),
                Close::NotOpen,
                "an ended talk should leave nothing to stop"
            );
        }

        #[test]
        fn a_running_sidecar_is_left_open() {
            let (mut registry, label) = open("/talks/rust", "sidecar");
            assert!(
                registry.ended(|_| None::<i32>).is_empty(),
                "a running sidecar should not be reported"
            );
            assert!(
                matches!(registry.begin_close(&label), Close::Stop { .. }),
                "a running talk should still be open"
            );
        }
    }

    #[test]
    fn quitting_takes_every_open_sidecar() {
        let (mut registry, _) = open("/talks/rust", "first");
        let second = label_of(registry.reserve(Path::new("/talks/go")));
        assert_eq!(
            registry.opened(&second, "second"),
            Ok(()),
            "a second directory should open beside the first"
        );
        let mut taken: Vec<_> = registry.take_all().into_iter().map(|(_, s)| s).collect();
        taken.sort_unstable();
        assert_eq!(
            taken,
            vec!["first", "second"],
            "quitting should stop every open talk"
        );
    }
}
