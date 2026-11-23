# 03 — Reopen recent Spaces at launch

**Status:** needs-triage

**Blocked by:** 02 (the Start window's recent entries).

**What to build:** The shell keeps two things in its own data directory (ST-131), its only state across launches: the set to reopen, the Spaces open when its last quit began, including the one whose window's close began it; and Recent, the Spaces opened by any route, most recent first, ten at most, which the Start window lists. A launch naming no folder reopens each Space in the set still present, skipping one that is gone or does not open; if none opens, the Start window shows, with a skipped Space's reason on its Recent entry. A folder named on the command line opens alone and reopens nothing.

- [ ] Quit with two Spaces open, relaunch with no folder: both reopen, no Start window.
- [ ] On Linux, close the only Space window (which quits), relaunch: that Space reopens.
- [ ] Open three Spaces in turn and close them all on macOS, then quit: the next launch shows the Start window with the three in Recent, most recent first.
- [ ] One of them moved away: the other reopens; with neither, the Start window shows the moved one as gone, with Remove.
- [ ] A folder named on the command line opens alone.
- [ ] A missing or unreadable list is an empty list, never a refusal to start.
- [ ] Decided by a pure function beside `launch::after`, with its cases in `launch.rs`; seen in a live webview.

## Comments
