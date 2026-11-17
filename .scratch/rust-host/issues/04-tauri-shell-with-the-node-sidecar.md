# 04 — The Tauri desktop shell, with the Node host as its sidecar

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** A Tauri v2 application in `packages/desktop/` (its `src-tauri/` joins the Cargo workspace when 09 lands): an Open Folder dialog; one window per talk folder, each starting its own sidecar (03) on that folder; reading the sidecar's `{ port, secret }` line and loading `http://127.0.0.1:<port>/?launch=<secret>`; minimal capabilities (no `shell` permission reachable from the window); closing a window closes its sidecar's stdin, waits up to five seconds for it to exit, then kills it; quitting does that for every window. macOS Apple Silicon first. A sidecar that fails to start, or refuses the folder, shows the intake's errors in the window instead of a blank page.

- [ ] Closing a window after an edit leaves the directory with the edit.
- [ ] Opening a talk and closing it without an edit leaves the directory unchanged (ST-65).
- [ ] A 10 MiB asset upload works.
- [ ] Two talks open at once, each in its own window, without interfering.

## Comments

**2026-11-17 (progress).** Built in `packages/desktop/`: `src-tauri/src/main.rs` (home window, `open_talk` the only command and granted to the home window alone by `capabilities/home.json`, one sidecar per talk window, close held until the sidecar exits or five seconds pass, every sidecar stopped on exit, a folder named on the command line opened at once), `src-tauri/src/sidecar.rs` (start, read the announcement, stop by closing stdin), `scripts/build-sidecar.ts` (browser build, sidecar bundle, Node single executable named for Tauri's `externalBin`, ad-hoc signed on macOS). Talk windows load `http://127.0.0.1:<port>/?launch=<secret>` and are given no capability, so they cannot invoke the shell.

Checked on Linux x64 only (no macOS here): `cargo clippy --all-targets -D warnings` and `cargo test` (2) clean; under Xvfb with Openbox the app opened the fixture in its own WebKitGTK window and drew the Map; closing that window through the window manager stopped its sidecar and left the home window open; `tauri build --bundles deb` produced a 52 MB package. Not checked: macOS at all, an edit made through the window and written on close (the stdin-close write is held by `test/integration/desktop-sidecar.test.ts`), a 10 MiB upload, two talks at once.
