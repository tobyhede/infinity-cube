# 03 — Reopen recent Spaces at launch

**Status:** needs-triage

**Blocked by:** 02 (the Start window's recent entries).

**What to build:** The shell keeps the Spaces open when it last quit in a list in its own data directory (ST-131), its only state across launches. A launch naming no folder reopens each one still present, skipping one that is gone or does not open; if none opens, the Start window shows, with a skipped Space's reason on its entry. A folder named on the command line opens alone and reopens nothing. The list is what the Start window's Recent shows.

- [ ] Quit with two Spaces open, relaunch with no folder: both reopen, no Start window.
- [ ] One of them moved away: the other reopens; with neither, the Start window shows the moved one as gone, with Remove.
- [ ] A folder named on the command line opens alone.
- [ ] A missing or unreadable list is an empty list, never a refusal to start.
- [ ] Decided by a pure function beside `launch::after`, with its cases in `launch.rs`; seen in a live webview.

## Comments
