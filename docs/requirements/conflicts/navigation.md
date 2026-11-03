# Conflicts: Navigation

These are places where the sources and the code disagree and [../DECISIONS.md](../DECISIONS.md) does not settle the question. Every rule an open conflict touches has the status **undecided (`conflicts/navigation.md` Cn)** in [../navigation.md](../navigation.md). These ids are this file's own and are unrelated to the DECISIONS rulings named C1 to C7. Conflict ids are never reused. Paths that start with `test/` are at the repo root; all others are under `packages/`.

## C1. What does exiting the last open Space do, and is any Space but Meta permanent?

- **Rules.** NV-82 (undecided). Related: NV-45, NV-48, NV-49 (Meta is permanent: settled, built).
- **Disagreement.** 0068 says "the root Space is never closable". `CONTEXT.md` says Exit closes an open Space "whether it was Entered or opened directly", and that Meta is always listed. The code refuses Exit only for Meta (`meta-space-permanent`). A Space opened directly by its product URL, with Meta closed, can be exited, and exiting the last open Space leaves nothing on the canvas and no command surface to recover from.
- **Reading of 0068.** "The root Space" plausibly meant the root of the Entering chain, which is Meta today. On that reading 0068 and the code agree that Meta is permanent, and the open question is only what exiting the last open Space does, which no source decides.
- **Options.** All three keep Meta permanent.
  - (a) Nothing else is permanent, and exiting the last open Space leaves an empty canvas, as the code does.
  - (b) Nothing else is permanent; exiting the last open Space opens Meta directly, with no Opener.
  - (c) The Space a session first opened is also permanent.
- **Recommended: (b).** It keeps `CONTEXT.md`'s Meta rule and Exit for directly opened Spaces, and never leaves the author with nothing. (b) is not built.
- **Evidence.** `app/src/open-spaces.ts` `exit` (Meta check only) and `followActiveSpace` ("Exiting the last Space leaves nothing on the canvas"); `app/src/components/OpenSpacesApplication.tsx` renders only open entries; `app/src/dock-chrome.ts` `exitDisabled`; `app/test/open-spaces.test.tsx` › "never exits the permanent Meta Space". Exiting the last open Space is untested.

## C2. Does Graph navigation on the canvas follow traversal rules?

- **Rules.** NV-13 (undecided); the Terms "Navigation" and "Active Resource".
- **Disagreement.** `CONTEXT.md` ("Graph navigation", "Traversal history", "Active Resource") says Graph navigation uses the same fork, merge, cycle and backtracking rules as presenting, and records a Traversal history. The code moves the selection to a Resource joined by an Active Graph Edge in either direction, chosen by the arrow pressed, and keeps no history: Traversal history exists only while presenting (`NavigationState`). 0041 defines Graph navigation only as "a transient working interaction" and does not decide between them.
- **Options.**
  - (a) Keep the code: spatial neighbours along Active Graph Edges either way, no history. Change `CONTEXT.md`.
  - (b) Make Graph navigation follow outgoing Edges with a Traversal history, as presenting does.
- **Recommended: (a).** It is built and tested, an author on the canvas moves in space rather than along a talk, and `docs/agents/rendering.md` records it as the one deviation from React Flow's interaction model ("on the canvas's own Map a plain arrow … follows the Active Graph's Edge that way").
- **Evidence.** `app/src/graph-navigation.ts`; `app/test/graph-navigation.test.ts` › "joins Edges either way, once each, in Edge order"; `app/e2e/keyboard-shortcuts.spec.ts` › "the arrow keys follow the Active Graph, and Shift and an arrow move the Resource"; `app/src/navigation.ts` (`NavigationState` holds `traversalHistory` only in `presenting`).

## C3. Does a `refused` save count as rejected for the Open Spaces mark and Exit?

- **Rules.** NV-84 (undecided). Related: NV-46, NV-86.
- **Disagreement.** 0068 says an entry is marked for `conflicted`, `failed` or `rejected` "and nothing else", and that Exit warns only on `rejected`. The editing guide (ED-48) adds `refused` (the backend refused the whole aggregate) as a separate status that recovers as `rejected` does. The code marks `refused` with the rejected word and warns on it at Exit. Drafting rule 1 does not apply: ED-48's source is a guide, not a later ADR.
- **Options.** (a) Treat `refused` as rejected for both, as the code does, and record it in 0068's place. (b) Neither mark nor warn on `refused`.
- **Recommended: (a).** Both states mean only a further Edit recovers the Space, which is exactly what the mark and the warning are about.
- **Evidence.** `app/src/dock-model.ts` `UNWELL_STATUS` (`refused: 'rejected'`); `app/src/open-spaces.ts` `retireOpenSpace`; `app/test/dock-report.test.ts` › "in the words `openSpaceStatusLabel` decides"; `app/test/open-spaces.test.tsx` › "warns before exiting refused work and permits an explicit exit".
