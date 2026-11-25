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
- **What the conflict was.** `CONTEXT.md` ("Completion outcome") gives one outcome per attempt, and 0042 and 0057 send a refusal back to its surface. The code answers `queued` at once and, for a caller that passes no settle callback, discards the drained outcome; its callers disagree on what `queued` means.
- **Evidence.** `app/src/space-authoring.ts` `complete` (`:1647`); `app/src/authoring-commands.ts:104-121`; `app/src/authoring-contexts.ts:270`; `app/src/resource-placement.ts:258`; `app/src/connection-completion.ts:115`; `app/src/edge-authoring.ts:484`; `app/test/command-outcomes.test.ts` › "leaves the channel clear on unchanged and queued".

### C3. Is a broken invariant from a canvas gesture always reported, never thrown?

Closed by ruling Editing C3 in `../DECISIONS.md` ("Checkpoint 3 rulings", 12 November 2026): a broken invariant from any canvas gesture is reported, never thrown, and the gesture does nothing; the reason is a half-finished gesture, not an unmounted canvas. ED-79 states it; bug: code differs.

For the record:
- **Rules.** ED-79. Related: ED-16.
- **What the conflict was.** The old rendering guide (`docs/agents/rendering.md` at `797b2908`, "An invariant reached from a canvas gesture is reported, not thrown") required reporting and gave the reason that a throw unmounts the canvas. The app has no error boundary or global error handler, and an error boundary does not catch a throw from an event handler, so that reason does not hold. The code reports only `queued` at the canvas and lets a failed derivation throw.
- **Evidence.** `app/src/space-authoring.ts` `assertValidAuthoredSnapshot` (`:94-102`); `app/src/connection-completion.ts:108-123`; `app/src/render-adapter.ts:472, :628`; `app/src/edge-authoring.ts:478`; `app/test/render-adapter.test.ts` › "leaves the projected connection uncommitted when the completion fails" (`:885-891`, expects `toThrow`).

### C4. What does a browser session do with a Title holding a lone surrogate?

Opened 19 November 2026, in the refresh to `17aab57`. **Closed by the maintainer's ruling of 21 November 2026: option (b).** Every title an author writes that holds a lone surrogate is refused where it is written, before anything is committed. SR-68 states it; **not built**, tracked in `.scratch/title-well-formed/issues/01-refuse-a-title-holding-a-lone-surrogate.md`. The ruling adds a rule no ADR states: ADR 0160 decides what the hosts refuse and says nothing of where the browser checks a title first, and ADR 0042, which keeps a refused draft local, says nothing of what makes a title well formed. It is recorded in the requirement rather than as an ADR because it fails the first test in `docs/agents/workflow.md` (When to write an ADR): a check before commit is easy to reverse.

For the record:

- **What happens.** A browser string can hold a lone UTF-16 surrogate (a paste, for one). `JSON.stringify` escapes it, and since ADR 0160 both hosts answer such a commit body 400 `invalid-request` (ST-77). The transport reads that as a permanent `invalid-commit` (ST-101), so the session is `rejected` (ED-46) and offers no Retry; the next Edit commits the newest working Space, which still holds the surrogate, and is rejected again until the author changes that Title.
- **Sources.** ADR 0160 decides the hosts' refusal and says nothing of the browser. ADR 0042 makes a permanent rejection final for the Space as sent.
- **Evidence.** Nothing in `packages/*/src` but `core/src/json-text.ts` (`parseJsonText`, a reader) checks a string is well formed; no test commits such a Title from the browser.
- **Options.** (a) Leave it: the case needs unusual input and the rejection names it. (b) Refuse such a Title where it is entered, so it never reaches a commit (a new rule in UI and Editing, and an ADR if it changes what 0042 or 0160 decides). Recommendation: (b), recorded as a delivery issue first, since the author otherwise sees every later Edit refused with no hint which Title is at fault.
