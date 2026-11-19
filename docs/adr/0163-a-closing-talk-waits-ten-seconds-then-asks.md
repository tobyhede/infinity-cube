# A closing talk waits ten seconds for its last write, then asks the presenter

Status: proposed
Related: 0117, 0119, 0155, 0162

ADR 0155 moved the desktop application onto the Rust host, running in the shell's own process, and said a window must not close on an Edit that is not on disk. It did not say what the shell does when that last write does not end: a folder on a stalled network share, a disk that has gone away, a write blocked by another program. Storage ST-122 restates what was built for that case without an ADR to source it. Review of the Rust host stack (pull request 493) asked for the rule to be decided, since it chooses between losing Edits and keeping a window open with no end, and a later change would otherwise re-litigate it. This records the rule as built and the alternatives it rejects.

## The decision

- **A close waits for its talk's last write, with no time limit of its own.** Closing a talk's window, or quitting, stops serving the talk, waits for every change still being answered, then waits for the run to write any Edit not yet on disk (ST-121). The window stays open meanwhile.
- **After ten seconds the presenter is asked, never the shell.** If the write is still running ten seconds after the close was asked for, a question window names the folder and offers "Keep waiting" and "Close without saving", with Keep waiting the default; Escape, or closing the question's own window, keeps waiting. Keep waiting asks again ten seconds later. A write that ends while the question shows takes the question away and the close goes on as if it had not been asked.
- **Close without saving closes the windows and leaves the write running.** The write ends on its own while the application runs, and the folder cannot be opened again until it has, since the run still holds the directory's lock (ADR 0162). A failure of that write is reported on standard error only.
- **A quit asks one question for every folder still writing.** The questions of windows already closing join it; each answer applies to every folder it names, and the question names fewer folders as their writes end.
- **What closing without saving may lose is bounded by Export's in-place rule.** Every Edit not yet written when the process ends is lost, and a write cut short part-way leaves the files it had not yet replaced from before it (ADR 0119, Storage ST-58). Export replaces each file through a temporary file renamed over it (ST-55), so a file Import reads is never part-written and the folder still Imports.

## Why

- **The presenter, not the shell, decides to lose Edits.** Every Edit the page saw answered 200 was accepted; only the presenter knows whether waiting on a share that may come back is worth more than closing now.
- **Ten seconds is meant to separate a slow write from a stuck one.** The figure is a judgement, not a measurement: long enough that a busy disk or a slow share is not interrupted with a question, and short enough that a presenter is not left looking at a window that will not close with nothing said.
- **Waiting is the default answer** because it is the one that cannot lose an Edit, and a presenter who dismisses the question without reading it keeps their work.

## Rejected

- **Wait for ever, with no question.** A write that hangs then keeps the window, or the application, open with nothing said, and the presenter's only way out is to kill the process, which loses the same Edits with no warning.
- **Close at once and keep writing in the background.** The window goes, but a failed write has nowhere to be reported, and quitting would end the process with Edits unwritten without asking.
- **A time limit that closes without asking.** It makes the shell choose to lose Edits, which is the presenter's choice; any fixed limit is too short for some share that would have answered.
- **A native message dialog for the question.** A native dialog cannot be taken away by the program, so it could not go by itself when the write ends; the question is a window of the shell's own (`ui/closing.html`).

## Consequences

- Storage ST-122 restates this rule, and would cite this ADR once it is accepted.
- The ten-second figure is decided by the pure `src/waiting.rs` (`ASK_AFTER`), whose tests run on tokio's paused clock.
- Quitting from the macOS Dock, or logging out, ends the process without asking the application, so the shell waits for every write with no question there; this ADR does not change that.
- A run whose write is abandoned holds the directory's lock until the write ends (ADR 0162), so opening the folder again in that time is refused, saying so.
