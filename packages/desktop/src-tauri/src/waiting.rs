//! Waiting for a closing Aggregate's last write, and asking the presenter
//! whether to keep waiting once it has taken too long (Storage ST-122).
//!
//! [`Waiting`] is the decision, with no window, thread or clock: it is told
//! what happened ([`Event`]) and answers what to do ([`Effect`]). [`drive`]
//! runs it on a clock, turning [`Effect::StartTimer`] into an
//! [`Event::Elapsed`] [`ASK_AFTER`] later, and hands every other effect to
//! the shell.
//!
//! A window's close is a wait of its own, with a question of its own. A
//! quit is one wait over every Aggregate still writing, with one question: the
//! waits of windows already closing join it, and their questions go.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

/// How long a last write may take before the presenter is asked, counted
/// from the close, and again from each answer to keep waiting.
pub const ASK_AFTER: Duration = Duration::from_secs(10);

/// One wait, and the question it may show.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct WaitId(u64);

impl WaitId {
    /// The number the shell names the wait's question window by.
    #[must_use]
    pub fn number(self) -> u64 {
        self.0
    }

    /// The wait the shell named `number`.
    #[must_use]
    pub fn from_number(number: u64) -> Self {
        Self(number)
    }
}

/// What the presenter answered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Choice {
    /// Dismiss the question, and ask again after [`ASK_AFTER`].
    KeepWaiting,
    /// Stop waiting: close without the Edits not yet written.
    CloseWithoutSaving,
}

/// What happened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event<T> {
    /// An Aggregate's window was asked to close, and its last write began.
    CloseRequested { aggregate: T, folder: PathBuf },
    /// The application was asked to quit, and the last write of each Aggregate
    /// in `writing`, open until now, began.
    QuitRequested { writing: Vec<(T, PathBuf)> },
    /// An Aggregate's last write ended, written or failed.
    WriteFinished(T),
    /// [`ASK_AFTER`] passed since the wait's [`Effect::StartTimer`].
    Elapsed(WaitId),
    /// The presenter answered the wait's question.
    Chose(WaitId, Choice),
}

/// What to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Effect<T> {
    /// Answer [`Event::Elapsed`] for the wait after [`ASK_AFTER`].
    StartTimer(WaitId),
    /// Show the wait's question naming `folders`, each still writing, or
    /// show it again naming them where it is already showing.
    Ask { wait: WaitId, folders: Vec<PathBuf> },
    /// Take the wait's question away, if it is showing.
    Dismiss(WaitId),
    /// The Aggregate's last write ended: close its window.
    Close(T),
    /// Close each Aggregate's window without waiting for its last write, which
    /// is left to end on its own.
    Abandon(Vec<(T, PathBuf)>),
    /// Every Aggregate the quit waited for is written or abandoned: end the
    /// application.
    Exit,
}

#[derive(Debug)]
struct Wait<T> {
    writing: BTreeMap<T, PathBuf>,
    asking: bool,
}

impl<T> Wait<T> {
    fn folders(&self) -> Vec<PathBuf> {
        self.writing.values().cloned().collect()
    }
}

/// Every wait under way.
#[derive(Debug)]
pub struct Waiting<T> {
    waits: BTreeMap<WaitId, Wait<T>>,
    quit: Option<WaitId>,
    next: u64,
}

impl<T> Default for Waiting<T> {
    fn default() -> Self {
        Self {
            waits: BTreeMap::new(),
            quit: None,
            next: 0,
        }
    }
}

impl<T: Ord + Clone> Waiting<T> {
    fn mint(&mut self) -> WaitId {
        let id = WaitId(self.next);
        self.next += 1;
        id
    }

    fn holding(&self, aggregate: &T) -> Option<WaitId> {
        self.waits
            .iter()
            .find(|(_, wait)| wait.writing.contains_key(aggregate))
            .map(|(id, _)| *id)
    }

    /// Decide what `event` calls for.
    pub fn on(&mut self, event: Event<T>) -> Vec<Effect<T>> {
        match event {
            Event::CloseRequested { aggregate, folder } => self.close_requested(aggregate, folder),
            Event::QuitRequested { writing } => self.quit_requested(writing),
            Event::WriteFinished(aggregate) => self.write_finished(&aggregate),
            Event::Elapsed(id) => self.elapsed(id),
            Event::Chose(id, choice) => self.chose(id, choice),
        }
    }

