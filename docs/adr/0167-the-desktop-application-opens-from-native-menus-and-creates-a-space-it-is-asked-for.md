# The desktop application opens from native menus and creates a Space it is asked for

Status: accepted
Date: 2026-11-23
Refines: 0124, 0138, 0155, 0164
Refined by: 0168, 0170
Related: 0018, 0162

ADR 0155 makes the desktop application a Tauri shell that runs an Aggregate directory as Running does, and ADR 0164 names its command `open_aggregate`, which a home window called. A desktop application whose first window is a page holding an Open button, beside the windows of the Spaces it opens, is not how a desktop application behaves: a person expects to open a folder from File › Open… and to have nothing open but what they opened. A presenter also has no `pnpm`, so a refusal that points at `pnpm cube init` leaves them with no way to start.

## The decision

- **The desktop application has no home window.** Every window is a Space window, a window a Space's page opened, or a close's question. A folder is opened from the command line, from File › Open…, or from the question the application asks at launch when none is named. The command `open_aggregate`, its permission `allow-open-aggregate` and the home window's capability are removed.
- **The desktop application creates a Space when the person asks for one.** File › New Space… asks for a folder and writes a new Space there as `init` does, then opens it, refusing a folder that holds anything but dot-entries. Opening a missing or empty folder by any route asks whether to create a new Space there instead of refusing it; declining writes nothing. Creating and Running stay separate acts (ADR 0124): the shell never creates without the person choosing to, and the CLI's `run` still refuses a missing or empty directory, pointing at `init`.
- **A native integration follows the platform's conventions, not the page's.** The application's menus are the operating system's, with the platform's accelerators: `CmdOrCtrl+N`, `CmdOrCtrl+O` and `CmdOrCtrl+Q` (on macOS also the application, Edit and Window menus a Mac application has). The rule that no application shortcut answers under Ctrl, Meta or Alt, and ADR 0138's keymap, govern the keys the page answers. They do not govern a native menu's accelerators, which must be the platform's own.

## Why

- **A person opens files from the File menu.** A home window is a web page's idea of an application, and opening a second window beside the Space a person named looks like a fault.
- **A typo is still caught.** ADR 0124 separated creating from running because a mistyped path silently became a new aggregate. Here the person sees the folder named and chooses Create Space, so a mistyped path is not created without their saying so.
- **Native accelerators are what a person's hands already know.** Holding a native menu to the page's rule would leave File › Open… with no `⌘O`, and ⌘C and ⌘V without the Edit menu that makes them work.

## Rejected

- **Keep the home window and add the menu.** Two ways to open, and a window that is not a Space, for no gain.
- **Refuse an empty folder in the shell as `run` does.** It names a command a presenter cannot run.
- **Create a Space in an empty folder without asking.** It reopens the mistyped-path problem ADR 0124 closed.
- **Hold native menus to the page's no-modifier rule.** It breaks the platform's conventions for the sake of a rule written for keys a browser and the system already claim.

## Consequences

- Storage ST-121 restates the windows, the offer and New Space…; UI-8 says it governs the page's keys and that native menus follow the platform.
- `tauri.conf.json` declares no window, held by `the_configuration_declares_no_window` in `packages/desktop/src-tauri/src/launch.rs`.
- Whether a Resource opened in its own window stays in step with its Space's window is not decided here: today it behaves as two browser tabs do, showing the other's edits on reload or on a conflict.
