//! Why a folder asked for did not open as an Aggregate, and whether the
//! presenter is told.

use std::path::PathBuf;

use crate::server::OpenError;

/// Why a folder did not open as an Aggregate. Its text is what the presenter
/// is shown.
#[derive(Debug, thiserror::Error)]
pub enum NotOpened {
    /// The run refused the directory, in the intake's words.
    #[error("{0}")]
    Refused(String),
    /// The directory's last write is still running after a close without
    /// saving (Storage ST-122).
    #[error(
        "{} is still being written. Open it again once that write has ended.",
        .0.display()
    )]
    StillWriting(PathBuf),
    /// Its server or its window could not be started.
    #[error("Could not open {}: {source}", .directory.display())]
    Failed {
        directory: PathBuf,
        #[source]
        source: OpenError,
    },
    /// A close or a quit took the Aggregate while it was starting.
    #[error("{} was closed while it was opening.", .0.display())]
    Abandoned(PathBuf),
}

impl NotOpened {
    /// Whether the presenter is told: not when their own close or quit took
    /// it, which would show a dialog, or ask for a folder, mid-quit.
    #[must_use]
    pub fn tells_the_presenter(&self) -> bool {
        !matches!(self, Self::Abandoned(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn says_nothing_when_a_close_or_quit_took_it() {
        assert!(!NotOpened::Abandoned(PathBuf::from("/spaces/rust")).tells_the_presenter());
    }

    #[test]
    fn tells_the_presenter_every_other_reason_in_words_naming_the_folder() {
        let folder = PathBuf::from("/spaces/rust");
        let reasons = [
            (
                NotOpened::Refused("/spaces/rust holds no Space".to_owned()),
                "/spaces/rust holds no Space",
            ),
            (
                NotOpened::StillWriting(folder.clone()),
                "/spaces/rust is still being written. Open it again once that write has ended.",
            ),
            (
                NotOpened::Failed {
                    directory: folder,
                    source: OpenError::Url(url::ParseError::EmptyHost),
                },
                "Could not open /spaces/rust: the Space's address is not a URL: empty host",
            ),
        ];
        for (reason, said) in reasons {
            assert!(reason.tells_the_presenter(), "{reason:?}");
            assert_eq!(reason.to_string(), said);
        }
    }
}
