# Conflicts: Navigation

These are places where the sources and the code disagree and [../DECISIONS.md](../DECISIONS.md) does not settle the question. Every rule an open conflict touches has the status **undecided (`conflicts/navigation.md` Cn)** in [../navigation.md](../navigation.md). These ids are this file's own and are unrelated to the DECISIONS rulings named C1 to C7. Conflict ids are never reused. Paths that start with `test/` are at the repo root; all others are under `packages/`.

No conflict is open.

## Closed

### C1. Closed by ruling Navigation C1

Ruling Navigation C1 in `../DECISIONS.md` (Checkpoint 3 rulings, 12 November 2026): Meta is the only permanent Space, and exiting the last open Space opens Meta with no Opener and puts Meta's address in the address bar. Not built. The rule is NV-82.

For the record:
- **What the conflict was.** What exiting the last open Space does, and whether any Space but Meta is permanent. 0068 said "the root Space is never closable"; `CONTEXT.md` lets Exit close any Space but Meta. The code refuses Exit only for Meta, and exiting the last open Space leaves nothing on the canvas while the location still names the exited Space.
- **Evidence.** `app/src/open-spaces.ts` `exit` (refuses only Meta) and `followActiveSpace` (nothing on the canvas after the last Exit, no address written); `app/test/open-spaces.test.tsx` › "never exits the permanent Meta Space". Exiting the last open Space is untested.

### C2. Closed by ruling Navigation C2

Ruling Navigation C2 in `../DECISIONS.md` (Checkpoint 3 rulings, 12 November 2026): Graph navigation on the canvas moves to the Active Graph neighbour in the arrow's direction, along an Edge either way, and keeps no history. It overrules 0041:144-147 and the matching `CONTEXT.md` entries. Built. The rule is NV-13.

For the record:
- **What the conflict was.** 0041:144-147 gave working Graph navigation its own Traversal history, and `CONTEXT.md` ("Graph navigation", "Traversal history", "Active Resource") gave it presenting's fork, merge, cycle and backtracking rules. The code moves the selection spatially along Active Graph Edges either way and keeps no history.
- **Evidence.** `app/src/graph-navigation.ts`; `app/test/graph-navigation.test.ts` › "joins Edges either way, once each, in Edge order", "prefers the candidate nearest the axis over a nearer one off it"; `app/e2e/keyboard-shortcuts.spec.ts` › "the arrow keys follow the Active Graph, and Shift and an arrow move the Resource"; `app/src/navigation.ts` (`NavigationState` holds `traversalHistory` only in `presenting`).

### C3. Closed by ruling Navigation C3

Ruling Navigation C3 in `../DECISIONS.md` (Checkpoint 3 rulings, 12 November 2026): a `refused` save counts as rejected, so Open Spaces marks it and Exit warns. Built. The rule is NV-84.

For the record:
- **What the conflict was.** 0068 marks an entry only for `conflicted`, `failed` or `rejected`, and warns at Exit only on `rejected`. `refused` was split from `rejected` after 0068, and the code kept the mark and the warning for it.
- **Evidence.** `app/src/dock-model.ts` `UNWELL_STATUS` (`refused: 'rejected'`); `app/src/open-spaces.ts` `retireOpenSpace`; `app/test/dock-report.test.ts` › "in the words `openSpaceStatusLabel` decides"; `app/test/open-spaces.test.tsx` › "warns before exiting refused work and permits an explicit exit".
