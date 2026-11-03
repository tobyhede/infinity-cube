# Conflicts: Maps and Graphs

These are places where the sources and the code disagree and [../DECISIONS.md](../DECISIONS.md) does not settle the question. Every rule an open conflict touches has the status **undecided (Cn)** in [../maps-and-graphs.md](../maps-and-graphs.md). Conflict ids are never reused. Paths that start with `test/` are at the repo root; all others are under `packages/`.

## C1. Does switching Graphs record `defaultMap`?

- **Rules.** MG-46 (undecided). Related: MG-45, MG-79.
- **Disagreement.** DECISIONS 1 makes switching Graphs an Edit that writes `activeGraph`. MG-79 (from 0116) says an Edit that writes the canvas Map records it as `defaultMap`. The ruling does not say whether switching counts.
- **Options.** (a) Switching is an ordinary canvas Edit and records `defaultMap` too. (b) Switching writes only `activeGraph`, as a listed exception.
- **Recommended: (a).** DECISIONS 1 together with MG-79 implies it. Choose (b) only if the ruling meant "an Edit" narrowly.
- **Evidence.** `app/src/space-authoring.ts` (the common tail passes `opening: target.kind === 'canvas'`). In the code, switching writes nothing: `app/src/navigation.ts` `activateGraph`.

## C2. What does switching Graphs inside an Open Space Resource write?

- **Rules.** MG-47 (undecided). Related: MG-80.
- **Disagreement.** DECISIONS 1 says switching "writes the Map's `activeGraph`". 0068 r5 says the selection belongs to the Space Resource and changing it does not change the target's Active Graph. 0116 (MG-80) keeps a drawn Map's stored `activeGraph`. The code writes the Space Resource's selection.
- **Note.** DECISIONS 2 says "in every context, embedded included"; DECISIONS 1 does not. That supports (a).
- **Options.** (a) Write only the Space Resource's selection (an SR rule), so DECISIONS 1 covers the canvas only. (b) Write the target Map's `activeGraph`. (c) Write both.
- **Evidence.** `app/src/space-resource-context-commands.ts` (`select`); `app/test/edit-target.test.ts` › "keeps the Map’s stored Active Graph when it edits on the Graph it shows".

## C3. Is drawing an existing Edge unchanged or refused?

- **Rules.** MG-61 (undecided).
- **For unchanged:** 0032 ("drawing one live is an idempotent no-op"); 0104 line 15, the latest source ("Drawing an Edge that already exists still changes nothing"); `CONTEXT.md` "Edge" and "Edit".
- **For refused:** 0090 ("A Thing `edgeEligibility` refuses — for example an exact duplicate Edge — shows no seeking handles"); the code, which refuses with `edge-already-exists` and shows "These Resources are already connected in this Graph."
- **Why drafting rule 1 does not settle it.** The later ADR (0104) and the code disagree.
- **Options.** (a) Unchanged and silent. (b) Refused with a reason, and change `CONTEXT.md`.
- **Evidence.** `app/src/space-authoring.ts` `connectRefusal`; `app/test/edge-authoring.test.ts` › "answers a refusal to the list that asked, and leaves nothing on the canvas"; `app/test/space-authoring-operations.test.ts` › "drawing an existing titled Edge again changes nothing" (asserts only that the Space is unchanged).

## C4. Map and Graph lifecycle Edits against MG-79 and MG-80

- **Rules.** MG-11, MG-14, MG-81 (undecided); the Add Map, Delete Map and Delete Graph rows of the doc's opening-writes table.
- **Disagreement.** Under drafting rule 4, the code contradicts 0116 (MG-79, MG-80) in three places:
  1. Delete Graph on the canvas writes the canvas Map but does not record it as `defaultMap`. Delete Map records none, and moves `defaultMap` only when the deleted Map holds it.
  2. Delete Map picks its successor as the Map the deleting canvas shows, else `defaultMap`, else the first survivor. 0091 says "the target Space's resulting selected Diagram", naming no rule for choosing it. DECISIONS 2 sets the opposite principle for Graphs: the saved choice stays, else the first in list order.
  3. Add Map from an Open Space Resource runs on the target's canvas and sets the target's `defaultMap`, against MG-80.
- **Options.** For 1: (a) the deletions record `defaultMap` like any canvas Map Edit, or (b) they are listed exceptions. For 2: (a) keep the code's preference, or (b) mirror DECISIONS 2: `defaultMap` stays if it survives, else the first surviving Map. For 3: (a) Add Map from a drawn Map leaves the target's `defaultMap`, or (b) it is a listed exception.
- **Evidence.** `persistence/src/space-resource-planning.ts` `planContextDeletion`; `app/src/map-authoring-commands.ts` `preferredSurvivor`; `app/test/map-authoring-commands.test.ts` › "continues on the Space’s opening Map, where the Resources that selected the deleted Map go too", "points the embedding Space Resource at the created Map once both Spaces have saved".

## C5. Closed

0091 says "Graph deletion uses the resulting surviving Graph", parallel to "Diagram deletion uses the target Space's resulting selected Diagram". So a Space Resource follows the Graph the deletion leaves its Map on, and DECISIONS 2 fixes that Graph. MG-56 is therefore a bug, not a conflict.

## C6. Details with no source but the code

- **Rules.** MG-18, MG-48, MG-49 (undecided), plus the code-only details of MG-10 and MG-42.
- **Items:**
  - MG-10 and MG-42 details: N is one above the highest `Map N` or `Graph N`. `Graph N` is numbered over every Graph in the Space. Add Map's first Graph is always `Graph 1`, so two Maps can each hold a `Graph 1`. (`Map N` and `Graph N` themselves come from 0101 and 0109; `Graph 1` at a first working read comes from 0079 and 0080.)
  - MG-18: a position from a menu steps off an occupied point.
  - MG-48: the colour choice (farthest palette slot, dark slots first), and the fallback by order for a Graph that stores none.
  - MG-49: what "unchanged" compares with. Recolour compares with the stored colour. Choose head shape (0105), Choose Shape (0121) and Resize compare with what is drawn.
- **Disagreement.** Nothing contradicts these, but drafting rule 4 forbids adopting code behaviour silently.
- **Options.** For each item: (a) confirm it as a requirement, or (b) strike it to implementation detail. For MG-49 there is also (c): compare with what is drawn, as the other three do.
- **Evidence.** `app/src/titles.ts` `nextMapTitle`, `nextGraphTitle`; `graph/src/snapshot-edits.ts` `freeAnchor`; `graph/src/graph-color.ts` `nextGraphColor`, `graphColorsByGraphId`; `app/src/space-authoring.ts` (`recolored-graph` compares `completion.color === graph.color`).

## C7. Does an Edit that changes nothing else still write the opening fields?

- **Rules.** The doc's operations index ("Move: unchanged when C7") and the "Move to the same positions" row of the opening-writes table.
- **Disagreement.** `CONTEXT.md` ("Completion outcome") says a drag returned to where it began is unchanged. Most Edits answer unchanged early (same title, already Open, same Shape, same size, same colour), even when the canvas Map is not `defaultMap`. Move has no early check: it reaches the whole-snapshot comparison, so a Move to the same positions completes, and writes `defaultMap` and `activeGraph`, whenever those differ from the canvas. No ADR decides which is right.
- **Options.** (a) An Edit whose own change is nothing is unchanged, and writes nothing (add an early check to Move). (b) Any canvas attempt records the opening fields (then the early-unchanged arms are wrong).
- **Evidence.** `app/src/space-authoring.ts` (the `settled-resource-movement` arm, then `sameSnapshot(previousSnapshot, next)` after `updatePositionedMap`).
