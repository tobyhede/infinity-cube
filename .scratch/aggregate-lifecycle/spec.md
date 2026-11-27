# One record per Aggregate's lifecycle in the desktop application

Candidate 2 of the desktop shell's architecture review (26 November 2026). The design was settled in the project thread on 27 November 2026.

## The problem

A closing Aggregate's state lived in five places: the tested `aggregates::Registry`, two untested maps in `main.rs` (`Aggregates.stopping`, the channel each stop sends on once its last write lands, and `Aggregates.abandoned`, the closes the presenter gave up waiting for), `AggregateServer`'s `closing` flag, and `scheme::OpenAggregates`. So the rule for when a failed last write gets a dialog, and which stops a Dock Quit waits for, lived only in `spawn_stop` and `RunEvent::Exit`, where no test reaches.

## What was settled

- **The write signal lives in the Registry.** `Registry`'s `Closing` state holds the receiver its stop sends on once the last write lands, whether the presenter abandoned it, and how the close began. Every type is std's, so the transitions are tested without a window. Rejected: a `Condvar` beside the registry's lock (a new concurrency mechanism) and keeping the channels outside (one side map left).
- **The Registry decides how a failed write is reported.** `Closing` records whether a window close or a quit began it. `stopped(label) -> ReportIn` answers `Dialog` only for a window close nobody abandoned, `StandardError` otherwise. `spawn_stop` loses its `dialog` flag.
- **A quit overtakes a window close's report.** A window close already under way when a quit begins reports a failed write on standard error, as the quit's own closes do, matching Storage ST-121: a quit waits for every write and never for a dialog. Before, it kept its dialog; found in review.
- **A quit's close survives a failed window.** If a quit takes an Aggregate that has just started and its window then fails to open, `abandon` leaves the close in place until its stop ends, so the folder stays taken and a Dock Quit still waits for its write. Before, the folder was freed while the stop wrote; found in review.
- **The folder is freed after the report, as before.** Two transitions: `stopped(label)` (the write has landed) and `closed(label)` (the folder can be opened again). Reopening is refused while a failure dialog shows.
- **Close without saving is a transition.** `abandon_close(label)` marks the close abandoned and drops its write signal, so nothing waits for it.
- **The Dock Quit's exit takes one call.** `take_for_exit()` answers every open Aggregate's server, as `take_all` does, and the write signal of every close not abandoned, replacing `take_all` then `take_stopping`. Its threads, and the second stop path they are, stay for candidate 3.
- **View-window labels are built and read in `scheme.rs`.** `OpenAggregates` forgets an Aggregate's view windows when its stop begins (`server::close_aggregate`), so Close without saving cannot ask it for them. `scheme::is_view_of(label, key)` answers whether a label is one of that Aggregate's view windows, beside `open_view`, which builds them; `main.rs` no longer rebuilds the prefix.

## Left as is

- `AggregateServer`'s `closing` flag, which silences save notices once a stop begins. The notify callback reads it on the run's thread; reading the Registry there would take its lock from a callback.
- `OpenAggregates` stays the separate map the scheme handler reads (ADR 0155, Storage ST-121).

## Out of scope

Candidate 3: one Closing module between Tauri's window and run events and the close-wait decision, one stop path for a close, a quit and a Dock Quit, and `apply`'s effects.
