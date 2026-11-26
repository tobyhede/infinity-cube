# 01 — Move opening a folder behind a port

**Status:** resolved

**Blocked by:** none.

**What to build:** `packages/desktop/src-tauri/src/open_folder.rs`, holding every rule of opening a folder now in `main.rs` 365–560, `start.rs` 383–449 and `launch.rs`'s `Opening`, `Next`, `after`, `Opened` and `closes_start`, behind the two entry points and the port the [spec](../spec.md) settles, with the Tauri adapter only. No behaviour changes.

- [ ] `open(origin, &[folders])` and `create_space(location, name) -> Result<(), NotCreated>` are the module's only public entry points; `main.rs` (launch, File › Open…) and `start.rs` (Open Folder…, a recent Space, New Space) call nothing else of it.
- [ ] `launch::Opening` is renamed `Origin`; `launch.rs` keeps `launch()` and `last_window_closed` only, and a launch naming no folder goes through `open(Origin::CommandLine, &[])`.
- [ ] `start.rs` no longer calls `crate::open_aggregate_at`, `crate::one_write_at_a_time`, `crate::choose_folder` or `crate::open_from`.
- [ ] The port is a trait with the methods the spec lists, implemented for Tauri; the module reaches the Registry directly and is generic over the server type the Registry holds.
- [ ] `CONTEXT.md`'s **Space window** _Avoid_ line gains "opening" for a folder.
- [ ] Existing tests pass unchanged except where a renamed item moves; `cargo clippy --workspace --all-targets --locked -- -D warnings` is clean.

## Comments

- 2026-11-27: built. `open_folder.rs` holds the rules and the `Shell` port, `open_folder/tauri_shell.rs` the Tauri adapter, the folder chooser and the two calls `main.rs` and `start.rs` make. `server::Started` takes the server type as a parameter, defaulting to `AggregateServer`, so the fake starts its own. `lock` moved from `main.rs` to `open_folder.rs`. The Start window's and the launch's evidence citations in Storage ST-121 and ST-131 and the desktop skill's Open line point at the new module.
