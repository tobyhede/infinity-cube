# 01 — Fold a closing Aggregate's state into the Registry

**Status:** resolved

**Blocked by:** none.

**What to build:** the [spec](../spec.md)'s Registry transitions and the view-label rule, and `main.rs` wired to them. No behaviour changes.

- [x] `Registry`'s `Closing` state holds how the close began (a window close or a quit), its write signal, and whether it was abandoned.
- [x] `stopping(label, written)`, `stopped(label) -> ReportIn`, `abandon_close(label)` and `take_for_exit()` are tested in `aggregates.rs`'s `given_*` modules: a dialog only for a window close nobody abandoned; standard error for a quit or an abandoned close; reopening refused until `closed`; the Dock Quit waiting for every close's write but an abandoned one.
- [x] `scheme::is_view_of(label, key)` is tested beside `open_view`, and `main.rs` no longer builds a view label.
- [x] `main.rs`'s `Aggregates` holds the Registry alone: `stopping`, `abandoned`, `keep_stopping`, `take_stopping`, `abandon` and `take_abandoned` are gone, and `spawn_stop` takes no `dialog` flag.
- [x] Storage ST-122 cites the new tests.
- [x] `cargo test -p infinity-cube-desktop`, clippy with `-D warnings` and `cargo fmt --check` are clean.

## Comments

- 2026-11-27: built. `Registry`'s `Closing` state holds `by` (a window close or a quit), `written` and `abandoned`; `stopping`, `stopped`, `abandon_close` and `take_for_exit` are its new transitions, tested in `given_a_close_whose_last_write_ends` and `given_a_dock_quit`. Breaking `stopped`'s abandoned check, or leaving an abandoned close's write signal in place, each fails a test. `scheme::is_view_of` reads the label `open_view` builds. `main.rs` lost the two side maps and `spawn_stop`'s flag.
- 2026-11-27: review found two older faults the Registry now holds tests for: a window close a quit overtook kept its failure dialog (`a_failure_of_a_window_close_a_quit_overtook_goes_to_standard_error`), and `abandon` freed a folder a quit's stop was still writing (`given_a_quit_that_took_an_aggregate_whose_window_then_failed`). Both fixed in the Registry.
