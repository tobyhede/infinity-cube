//! The question a close asks when its last write takes too long (Storage
//! ST-122): a small window of the shell's own (`ui/closing.html`) naming
//! each folder still writing, with "Keep waiting" and "Close without
//! saving". A native message dialog cannot be taken away by the program,
//! and the question must go by itself when the write ends, so it is a
//! window the shell can destroy.

use std::path::PathBuf;

use tauri::{AppHandle, Manager as _, WebviewUrl, WebviewWindowBuilder};

use crate::waiting::{Choice, WaitId};

/// The prefix of every question window's label.
pub const QUESTION_WINDOW_PREFIX: &str = "closing-";

/// The label of the window showing `wait`'s question.
#[must_use]
pub fn label_of(wait: WaitId) -> String {
    format!("{QUESTION_WINDOW_PREFIX}{}", wait.number())
}

/// The wait whose question the window `label` shows.
#[must_use]
pub fn wait_of(label: &str) -> Option<WaitId> {
    let number = label.strip_prefix(QUESTION_WINDOW_PREFIX)?;
    if number.is_empty() || !number.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    number.parse().ok().map(WaitId::from_number)
}

/// The answer the question window sent, by the name its page gives it.
#[must_use]
pub fn choice_named(name: &str) -> Option<Choice> {
    match name {
        "keep-waiting" => Some(Choice::KeepWaiting),
        "close-without-saving" => Some(Choice::CloseWithoutSaving),
        _ => None,
    }
}

/// The folders as the question page reads them from its address's
/// fragment: each folder percent-encoded, every byte but an ASCII letter
/// or digit escaped, so the commas between them are unambiguous.
#[must_use]
pub fn fragment(folders: &[PathBuf]) -> String {
    folders
        .iter()
        .map(|folder| {
            let shown = folder.display().to_string();
            let mut encoded = String::with_capacity(shown.len());
            for byte in shown.bytes() {
                if byte.is_ascii_alphanumeric() {
                    encoded.push(char::from(byte));
                } else {
                    encoded.push_str(&format!("%{byte:02X}"));
                }
            }
            encoded
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// Show `wait`'s question naming `folders`, or name them anew where it is
/// showing: a change of fragment, which the page reads without reloading.
#[expect(
    clippy::print_stderr,
    reason = "a question that cannot be asked is reported on standard error"
)]
pub fn ask(app: &AppHandle, wait: WaitId, folders: &[PathBuf]) {
    let label = label_of(wait);
    let fragment = fragment(folders);
    if let Some(window) = app.get_webview_window(&label) {
        if let Ok(mut url) = window.url() {
            url.set_fragment(Some(&fragment));
            let _ = window.navigate(url);
        }
        return;
    }
    let built = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(PathBuf::from(format!("closing.html#{fragment}"))),
    )
    .title("InfinityCube")
    .inner_size(460.0, 260.0)
    .resizable(false)
    .minimizable(false)
    .always_on_top(true)
    .center()
    .focused(true)
    .build();
    if let Err(error) = built {
        eprintln!("Could not ask whether to keep waiting for the last write: {error}");
    }
}

/// Take `wait`'s question away, if it is showing.
pub fn dismiss(app: &AppHandle, wait: WaitId) {
    if let Some(window) = app.get_webview_window(&label_of(wait)) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_a_window_label {
        use super::*;

        #[test]
        fn only_a_question_window_names_its_wait() {
            let wait = WaitId::from_number(7);
            assert_eq!(wait_of(&label_of(wait)), Some(wait), "its own label");
            for other in ["home", "talk-0", "closing-", "closing-7a", "closing--1"] {
                assert_eq!(wait_of(other), None, "{other}");
            }
        }
    }

    mod given_an_answer_name {
        use super::*;

        #[test]
        fn only_the_two_answers_are_read() {
            assert_eq!(
                choice_named("keep-waiting"),
                Some(Choice::KeepWaiting),
                "keep-waiting is an answer"
            );
            assert_eq!(
                choice_named("close-without-saving"),
                Some(Choice::CloseWithoutSaving),
                "close-without-saving is an answer"
            );
            assert_eq!(
                choice_named("Close without saving"),
                None,
                "a label, not a name"
            );
        }
    }

    mod given_folders_in_the_fragment {
        use super::*;

        #[test]
        fn escapes_every_separator_a_folder_may_hold() {
            let folders = [
                PathBuf::from("/talks/a,b c"),
                PathBuf::from("/talks/100%#é"),
            ];
            assert_eq!(
                fragment(&folders),
                "%2Ftalks%2Fa%2Cb%20c,%2Ftalks%2F100%25%23%C3%A9",
                "one comma between folders, none inside one"
            );
        }
    }
}
