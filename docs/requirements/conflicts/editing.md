# Conflicts: Editing

These are places where the sources and the code disagree and [../DECISIONS.md](../DECISIONS.md) does not settle the question. Every rule an open conflict touches has the status **undecided (Cn)** in [../editing.md](../editing.md). Conflict ids are never reused. Paths that start with `test/` are at the repo root; all others are under `packages/`.

## C1. Does a coordinated Accept stored advance the other participants' replacement epochs?

- **Rules.** ED-32 (undecided). Related: ED-28, ED-29, ED-30, ED-63.
- **Disagreement.** 0042 and `CONTEXT.md` ("Replacement epoch") say that replacing the working Space wholesale advances the epoch in the same transition, and that every draft owner then discards its draft. 0076 says Accept stored resolves every participant of a coordinated Edit together. In the code, Accept stored pressed in one participant restores every participant's working Space (`restoreCoordinatedCommit`), but only the Space where it was pressed runs `acceptStoredSpace` and advances its epoch. The other participants repair their navigation (`reconcileNavigation`) and keep their epoch, so their open drafts, queued completions and target-bound surfaces survive against a Space that was rolled back. Drafting rule 4 applies: no source covers the case, and the code contradicts the general rule.
- **Options.**
  - (a) Every participant whose working Space is replaced advances its own epoch in the same publication, so its drafts are discarded as on any replacement.
  - (b) Only the Space where Accept stored was pressed advances; the others are listed as an exception, and their drafts may name identities the rollback removed. Each surface must then survive a stale identity, as `reconcileNavigation` does for the selection.
- **Recommended: (a).** It keeps one meaning for "replaced" and needs no exception. The cost is that a draft open in a second Space is discarded by a press made elsewhere, which is what happens to its Space anyway.
- **Evidence.** `app/src/space-authoring.ts` `acceptStoredSpace` and `reconcileNavigation`; `persistence/src/session.ts` `restoreCoordinatedCommit`; `persistence/src/coordinated-commit.ts` (`acceptRemote`); `app/test/active-graph-after-coordinated-recovery.test.ts` (its header says "no replacement epoch advances"), › "leaves the Dock and the canvas naming one Graph"; `persistence/test/space-resource-lifecycle.test.ts` › "resolves CHILD and TARGET together through CHILD's Accept stored".

## C2. What does the author hear of a queued completion's outcome?

- **Rules.** ED-78 (undecided). Related: ED-9, ED-12, ED-17.
- **Disagreement.** `CONTEXT.md` ("Completion outcome") says an authoring attempt produces exactly one of completed, unchanged or refused, and 0042 and 0057 send a refusal back to the surface that made the attempt. 0042 also lets a completion that arrives during another Edit's publication be queued, and says nothing of what its caller hears. The code answers the caller `queued` at once (a fourth answer) and, when the queue drains, discards the outcome the derivation produces. A queued attempt that completes needs no answer, but one that is refused shows the author nothing, and `command-outcomes` clears its notice channel on `queued`.
- **Options.**
  - (a) Deliver a drained outcome to the surface that reported it: a refusal reaches that surface's refusal place (ui.md UI-90), as an announcement where the surface has closed.
  - (b) Accept `queued` as a fourth answer, and let a drained refusal reach only the diagnostic reporter.
- **Recommended: (a).** It keeps the one-outcome rule and the "refusal goes back to its surface" rule without an exception. Queuing happens only when an observer completes an Edit from inside a publication, so the change is narrow. Choose (b) only if no reachable path queues a user gesture.
- **Evidence.** `app/src/space-authoring.ts` `AuthoringResult` (four arms) and `complete` (the drain ignores `performCompletion`'s result); `app/test/command-outcomes.test.ts` › "leaves the channel clear on unchanged and queued"; `app/src/connection-completion.ts` and `app/src/edge-authoring.ts` report `queued` as an invariant at the React Flow seam (ED-9).

## C3. Is a broken invariant from a canvas gesture always reported, never thrown?

- **Rules.** ED-79 (undecided). Related: ED-16.
- **Disagreement.** The old rendering guide (`docs/agents/rendering.md`, "An invariant reached from a canvas gesture is reported, not thrown") says that at the canvas seam a broken invariant is always reported: the gesture authors nothing and gets no sentence, because throwing from a browser event mid-gesture unmounts the canvas. No ADR contradicts it. The code reports only a `queued` answer there. A derivation that throws (an invalid Space) propagates out of the connection handler, and a test asserts the throw.
- **Options.**
  - (a) Keep the rule: catch a thrown completion at the canvas seam, report it, and draw nothing. Change the test to assert the report.
  - (b) Narrow the rule to `queued`: a thrown derivation reaches the error boundary like any other defect.
- **Recommended: (a).** It is the only source, and its reason (not costing the author their Space for a defect) holds for a throw as much as for `queued`.
- **Evidence.** `app/src/connection-completion.ts` `complete`; `app/src/edge-authoring.ts` `completeStructural`; `app/test/render-adapter.test.ts` › "leaves the projected connection uncommitted when the completion fails" (expects `toThrow`), "reports and draws nothing when a completion at the React Flow seam is queued".
