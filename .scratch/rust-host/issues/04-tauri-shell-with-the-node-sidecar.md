# 04 — The Tauri desktop shell, with the Node host as its sidecar

**Status:** ready-for-agent

**Blocked by:** 03. Not blocked by 01: like 03, this implements ADR 0155's first stage while the ADR is proposed, and its code landed ahead of acceptance by the maintainer's choice (17 November 2026).

**What to build:** A Tauri v2 application in `packages/desktop/` (its `src-tauri/` joins the Cargo workspace in 09): an Open Folder dialog; one window per Aggregate directory, each starting its own sidecar (03) on that folder; reading the sidecar's announcement line (`{ "kind": "listening", "port", "secret" }` or `{ "kind": "refused", "message" }`, 03) and loading `http://127.0.0.1:<port>/?launch=<secret>`; minimal capabilities (no `shell` permission reachable from the window); closing a window closes its sidecar's stdin, waits up to five seconds for it to exit, then kills it; quitting does that for every window. macOS Apple Silicon first. A sidecar that fails to start, or refuses the folder, shows the intake's errors instead of a blank page: in this first stage as a native error dialog, never an empty window. A missing or empty folder is refused with text that names `pnpm cube init`, which a presenter does not have; 24 replaces that with creating a talk from the application.

Each talk window's origin is `http://127.0.0.1:<port>`, so two talks get separate origins only because their ports differ, and the port is new on every launch, so what the page keeps in `localStorage` (the colour scheme, `packages/app/src/browser-color-scheme.ts`) is forgotten each time. A known limit of this stage; 13 gives each talk a stable origin of its own.

Two additions beyond the list above are accepted for this first stage: a directory named on the command line opens at once, as one chosen in the dialog would, and `tauri.conf.json` bundles for every target (`"targets": "all"`). Windows and Linux stay unverified until 22 and 23.

A known limit of this stage: closing a talk window closes its sidecar's standard input without the page being told, so an edit the page has not yet posted (one queued behind a commit in flight) fails against the closed server and is not written. A signal from the page that its persistence has settled, which the shell waits for before stopping the sidecar, is follow-up work.

- [ ] Closing a window after an edit leaves the directory with the edit.
- [ ] Opening a talk and closing it without an edit leaves the directory unchanged (ST-65).
- [ ] A 10 MiB asset upload works.
- [x] Two talks' sessions do not overwrite each other: each sidecar's cookie is named for its port. Held by a unit test of the handler (`test/unit/desktop-handler.test.ts`), not tried in the shell.
- [ ] Two talks open at once in the shell, each in its own window, without interfering.
- [ ] Opening a Resource independently, and the Notes window, open from a talk window and stay in step with it in the shell.
- [ ] A sidecar that fails to start, or refuses the directory, shows the intake's errors in a native error dialog and opens no talk window.
- [ ] Every box above checked on macOS Apple Silicon.

## Comments

**2026-11-17 (progress).** Built in `packages/desktop/`: `src-tauri/src/main.rs` (home window, `open_talk` the only command and granted to the home window alone by `capabilities/home.json`, one sidecar per talk window, close held until the sidecar exits or five seconds pass, every sidecar stopped on exit, a folder named on the command line opened at once), `src-tauri/src/sidecar.rs` (start, read the announcement, stop by closing stdin), `scripts/build-sidecar.ts` (browser build, sidecar bundle, Node single executable named for Tauri's `externalBin`, ad-hoc signed on macOS). Talk windows load `http://127.0.0.1:<port>/?launch=<secret>` and are given no capability, so they cannot invoke the shell.

Checked on Linux x64 only (no macOS here): `cargo clippy --all-targets -D warnings` and `cargo test` (2) clean; under Xvfb with Openbox the app opened the fixture in its own WebKitGTK window and drew the Map; closing that window through the window manager stopped its sidecar and left the home window open; `tauri build --bundles deb` produced a 52 MB package. Not checked: macOS at all, an edit made through the window and written on close (the stdin-close write is held by `test/integration/desktop-sidecar.test.ts`), a 10 MiB upload, two talks at once.

**2026-11-17 (review).** Still not checked on macOS, so the macOS box and every behaviour box tried only in the shell stay open; the one box ticked is held by a unit test, not by the shell. Since the first comment: the shell gives up on a sidecar that has not announced within 30 seconds (`ANNOUNCE_DEADLINE`, `src-tauri/src/sidecar.rs`), and every error path stops and reaps the sidecar before returning (`sidecar.rs` tests `gives_up_on_a_sidecar_that_never_announces_and_reaps_it` and `reaps_a_sidecar_whose_announcement_cannot_be_read`); talk windows navigate only within their own sidecar's origin. A refusal is shown as a native error dialog (`show_error`, `src-tauri/src/main.rs`), not in the window.

**2026-11-17 (review fixes).** Talks are kept by canonical directory in `src-tauri/src/talks.rs` (`Registry`): opening a directory already open, starting or closing focuses its window rather than starting a second sidecar, and a repeated close request keeps the window held until the sidecar has stopped. Closing a window shows a native error dialog before the window goes when the sidecar exited non-zero or was killed (`Stopped::unwritten`, `sidecar.rs`); on quitting, the event loop is ending, so that case goes to standard error only. A thread looks every half second for a sidecar that stopped by itself (`Sidecar::exited`) and closes its window with a dialog saying so. On Windows the sidecar is spawned with `CREATE_NO_WINDOW`. `scripts/build-sidecar.ts` refuses a Rust host triple naming another platform or architecture than the Node it copies (`test/unit/desktop-build-sidecar.test.ts`). Held by `cargo test` (20, Linux x64) for the registry's transitions, the stop classification and the watcher's view of a fake sidecar; the dialogs, focusing and the Windows flag are not tried in the shell.
