# 04 — The Tauri desktop shell, with the Node host as its sidecar

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** A Tauri v2 application in `packages/desktop/` (its `src-tauri/` joins the Cargo workspace when 09 lands): an Open Folder dialog; one window per talk folder, each starting its own sidecar (03) on that folder; reading the sidecar's `{ port, secret }` line and loading `http://127.0.0.1:<port>/` with the secret; minimal capabilities (no `shell` permission reachable from the window); closing a window closes its sidecar's stdin, waits up to five seconds for it to exit, then kills it; quitting does that for every window. macOS Apple Silicon first. A sidecar that fails to start, or refuses the folder, shows the intake's errors in the window instead of a blank page.

- [ ] Closing a window after an edit leaves the directory with the edit.
- [ ] Opening a talk and closing it without an edit leaves the directory unchanged (ST-65).
- [ ] A 10 MiB asset upload works.
- [ ] Two talks open at once, each in its own window, without interfering.
