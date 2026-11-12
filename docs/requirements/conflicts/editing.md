# Conflicts: Editing

These are places where the sources and the code disagree and [../DECISIONS.md](../DECISIONS.md) does not settle the question. Every rule an open conflict touches has the status **undecided (Cn)** in [../editing.md](../editing.md). Conflict ids are never reused. Paths that start with `test/` are at the repo root; all others are under `packages/`.

## Open

None.

## Closed

### C1. Does a coordinated Accept stored advance the other participants' replacement epochs?

Closed by ruling Editing C1 in `../DECISIONS.md` ("Checkpoint 3 rulings", 12 November 2026): every Space the save covered is replaced and discards its drafts and pending work, the other Space included. ED-32 states it; bug: code differs.

For the record:
- **Rules.** ED-32. Related: ED-28, ED-29, ED-30, ED-63.
- **What the conflict was.** 0042 and `CONTEXT.md` ("Replacement epoch") say a wholesale replacement advances the epoch and every draft owner discards. 0076 says Accept stored resolves every participant together. The code restores every participant but advances the epoch only in the canvas Space, the one Space whose Dock offers Accept stored.
- **Evidence.** `app/src/dock-chrome.ts:473`; `app/src/space-authoring.ts` `acceptStoredSpace` (`:1717`); `persistence/src/session.ts` `restoreCoordinatedCommit` (`:621-633`); `app/src/App.tsx:354, :377`; `app/src/image-replacement.ts:121, :128`; `app/test/active-graph-after-coordinated-recovery.test.ts` › "leaves the Dock and the canvas naming one Graph".

### C2. What does the author hear of a queued completion's outcome?

Closed by ruling Editing C2 in `../DECISIONS.md` ("Checkpoint 3 rulings", 12 November 2026): a queued Edit that is refused reports where the author made it, or is announced if that surface has closed; no draft is kept; every caller treats a waiting Edit the same way. ED-78 states it; bug: code differs.

For the record:
- **Rules.** ED-78. Related: ED-9, ED-12, ED-17.
- **What the conflict was.** `CONTEXT.md` ("Completion outcome") gives one outcome per attempt, and 0042 and 0057 send a refusal back to its surface. The code answers `queued` at once and discards the drained outcome, and its callers disagree on what `queued` means.
- **Evidence.** `app/src/space-authoring.ts` `complete` (`:1647`); `app/src/authoring-commands.ts:104-121`; `app/src/authoring-contexts.ts:270`; `app/src/resource-placement.ts:258`; `app/src/connection-completion.ts:115`; `app/src/edge-authoring.ts:484`; `app/test/command-outcomes.test.ts` › "leaves the channel clear on unchanged and queued".

### C3. Is a broken invariant from a canvas gesture always reported, never thrown?

Closed by ruling Editing C3 in `../DECISIONS.md` ("Checkpoint 3 rulings", 12 November 2026): a broken invariant from any canvas gesture is reported, never thrown, and the gesture does nothing; the reason is a half-finished gesture, not an unmounted canvas. ED-79 states it; bug: code differs.

For the record:
- **Rules.** ED-79. Related: ED-16.
- **What the conflict was.** The old rendering guide (`docs/agents/rendering.md`, "An invariant reached from a canvas gesture is reported, not thrown") required reporting and gave the reason that a throw unmounts the canvas. The app has no error boundary or global error handler, and an error boundary does not catch a throw from an event handler, so that reason does not hold. The code reports only `queued` at the canvas and lets a failed derivation throw.
- **Evidence.** `app/src/space-authoring.ts` `assertValidAuthoredSnapshot` (`:94-102`); `app/src/connection-completion.ts:108-123`; `app/src/render-adapter.ts:472, :628`; `app/src/edge-authoring.ts:478`; `app/test/render-adapter.test.ts` › "leaves the projected connection uncommitted when the completion fails" (`:885-891`, expects `toThrow`).
