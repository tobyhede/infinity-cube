# The desktop application opens to a Start window and reopens recent Spaces

Status: accepted
Date: 2026-11-24
Refines: 0167
Related: 0124, 0155, 0168

ADR 0167 removed the home window, a web page holding an Open button that opened beside the Space a person named, and made the question asked at launch a bare folder chooser. That leaves a person who has just downloaded the application facing a folder chooser titled "Open a Space" with no Space to open: a new Space is offered only if they already know to make and choose an empty folder, and File › New Space… asks for the same empty folder. The goal is that a person downloads the application, runs it, and is presenting from a new Space without knowing what an Aggregate directory is. 0167 weighed a home window that was a page beside a Space; it did not weigh a window that appears only when no Space is open, which is how folder-based desktop applications (Obsidian's vault chooser, VS Code's and Xcode's welcome windows) start.

## The decision

- **The desktop application has a Start window**, which replaces 0167's first bullet. It offers New Space, Open Folder… and the recent Spaces. It shows at launch when nothing else opens, and when File › New Space… is chosen; it closes when a Space window opens from it. It is a window like any other for the last-window rule below: closing it with no Space window open is closing the application's last window. Every other window is still a Space window, a window a Space's page opened, or a close's question.
- **New Space is a form in the Start window, not a folder chooser.** It asks for a name (default "Untitled Space") and a location (default the person's Documents folder, with Browse…), writes a new Space to the folder `<location>/<name>` as `init` does, and opens it. The name is also the new Space's Title. A name that is not a single folder name on the platform is refused beside the field and nothing is written: an empty name, `.` or `..`, a name holding `/` or `\`, or one the platform forbids (on Windows, `<>:"|?*`, a reserved name such as `CON`, or a trailing dot or space). A folder that exists and holds anything but dot-entries is likewise refused. File › New Space… shows this form; File › Open… stays the platform's folder chooser.
- **The application reopens the Spaces open when its last quit began.** That set includes the Space whose window's close began the quit, so on Linux and Windows, where closing the last window is the usual way to quit, the next launch reopens it. A launch naming no folder reopens each Space in that set still present; one that is gone or does not open is skipped, and if none opens the Start window shows. A folder named on the command line opens alone, reopening nothing.
- **Recent is a history apart from that set.** The Start window's Recent lists the Spaces opened by any route, most recent first, ten at most, each with its Title and folder; one that is gone, or did not open at launch, says why and offers Remove, and one open in a window is shown as open and focuses that window. The application keeps the history and the set to reopen in its own data directory; they are its only state across launches, and losing them loses nothing else.
- **The last window closing follows the platform.** When the application's last window closes, a Space window or the Start window: on macOS the application keeps running with no window, and activating it (its Dock icon) shows the Start window when nothing is open, or brings the open windows forward otherwise; on Linux and Windows it ends, which is a quit (ST-122). An open Start window keeps the application running on every platform.
- **The Start window is product UI.** It is built from `@project/ui` under the shadcn-first rule, and only its window holds the commands it calls; Space windows still hold no IPC permission.
- **What 0167 decided otherwise stands**: native menus with the platform's accelerators, the offer to create a Space in a missing or empty folder opened by any route, and creating a Space only when the person asks.

## Why

- **Download and run.** A person who has never seen an Aggregate directory can make a Space in one step with defaults they can accept as they are, and the next launch takes them straight back to it.
- **A typo is still caught.** ADR 0124 separated creating from running because a mistyped path silently became a new aggregate. Here the person presses New Space and sees the name and location before anything is written.
- **The person knows where their Space is.** The location is shown and chosen, so a Space is never written somewhere the person did not see.

## Rejected

- **A native three-button question at launch** (New Space, Open…, Quit). Cheap, and it keeps 0167's first bullet, but it cannot show recent Spaces and leaves New Space needing a folder chooser.
- **Create a Space at a default location without asking.** The least friction, but it writes a folder the person never saw, and reopens the question ADR 0124 closed.
- **Make Recent exactly the Spaces open at the last quit.** Every one of them reopens at launch, so the Start window's Recent would only ever list Spaces that failed to open.
- **Show the Start window only on the very first launch.** It needs state the application would otherwise not keep, and leaves every later launch with nothing to open as frictional as the first.
- **A Save dialog for New Space.** One native dialog with the same defaults, but it splits creating across a window and a dialog, and the platforms' Save dialogs differ in how they treat a folder name.
- **Plain HTML for the Start window, as the close question is drawn.** That is how the home window 0167 removed was built.

## Consequences

- Storage ST-131 states the Start window, New Space, reopening and the last window closing, **not built**; ST-121 keeps the launch question until it is. UI states no rule for the Start window's layout until its design (`.scratch/start-window/issues/01-design-the-start-window.md`) is accepted.
- `init_directory` takes the Title of the Space it writes; the CLI's `init` still writes "New space".
- `tauri.conf.json` still declares no window: the shell opens the Start window itself.
- Opening a recent Space from the Start window is held to the same refusals as File › Open….
