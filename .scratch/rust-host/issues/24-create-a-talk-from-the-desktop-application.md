# 24 — Create a talk from the desktop application

**Status:** resolved

**Blocked by:** 04.

**As built.** The New Talk action is File › New Space… (`CmdOrCtrl+N`), since there is no home window to hold a button: it asks for a folder, writes a new Space there through the host's `init_directory` (the Rust `init`, whose Export is the only writer), and opens it (`packages/desktop/src-tauri/src/new_space.rs`). Opening a missing or empty folder, from the command line, the launch question or File › Open…, asks "<folder> holds no Space yet. Create a new Space in it?" with Create Space and Cancel; Cancel leaves it unwritten, and at launch with nothing open asks for another folder. The run's refusal for an empty folder is now an offer (`server.rs` `unrun`, `Started::Empty`), so no `pnpm` text reaches a presenter; the CLIs' refusal text does not change.

**What to build:** A presenter has no pnpm, yet the desktop application refuses a missing or empty folder with text naming `pnpm cube init <dir>` (`describeRunRefusal`, `src/cli/run-refusal.ts`, which the sidecar announces). Add a New Talk action beside Open Folder: pick or create an empty folder, write a new aggregate there through Export as `init` does (Storage, "Nothing writes an Aggregate directory except Export"), then open it in its own window. Opening an empty or missing folder offers the same instead of the `pnpm` text; the CLI's refusal text does not change. A separate ticket rather than a box on 04 because it is a new action with its own write path, not a check of what 04 built.

- [x] New Talk on an empty folder opens a talk that `pnpm cube check` accepts; closing it leaves the folder as `init` would have written it, plus any edit.
- [x] Opening an empty or missing folder never shows `pnpm` text; a non-empty folder that is not an aggregate is still refused with the intake's errors.
- [x] New Talk refuses a folder that is not empty, and writes nothing there.

## Comments

**2026-11-22 (evidence).** Unit: `new_space.rs` (a Space the intake accepts; dot-entries kept; a missing folder created; a folder that is not empty refused with nothing written), `server/tests.rs` › `given_a_folder_with_no_aggregate` (a missing or empty folder offered a new Space, not refused). By hand under Xvfb with Openbox and WebKitGTK 2.52 (`xdotool`, screenshots), Linux only: a folder holding only `.git` named on the command line showed the Create Space question, and Create Space opened a window on the new Space with `Resource 1`; `pnpm cube check` accepted the folder, and with ids replaced its files and contents were those `pnpm cube init` writes. Closed with no edit, its files kept their SHA-256 and modification times. Cancel on the question for an empty folder showed the "Open a Space" folder question, and nothing was written. File › New Space… on a folder holding `notes.txt` showed "<folder> is not empty. A new Space goes in an empty folder, so nothing was written there." and the folder still held only `notes.txt`; on an empty folder it opened the new Space in a window of its own. A folder holding a file but no `aggregate.json` is still refused with the intake's errors (04's evidence). Not run on macOS.
