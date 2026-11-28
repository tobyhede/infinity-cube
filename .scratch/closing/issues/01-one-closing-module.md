# 01 — One Closing module between the shell's events and the close-wait decision

**Status:** ready-for-agent

**Blocked by:** PR #560, which keeps a stop's write signal in the Registry before the stop begins; the one stop path relies on it.

**What to build:** the [spec](../spec.md)'s `closing` module, its port with a Tauri adapter and a recording fake, and `main.rs` forwarding to it. Behaviour changes only for a Dock Quit, and for when a failed write is said:

- Every failed write is said on standard error before its write signal is sent, so a Dock Quit never ends the process before saying it.
- A Dock Quit's stops free their folders, as every other stop's do; they tell `Waiting` nothing and give the port no window work.

- [ ] `closing.rs` handles a window's close request, a quit request, the application's exit, the question's answer, an elapsed timer and an ended stop, over the `Registry` and `Waiting`.
- [ ] A failed write is said on standard error before its signal is sent, and the Registry decides whether a dialog also shows after it.
- [ ] A Dock Quit takes `take_writing` only after every stop it began from `take_all` has stored its signal.
- [ ] Once a Dock Quit begins, the module tells `Waiting` nothing and gives the port no window work.
- [ ] `ClosingPort` has a Tauri adapter in `closing/tauri_shell.rs` and a recording fake in `closing/tests.rs`.
- [ ] `closing/tests.rs` covers every case the [spec](../spec.md)'s "Tests drive the wiring" lists.
- [ ] `Registry::take_for_exit` gives way to `take_writing`, since a Dock Quit now takes the open Aggregates with `take_all` and stops them through the one path; the `given_a_dock_quit` tests follow.
- [ ] The four optional nits from #560's review land here: `stopping`'s doc says its "keeps nothing" rule relies on the caller storing the signal before the stop begins; the two Registry-robustness tests are renamed to say what they check and leave `given_a_dock_quit`; and the stop's ordering is pinned through `begin_stop`.
- [ ] `waiting::drive` is gone; `waiting::ask_after` is tested on the paused clock.
- [ ] `main.rs` holds no `Closings` channel, no `apply`, no `spawn_stop`, and no stop threads of `RunEvent::Exit`'s own.
- [ ] Storage ST-122, AGENTS.md's desktop entry and the desktop skill cite the module and its tests.
- [ ] `cargo test -p infinity-cube-desktop`, clippy with `-D warnings` and `cargo fmt --check` are clean.

## Comments
