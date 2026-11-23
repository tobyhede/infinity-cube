# Start window: a new Space on first open

**Goal:** a person downloads the desktop application, runs it, and is presenting from a new Space without knowing what an Aggregate directory is.

**Decision:** [ADR 0171](../../docs/adr/0171-the-desktop-application-opens-to-a-start-window-and-reopens-recent-spaces.md), restated as Storage ST-131 (**not built**). `CONTEXT.md` names the **Start window**.

## What was settled (grilled 2026-11-23/24)

- Desktop application only; the CLI's `run` still refuses an empty folder and names `init`.
- "First open" is every launch with nothing to open, not the first launch ever.
- The Start window offers New Space, Open Folder… and the recent Spaces. It shows when nothing else opens and for File › New Space…, and closes when a Space window opens from it. It replaces ADR 0167's "no home window"; 0167's native menus and "create only when asked" stand.
- New Space is a form in the window: Name (default "Untitled Space", or the first free "Untitled Space 2", … when taken) and Location (default Documents, Browse…). It writes `<location>/<name>`, titles the Meta Space with the name, and opens it. A name that is not one folder name on the platform (empty, `.`, `..`, a separator, a forbidden character or name), or a non-empty folder, is refused beside the field with nothing written.
- File › Open… stays the platform's folder chooser.
- The application reopens the Spaces open when its last quit began, including the one whose window's close began it (so closing the last window on Linux or Windows still reopens it), skipping any gone or unopenable; with none open the Start window shows. A folder named on the command line opens alone.
- Recent is a separate history of Spaces opened, most recent first, ten at most; a gone or failed entry says why and offers Remove, and an open one focuses its window.
- Last window closed, Space or Start: macOS runs on with no window, and the Dock icon shows the Start window (or brings open windows forward); Linux and Windows end, as a quit. An open Start window keeps the application running.
- The Start window is React with `@project/ui`, shadcn-first; only its window holds the commands it calls.
- Signing and Gatekeeper stay with rust-host issue 21.

## Issues

1. [Design the Start window](issues/01-design-the-start-window.md): designs on canvas, reviewed before any build.
2. [Build the Start window](issues/02-build-the-start-window.md): blocked by 01.
3. [Reopen recent Spaces at launch](issues/03-reopen-recent-spaces-at-launch.md): blocked by 02 for the Start window's entries.
