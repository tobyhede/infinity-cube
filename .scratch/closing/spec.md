# One Closing module between the shell's events and the close-wait decision

Candidate 3 of the desktop shell's architecture review (26 November 2026). The design was settled in the project thread on 28 November 2026.

## The problem

What a close, a quit and a Dock Quit do is spread across `main.rs`, where no test reaches it: `on_window_event` begins a window's close, `RunEvent::ExitRequested` begins a quit and decides whether the application may end, `RunEvent::Exit` stops servers on threads of its own for a Dock Quit, `spawn_stop` reports a failed write and frees the folder, `apply` carries out the close-wait decision's effects, and `waiting::drive` runs that decision on a channel. `waiting.rs` and `aggregates.rs` are tested; the wiring between them, and between them and Tauri, is not. ST-122 says so.

## What was settled

- **A `closing` module owns the handling.** `closing.rs` handles a window's close request, a quit request, the application's exit, the question's answer, a timer that elapsed, and a stop that ended. It reaches the `Registry` and `Waiting` directly. `Waiting`'s interface is unchanged. `main.rs` forwards Tauri's events to it and does what it answers.
- **What the shell does crosses a `ClosingPort`.** Stopping a server, saying a failed write on standard error, showing it in a dialog, starting a timer, asking or dismissing the question, closing a window, closing an Aggregate's window with the windows its page opened, and ending the application. Its Tauri adapter is `closing/tauri_shell.rs`; its tests drive a recording fake. A stop begun through the port ends when the adapter calls back, so the fake holds stops and the tests end them in the order they choose.
- **The decision runs where the event arrives.** `Waiting` sits behind a lock, and its effects go to the port while that lock is held, so they reach the shell in the order they were decided. Every port method called under the lock returns at once and never calls back into the module: the Tauri adapter hands window work to one task that does it in order, off the event loop's thread, as `drive`'s task did. Showing a failed write in a dialog waits for the presenter, so it is never called under the lock. The lock order is `Waiting`, then the `Registry`; nothing takes `Waiting` while holding the `Registry`. `waiting::drive` goes; `waiting::ask_after` is the ten seconds a timer waits, tested on tokio's paused clock.
- **One stop path.** A window's close, a quit and a Dock Quit begin each stop the same way: the write signal is stored in the Registry, then the port stops the server. When the stop ends, in this order: a failure is said on standard error; the write signal is sent; the Registry decides (`stopped`) whether a dialog also shows, and if it does, it shows; the folder is freed; `Waiting` is told. Saying every failure on standard error before the signal means a Dock Quit, which ends the process once every signal has come, never ends it before the failure has been said, whenever it begins. A dialog shows after the signal, since it needs the event loop an exit holds, and a Dock Quit that begins while it shows may end the process with it; the failure is already on standard error. The Registry decides the dialog after the signal, so a Dock Quit begun before then turns it to standard error alone, as a quit does. Today `spawn_stop` signals before the Registry decides and says the failure only after, so a Dock Quit can end the process before a failure is said anywhere; this closes that gap.
- **A Dock Quit stops through the one path and then waits.** It takes every open Aggregate (`take_all`), as a quit does, and begins each one's stop, which stores its write signal. Only then does it take the write signal of every close not abandoned (`take_writing`, in place of `take_for_exit`), so it waits for the stops it has just begun as well as those already under way. It returns once each has been sent. The threads `RunEvent::Exit` started of its own go.
- **A Dock Quit tells `Waiting` nothing.** Once a Dock Quit begins, the module marks itself ended: a stop that ends still says a failure, sends its signal and frees its folder, but `Waiting` is told nothing more and the port is given no window work, no timer and no exit, since the process is ending and `RunEvent::Exit` holds the event loop. A Dock Quit begun after `Waiting` ended the application does nothing.
- **The module decides whether the application may end.** `exit_requested(code, last_window) -> Exit::{Allow, Prevent}`: allowed once `Waiting` has ended the application; prevented, beginning nothing, for the last window closing on a platform that runs on (macOS, ST-131); otherwise prevented while a quit begins. `main.rs` obeys.
- **Tests drive the wiring.** `closing/tests.rs` drives the module with the real `Registry` and `Waiting` and the fake, end to end:
  - a window holding no open Aggregate closing at once, and a second close of one closing beginning nothing;
  - a close ending in time, closing its window and freeing its folder, with its timer elapsing afterwards asking nothing;
  - a close asking, then Keep waiting asking again later, and the write ending while asking taking the question away;
  - Close without saving closing the window and its views, its failure said on standard error alone;
  - a failure after a window close said on standard error and then in a dialog, before the folder is freed;
  - a quit with nothing open ending at once, a quit ending once every write has ended, and a window close it overtook reporting on standard error alone;
  - a close, then a quit, then Close without saving ending the application;
  - the last window closing on macOS beginning nothing, and elsewhere being a quit;
  - a Dock Quit waiting for every write, including those of stops it began, but not an abandoned one, saying each failure on standard error before it returns, and giving the port no window work.

## Out of scope

The question window's page (`ui/closing.html`), `Waiting`'s internals, `question.rs` beyond the Tauri adapter calling it, and opening a folder.
