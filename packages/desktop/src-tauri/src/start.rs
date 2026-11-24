//! The Start window (ADR 0171), as far as the spike in
//! `.scratch/start-window/issues/05-serve-the-start-windows-react-page.md`
//! takes it: a window under its own label, drawn by the page
//! `packages/app` builds as `start.html` into the shell's `frontendDist`,
//! whose capability (`capabilities/start.json`) lets it invoke one command.
//! It opens at launch only in a debug build with [`SPIKE_VARIABLE`] set to
//! `1`, so no launch a person makes changes; ticket 02 replaces it.

use std::ffi::OsStr;
use std::path::PathBuf;

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// The Start window's label, the one its capability names.
pub const START_WINDOW_LABEL: &str = "start";

/// The Start window's page in `frontendDist`.
pub const START_PAGE: &str = "start.html";

/// The variable that opens the Start window at launch in a debug build.
pub const SPIKE_VARIABLE: &str = "INFINITY_CUBE_START_WINDOW_SPIKE";

/// Whether the Start window opens at launch, given [`SPIKE_VARIABLE`]'s
/// value: only in a debug build, and only when it is `1`.
#[must_use]
pub fn opens_at_launch(value: Option<&OsStr>) -> bool {
    cfg!(debug_assertions) && value == Some(OsStr::new("1"))
}

/// The Start window's one command: it answers, so the page can show the
/// shell heard it.
#[tauri::command]
pub fn start_window_ping() -> &'static str {
    "pong"
}

/// Open the Start window.
///
/// # Errors
///
/// When the window cannot be built.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    let _window = WebviewWindowBuilder::new(
        app,
        START_WINDOW_LABEL,
        WebviewUrl::App(PathBuf::from(START_PAGE)),
    )
    .title("InfinityCube")
    .inner_size(640.0, 420.0)
    .center()
    .focused(true)
    .build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_the_spike_variable {
        use super::*;

        #[test]
        fn opens_the_start_window_only_when_it_is_one_in_a_debug_build() {
            assert_eq!(
                opens_at_launch(Some(OsStr::new("1"))),
                cfg!(debug_assertions),
                "1 opens it in a debug build, and never in a release build"
            );
            for other in [None, Some(""), Some("0"), Some("true"), Some(" 1")] {
                assert!(
                    !opens_at_launch(other.map(OsStr::new)),
                    "{other:?} opens nothing"
                );
            }
        }
    }

    mod given_the_capabilities {
        use super::*;
        use crate::aggregates::SPACE_WINDOW_PREFIX;
        use crate::question::QUESTION_WINDOW_PREFIX;
        use crate::scheme::VIEW_WINDOW_PREFIX;

        /// Every capability file: its name, the window labels it names and
        /// the permissions it grants.
        fn capabilities() -> Vec<(String, Vec<String>, Vec<String>)> {
            let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
            let mut found = Vec::new();
            for entry in std::fs::read_dir(directory).unwrap() {
                let path = entry.unwrap().path();
                let text = std::fs::read_to_string(&path).unwrap();
                let capability: serde_json::Value = serde_json::from_str(&text).unwrap();
                let strings = |key: &str| -> Vec<String> {
                    capability[key]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|value| value.as_str().unwrap().to_owned())
                        .collect()
                };
                found.push((
                    path.file_name().unwrap().to_string_lossy().into_owned(),
                    strings("windows"),
                    strings("permissions"),
                ));
            }
            found.sort();
            found
        }

        /// Whether a capability's window pattern names `label`: Tauri reads
        /// `*` as any run of characters, and these patterns hold at most one,
        /// at the end.
        fn names(pattern: &str, label: &str) -> bool {
            match pattern.strip_suffix('*') {
                Some(prefix) => label.starts_with(prefix),
                None => pattern == label,
            }
        }

        #[test]
        fn the_start_window_alone_may_ping_and_nothing_else() {
            assert_eq!(
                capabilities(),
                vec![
                    (
                        "closing.json".to_owned(),
                        vec![format!("{QUESTION_WINDOW_PREFIX}*")],
                        vec!["allow-answer-closing".to_owned()],
                    ),
                    (
                        "start.json".to_owned(),
                        vec![START_WINDOW_LABEL.to_owned()],
                        vec!["allow-start-window-ping".to_owned()],
                    ),
                ],
                "a close's question answers it, and the Start window pings"
            );
        }

        #[test]
        fn no_capability_names_a_space_window_or_a_window_its_page_opened() {
            for (file, windows, _) in capabilities() {
                for pattern in &windows {
                    for label in [
                        format!("{SPACE_WINDOW_PREFIX}0"),
                        format!("{VIEW_WINDOW_PREFIX}0"),
                        format!("{SPACE_WINDOW_PREFIX}{START_WINDOW_LABEL}"),
                    ] {
                        assert!(!names(pattern, &label), "{file}'s {pattern} names {label}");
                    }
                }
            }
        }
    }
}
