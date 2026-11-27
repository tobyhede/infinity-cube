# 01 — One Closing module between the shell's events and the close-wait decision

**Status:** open

**Blocked by:** PR #560, which keeps a stop's write signal in the Registry before the stop begins; the one stop path relies on it.

**What to build:** the [spec](../spec.md)'s `closing` module, its port with a Tauri adapter and a recording fake, and `main.rs` forwarding to it. No behaviour changes but the order of a Dock Quit's report and its exit.

- [ ] `closing.rs` handles a window's close request, a quit request, the application's exit, the question's answer, an elapsed timer and an ended stop, over the `Registry` and `Waiting`.
- [ ] `ClosingPort` has a Tauri adapter in `closing/tauri_shell.rs` and a recording fake in `closing/tests.rs`.
- [ ] `closing/tests.rs` covers, end to end: a close ending in time; a close asking, then Keep waiting asking again; Close without saving closing the window and its views, its failure on standard error; a failure after a window close in a dialog; a close and then a quit and then Close without saving ending the application; the last window on macOS beginning nothing; a quit with nothing open ending at once; a Dock Quit waiting for every write but an abandoned one.
- [ ] `Registry::take_for_exit` gives way to `take_writing`, since a Dock Quit now takes the open Aggregates with `take_all` and stops them through the one path; the `given_a_dock_quit` tests follow.
- [ ] `waiting::drive` is gone; `waiting::ask_after` is tested on the paused clock.
- [ ] `main.rs` holds no `Closings` channel, no `apply`, no `spawn_stop`, and no stop threads of `RunEvent::Exit`'s own.
- [ ] Storage ST-122, AGENTS.md's desktop entry and the desktop skill cite the module and its tests.
- [ ] `cargo test -p infinity-cube-desktop`, clippy with `-D warnings` and `cargo fmt --check` are clean.

## Comments
