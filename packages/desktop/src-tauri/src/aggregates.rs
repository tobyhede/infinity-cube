//! Which Aggregate directories are open, in which window, and how far each
//! has got: starting its server, open, or closing while the server writes
//! its last edit. A closing Aggregate keeps how its close began, whether the
//! presenter gave up waiting for it, and word of when its last write lands,
//! so how a failed write is reported and what a quit waits for are decided
//! here.
//!
//! The registry is generic over what serves an Aggregate, so its transitions are
//! tested without starting a process.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;
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
    Closing(Closing),
}

/// A close under way: its server is writing its last edit.
#[derive(Debug)]
struct Closing {
    by: ClosedBy,
    /// Answered once the last write lands; gone once nothing waits for it.
    written: Option<Receiver<()>>,
    /// The presenter closed without saving.
    abandoned: bool,
}

impl Closing {
    fn by(by: ClosedBy) -> Self {
        Self {
            by,
            written: None,
            abandoned: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClosedBy {
    Window,
    Quit,
}

/// Where a closed Aggregate's failed last write is reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportIn {
    /// A dialog, and standard error: the presenter closed the window and
    /// waited.
    Dialog,
    /// Standard error only: a quit, which waits for the write and never for
    /// a dialog, or a close the presenter gave up waiting for (Storage
    /// ST-122).
    StandardError,
}

/// What an exit the application was not asked about must finish before the
/// process ends ([`Registry::take_for_exit`]).
#[derive(Debug)]
pub struct Exit<S> {
    /// Every Aggregate still open, by directory, whose server is to be
    /// stopped.
    pub open: Vec<(PathBuf, S)>,
    /// Word of the last write of every close under way that the presenter
    /// did not give up on.
    pub writing: Vec<Receiver<()>>,
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
    /// One a quit has already taken to close stays until its stop has ended
    /// ([`Self::closed`]), since that stop is still writing.
    pub fn abandon(&mut self, label: &str) -> Option<S> {
        let aggregate = self.aggregates.get(label)?;
        if matches!(aggregate.state, State::Closing(_)) {
            return None;
        }
        match self.aggregates.remove(label)?.state {
            State::Open(server) => Some(server),
            State::Starting | State::Closing(_) => None,
        }
    }

    /// Begin closing window `label`.
    pub fn begin_close(&mut self, label: &str) -> Close<S> {
        let Some(aggregate) = self.aggregates.get_mut(label) else {
            return Close::NotOpen;
        };
        match std::mem::replace(&mut aggregate.state, State::Starting) {
            State::Open(server) => {
                aggregate.state = State::Closing(Closing::by(ClosedBy::Window));
                Close::Stop {
                    server,
                    directory: aggregate.directory.clone(),
                }
            }
            closing @ State::Closing(_) => {
                aggregate.state = closing;
                Close::StillClosing
            }
            State::Starting => Close::NotOpen,
        }
    }

    /// Window `label`'s stop answers `written` once its last write lands.
    /// A close that has already ended, or was abandoned, keeps nothing; one
    /// whose write landed before this call keeps a signal already answered.
    pub fn stopping(&mut self, label: &str, written: Receiver<()>) {
        if let Some(closing) = self.closing_mut(label)
            && !closing.abandoned
        {
            closing.written = Some(written);
        }
    }

    /// The presenter closed window `label` without saving: nothing waits for
    /// its last write, and a failure of it goes to standard error only.
    pub fn abandon_close(&mut self, label: &str) {
        if let Some(closing) = self.closing_mut(label) {
            closing.abandoned = true;
            closing.written = None;
        }
    }

    /// Window `label`'s last write has landed or failed, answering where a
    /// failure is reported. Its directory stays taken until [`Self::closed`].
    pub fn stopped(&mut self, label: &str) -> ReportIn {
        match self.closing_mut(label) {
            Some(closing) => {
                closing.written = None;
                if closing.by == ClosedBy::Window && !closing.abandoned {
                    ReportIn::Dialog
                } else {
                    ReportIn::StandardError
                }
            }
            None => ReportIn::StandardError,
        }
    }

    fn closing_mut(&mut self, label: &str) -> Option<&mut Closing> {
        match &mut self.aggregates.get_mut(label)?.state {
            State::Closing(closing) => Some(closing),
            State::Starting | State::Open(_) => None,
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
            .is_some_and(|aggregate| matches!(aggregate.state, State::Closing(_)))
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
    /// opens, so nothing opens that the quit does not wait for. A window close
    /// already under way is reported as the quit's are, since a quit waits
    /// for every write and never for a dialog.
    pub fn take_all(&mut self) -> Vec<(String, PathBuf, S)> {
        self.quitting = true;
        let mut taken = Vec::new();
        for (label, aggregate) in &mut self.aggregates {
            if let State::Closing(closing) = &mut aggregate.state {
                closing.by = ClosedBy::Quit;
            }
            if matches!(aggregate.state, State::Open(_))
                && let State::Open(server) = std::mem::replace(
                    &mut aggregate.state,
                    State::Closing(Closing::by(ClosedBy::Quit)),
                )
            {
                taken.push((label.clone(), aggregate.directory.clone(), server));
            }
        }
        taken
    }

    /// Everything an exit the application was not asked about (on macOS,
    /// Quit from the Dock, or logging out) finishes before the process
    /// ends: every open Aggregate's server, taken as [`Self::take_all`]
    /// takes it, and word of every close's last write but an abandoned one.
    pub fn take_for_exit(&mut self) -> Exit<S> {
        let writing = self
            .aggregates
            .values_mut()
            .filter_map(|aggregate| match &mut aggregate.state {
                State::Closing(closing) => closing.written.take(),
                State::Starting | State::Open(_) => None,
            })
            .collect();
        let open = self
            .take_all()
            .into_iter()
            .map(|(_label, directory, server)| (directory, server))
            .collect();
        Exit { open, writing }
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

    mod given_a_close_whose_last_write_ends {
        use super::*;

        #[test]
        fn a_failure_after_a_window_close_is_shown_in_a_dialog() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            assert_eq!(
                registry.stopped(&label),
                ReportIn::Dialog,
                "the presenter who closed the window should hear its last write failed"
            );
        }

        #[test]
        fn a_failure_after_a_quit_goes_to_standard_error() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _taken = registry.take_all();
            assert_eq!(
                registry.stopped(&label),
                ReportIn::StandardError,
                "a quit waits for the write, never for a dialog reporting it"
            );
        }

        #[test]
        fn a_failure_after_close_without_saving_goes_to_standard_error() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            registry.abandon_close(&label);
            assert_eq!(
                registry.stopped(&label),
                ReportIn::StandardError,
                "a write the presenter gave up on is reported on standard error only (ST-122)"
            );
        }

        #[test]
        fn a_failure_of_a_window_close_a_quit_overtook_goes_to_standard_error() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            let _taken = registry.take_all();
            assert_eq!(
                registry.stopped(&label),
                ReportIn::StandardError,
                "once a quit has begun, it waits for every write and never for a dialog"
            );
        }

        #[test]
        fn its_directory_stays_refused_until_the_report_is_done() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            let _report = registry.stopped(&label);
            assert_eq!(
                registry.reserve(Path::new("/spaces/rust")),
                Reserved::Existing(label.clone()),
                "the directory opens again only once its close has ended"
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
    }

    mod given_a_dock_quit {
        use super::*;
        use std::sync::mpsc::channel;

        #[test]
        fn it_takes_every_open_server_and_waits_for_every_close_under_way() {
            let (mut registry, closing) = open("/spaces/rust", "first");
            let second = label_of(registry.reserve(Path::new("/spaces/go")));
            registry.opened(&second, "second").unwrap();
            let _ = registry.begin_close(&closing);
            let (landed, written) = channel();
            registry.stopping(&closing, written);

            let exit = registry.take_for_exit();

            let open: Vec<_> = exit.open.iter().map(|(_, server)| *server).collect();
            assert_eq!(
                open,
                vec!["second"],
                "the open Aggregate is stopped by the exit"
            );
            assert_eq!(
                exit.writing.len(),
                1,
                "the closing one's write is waited for"
            );
            landed.send(()).unwrap();
            assert_eq!(
                exit.writing[0].try_recv(),
                Ok(()),
                "the signal waited for is the one its stop sends on"
            );
            assert_eq!(
                registry.reserve(Path::new("/spaces/zig")),
                Reserved::Quitting,
                "nothing opens once the exit has collected what it waits for"
            );
        }

        #[test]
        fn it_does_not_wait_for_a_close_without_saving() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            let (_landed, written) = channel();
            registry.stopping(&label, written);
            registry.abandon_close(&label);

            assert!(
                registry.take_for_exit().writing.is_empty(),
                "the presenter gave up on that write, so the exit does not wait for it"
            );
        }

        #[test]
        fn a_stop_that_ended_before_its_signal_was_kept_is_not_waited_for() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _ = registry.begin_close(&label);
            let _report = registry.stopped(&label);
            registry.closed(&label);
            let (_landed, written) = channel();
            registry.stopping(&label, written);

            assert!(
                registry.take_for_exit().writing.is_empty(),
                "a close already over has nothing left to wait for"
            );
        }
    }

    mod given_a_quit_that_took_an_aggregate_whose_window_then_failed {
        use super::*;
        use std::sync::mpsc::channel;

        #[test]
        fn abandoning_it_keeps_the_close_its_stop_is_writing() {
            let (mut registry, label) = open("/spaces/rust", "server");
            let _taken = registry.take_all();
            let (_landed, written) = channel();
            registry.stopping(&label, written);

            assert_eq!(
                registry.abandon(&label),
                None,
                "the quit already took its server"
            );
            assert_eq!(
                registry.take_for_exit().writing.len(),
                1,
                "an exit still waits for the write its stop is making"
            );
            assert!(
                registry.is_closing(&label),
                "its directory stays taken until the stop has ended"
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