    fn close_requested(&mut self, aggregate: T, folder: PathBuf) -> Vec<Effect<T>> {
        if self.holding(&aggregate).is_some() {
            return Vec::new();
        }
        if let Some(quit) = self.quit.and_then(|id| self.waits.get_mut(&id)) {
            let _joined = quit.writing.insert(aggregate, folder);
            return Vec::new();
        }
        let id = self.mint();
        let _new = self.waits.insert(
            id,
            Wait {
                writing: BTreeMap::from([(aggregate, folder)]),
                asking: false,
            },
        );
        vec![Effect::StartTimer(id)]
    }

    fn quit_requested(&mut self, writing: Vec<(T, PathBuf)>) -> Vec<Effect<T>> {
        let mut effects = Vec::new();
        let id = match self.quit {
            Some(id) => id,
            None => {
                let id = self.mint();
                let mut joined = BTreeMap::new();
                for (other, wait) in std::mem::take(&mut self.waits) {
                    if wait.asking {
                        effects.push(Effect::Dismiss(other));
                    }
                    joined.extend(wait.writing);
                }
                let _new = self.waits.insert(
                    id,
                    Wait {
                        writing: joined,
                        asking: false,
                    },
                );
                self.quit = Some(id);
                effects.push(Effect::StartTimer(id));
                id
            }
        };
        if let Some(quit) = self.waits.get_mut(&id) {
            quit.writing.extend(writing);
            if quit.writing.is_empty() {
                let _done = self.waits.remove(&id);
                effects.retain(|effect| *effect != Effect::StartTimer(id));
                effects.push(Effect::Exit);
            }
        }
        effects
    }

    fn write_finished(&mut self, aggregate: &T) -> Vec<Effect<T>> {
        let Some(id) = self.holding(aggregate) else {
            // Abandoned, or never waited for.
            return Vec::new();
        };
        let is_quit = self.quit == Some(id);
        let mut effects = Vec::new();
        if !is_quit {
            effects.push(Effect::Close(aggregate.clone()));
        }
        let Some(wait) = self.waits.get_mut(&id) else {
            return effects;
        };
        let _written = wait.writing.remove(aggregate);
        if wait.writing.is_empty() {
            if wait.asking {
                effects.push(Effect::Dismiss(id));
            }
            let _done = self.waits.remove(&id);
            if is_quit {
                effects.push(Effect::Exit);
            }
        } else if wait.asking {
            effects.push(Effect::Ask {
                wait: id,
                folders: wait.folders(),
            });
        }
        effects
    }

    fn elapsed(&mut self, id: WaitId) -> Vec<Effect<T>> {
        match self.waits.get_mut(&id) {
            Some(wait) if !wait.asking => {
                wait.asking = true;
                vec![Effect::Ask {
                    wait: id,
                    folders: wait.folders(),
                }]
            }
            _ => Vec::new(),
        }
    }

    fn chose(&mut self, id: WaitId, choice: Choice) -> Vec<Effect<T>> {
        let Some(wait) = self.waits.get_mut(&id) else {
            return Vec::new();
        };
        if !wait.asking {
            return Vec::new();
        }
        match choice {
            Choice::KeepWaiting => {
                wait.asking = false;
                vec![Effect::Dismiss(id), Effect::StartTimer(id)]
            }
            Choice::CloseWithoutSaving => {
                let Some(wait) = self.waits.remove(&id) else {
                    return Vec::new();
                };
                if self.quit == Some(id) {
                    vec![Effect::Dismiss(id), Effect::Exit]
                } else {
                    vec![
                        Effect::Dismiss(id),
                        Effect::Abandon(wait.writing.into_iter().collect()),
                    ]
                }
            }
        }
    }
}

/// Run [`Waiting`] on the clock: each event `events` receives is decided,
/// a timer is started for each [`Effect::StartTimer`], answering
/// [`Event::Elapsed`] through `timers` (a sender into `events`), and every
/// other effect goes to `apply`. Ends when every sender of `events` has
/// gone; `timers` is one, so it ends with the runtime.
pub async fn drive<T, A>(
    mut events: UnboundedReceiver<Event<T>>,
    timers: UnboundedSender<Event<T>>,
    mut apply: A,
) where
    T: Ord + Clone + Send + 'static,
    A: FnMut(Effect<T>),
{
    let mut waiting = Waiting::default();
    while let Some(event) = events.recv().await {
        for effect in waiting.on(event) {
            if let Effect::StartTimer(id) = effect {
                let timers = timers.clone();
                drop(tokio::spawn(async move {
                    tokio::time::sleep(ASK_AFTER).await;
                    let _sent = timers.send(Event::Elapsed(id));
                }));
            } else {
                apply(effect);
            }
        }
    }
}

#[cfg(test)]
mod tests;
