# Opening a folder in the desktop application: one module

**Goal:** the desktop shell's rules for opening a folder as an Aggregate live in one module, testable without a window, so the races that keep breaking (a folder still starting, still writing, or overtaken by a quit) are held by tests instead of by reading `main.rs`.

**Decision:** none new. This is a refactor that keeps behaviour as it is: Storage ST-121 and ST-131 and ADRs 0155 and 0171 bind as written, and no requirement changes. Found by the desktop shell architecture review of 26 November 2026 (candidate 1); the design was settled by grilling in the same project thread.

## Why

Opening a folder spans `main.rs` 365–560 (`choose_folder`, `open_from`, `create_and_open`, `one_write_at_a_time`, `answer`, `next`, `open_from_command_line`, `open_aggregate_at`, `start_aggregate`), `start.rs` 383–449 (`start_create_space`, `start_open_folder`, `start_open_recent`, which call back into `main.rs` through `crate::` five times) and `launch.rs` (`Opening`, `Next`, `after`, `Opened`, `closes_start`). `main.rs` has no tests. The three most recent race fixes in the shell (c9158a47, f3348c62, d0dacf92) were all in that glue, while the extracted helpers are four-row tables. New Space is a second, separately written "write, then open" path.

## What was settled

- **Name.** The module is `open_folder.rs`. "Opening" is `CONTEXT.md`'s word for a Resource showing its content, so `launch::Opening` becomes `Origin` (command line, Start window, menu), and the **Space window** entry's _Avoid_ line gains "opening" for a folder.
- **Two entry points.**
  - `open(origin, &[folders])` for every folder origin. It always takes a batch; the menu and the Start window send a batch of one. A launch naming no folder is `open(Origin::CommandLine, &[])`, so the separate `Launch::Start` branch goes. After a command-line batch the Start window shows when nothing opened and no Aggregate is open, starting or closing; this matches today's outcome for every batch.
  - `create_space(location, name) -> Result<(), NotCreated>` for the Start window's New Space, the one caller that reads an answer.
  - Both share one private path: canonicalise the folder, reserve, start, register, open the window, and roll back on failure; the empty-folder offer and its create-then-open loop; the one-new-Space-at-a-time lock; whether the Start window closes or shows. It is the one place an open succeeds, where ticket 03 of `.scratch/start-window/` records Recent.
  - Both are synchronous and documented as called off the main thread; callers keep spawning threads.
  - Rejected: one entry point for every request (VS Code, Zed). Its main job there is a start-up queue this app does not have, New Space never enters a queue, and one return type would make four callers ignore an enum. `(Origin, folders)` is already the value a future queue would hold. Revisit if New Space must ever wait behind a launch decision.
- **The port.** A small blocking trait with two adapters, Tauri and a recording fake: start an Aggregate (wrapping `AggregateServer::start`), open its window, stop it, focus a window, offer a new Space, show an error (blocking until dismissed), show or close the Start window. Nothing of the close and quit path crosses it.
- **Real collaborators in tests.** The real `aggregates::Registry`, holding the fake's server type; new Spaces written to a temp folder through the existing `Filesystem` and `Listing` seams.
- **Out of scope.** New origins (tickets 03 and 04 here, and `.scratch/start-window/` ticket 03), a start-up gate that holds opens until the launch decides, keeping Recent, `AggregateServer::start`'s internals, and the close and quit path (review candidates 2 and 3).

## Issues

1. [Move opening a folder behind a port](issues/01-move-opening-a-folder-behind-a-port.md): no blocker.
2. [Hold opening a folder with tests at its interface](issues/02-hold-opening-a-folder-with-tests.md): blocked by 01.
3. [A second launch opens its folders in the running application](issues/03-a-second-launch-opens-in-the-running-application.md): needs triage; blocked by 01.
4. [A folder dropped on the Dock icon opens](issues/04-a-folder-dropped-on-the-dock-icon-opens.md): needs triage; blocked by 01.
