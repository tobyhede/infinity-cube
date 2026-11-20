//! Telling the presenter when an Aggregate's edits stop reaching its folder, and
//! when they reach it again (Storage ST-121).
//!
//! A run tries a failed write again once edits are quiet, so a failure can
//! repeat for as long as its cause lasts. [`SaveStreak`] is the decision,
//! with no window or dialog: it is told how each write ended and answers a
//! [`SaveNotice`] only for the first failure of a streak and for the write
//! that ends one, so the presenter is told once, not on every retry.

use std::fmt::Display;
use std::path::Path;

/// What to tell the presenter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveNotice {
    /// A write failed after the last one landed, for this reason.
    Failing(String),
    /// A write landed after one or more failed.
    Recovered,
}

impl SaveNotice {
    /// The notice in the presenter's words, naming the Aggregate's folder.
    #[must_use]
    pub fn message(&self, directory: &Path) -> String {
        let shown = directory.display();
        match self {
            Self::Failing(reason) => format!(
                "Edits to {shown} are not reaching the folder: {reason}. InfinityCube keeps them and tries again, and says so here once they are saved."
            ),
            Self::Recovered => format!("Edits to {shown} are saved again."),
        }
    }
}

/// Whether the last write failed, and so whether the next one is news.
#[derive(Debug, Default)]
pub struct SaveStreak {
    failing: bool,
}

impl SaveStreak {
    /// A write landed: [`SaveNotice::Recovered`] when it ends a streak of
    /// failures.
    pub fn written(&mut self) -> Option<SaveNotice> {
        std::mem::take(&mut self.failing).then_some(SaveNotice::Recovered)
    }

    /// A write failed: [`SaveNotice::Failing`] when the last one landed.
    pub fn failed(&mut self, reason: impl Display) -> Option<SaveNotice> {
        (!std::mem::replace(&mut self.failing, true))
            .then(|| SaveNotice::Failing(reason.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn says_nothing_while_writes_land() {
        let mut streak = SaveStreak::default();
        assert_eq!(streak.written(), None, "the first write");
        assert_eq!(streak.written(), None, "the next");
    }

    #[test]
    fn tells_of_the_first_failure_of_a_streak_and_not_its_retries() {
        let mut streak = SaveStreak::default();
        assert_eq!(
            streak.failed("disk full"),
            Some(SaveNotice::Failing("disk full".to_owned())),
            "the first failure"
        );
        assert_eq!(streak.failed("disk full"), None, "a retry that fails");
        assert_eq!(streak.failed("other"), None, "for whatever reason");
    }

    #[test]
    fn tells_of_the_write_that_ends_a_streak_once() {
        let mut streak = SaveStreak::default();
        let _first = streak.failed("disk full");
        let _retry = streak.failed("disk full");
        assert_eq!(streak.written(), Some(SaveNotice::Recovered), "recovered");
        assert_eq!(streak.written(), None, "and then nothing");
    }

    #[test]
    fn tells_of_a_new_streak_after_recovering() {
        let mut streak = SaveStreak::default();
        let _first = streak.failed("disk full");
        let _recovered = streak.written();
        assert_eq!(
            streak.failed("read-only"),
            Some(SaveNotice::Failing("read-only".to_owned())),
            "a new streak"
        );
    }

    #[test]
    fn names_the_folder_and_the_reason() {
        let folder = Path::new("/spaces/demo");
        let failing = SaveNotice::Failing("disk full".to_owned()).message(folder);
        assert!(
            failing.contains("/spaces/demo") && failing.contains("disk full"),
            "{failing}"
        );
        assert_eq!(
            SaveNotice::Recovered.message(folder),
            "Edits to /spaces/demo are saved again.",
            "recovered"
        );
    }
}
