//! The binary's two streams. Standard output carries only the announcement
//! the HTTP conformance suite reads (`conformance/http/README.md`) and what
//! `check` answers; everything else is standard error.
//!
//! A closed terminal or reader makes a write fail, and Rust ignores SIGPIPE,
//! so a write here never panics: what the binary prints is a courtesy, and
//! the directory is the record.

use std::io;

use serde_json::json;

fn line(mut stream: impl io::Write, text: &str) {
    let _ignored = writeln!(stream, "{text}").and_then(|()| stream.flush());
}

/// A line on standard error.
pub(crate) fn say(text: &str) {
    line(io::stderr().lock(), text);
}

/// A line on standard output.
pub(crate) fn answer(text: &str) {
    line(io::stdout().lock(), text);
}

/// `{"kind":"listening","port":…}`, once the run can be reached.
pub(crate) fn announce_listening(port: u16) {
    answer(&json!({ "kind": "listening", "port": port }).to_string());
}

/// `{"kind":"refused","message":…}`, before the binary exits non-zero.
pub(crate) fn announce_refused(message: &str) {
    answer(&json!({ "kind": "refused", "message": message }).to_string());
}
