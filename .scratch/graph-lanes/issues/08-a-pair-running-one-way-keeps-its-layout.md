# 08: A pair running one way keeps its layout

**What to build:** Where every Edge between two Resources runs one way, and for loops on one Resource, the layout is the one `main` draws: the Active Graph's Edge on the centre line, and the rest one lane further out each on one side, below a horizontal Edge and right of a vertical one, whichever way they travel. Only their lengths follow the rank: the first in the direction full length, each further one a tenth shorter at each end, up to three tenths. `06` alternated the one-way lanes either side of the centre and `07` read their side by travel; both were out of scope. Pairs running both ways keep `07`'s rule: each direction on its own left of travel from half a lane out, the first in each direction full length. Spec: `../spec-centre-out-lanes.md`.

The rule was approved against a design canvas that draws every case beside `main`, each marked same or differs: https://claude.ai/artifact/16yFHPJSE7ELn7LpagbU1d

**Blocked by:** 07 (Each direction keeps to its own left).

**Status:** resolved

- [x] Each lane says how its offset is read: `screen` for a one-way pair and a loop, `travel` for a two-way pair. `laneBezier` takes it and converts only a `travel` offset.
- [x] `graphLanes` places a one-way pair and loops at rank r lanes, read on the screen, and a two-way pair at r + ½ lanes, read by travel. Lengths are ranked per direction everywhere.
- [x] `edge-lanes.test.ts` has one row per case on the design canvas (29), plus properties that each direction has exactly one full-length Edge, the Active Graph's or else the first in Graph order, and that no two Edges of one direction share a lane.
- [x] `laneBezier` tests: a `screen` offset is below or right in all four directions of travel, a `travel` offset is on the left of travel in all four, and `screen` is the default.
- [x] `edge-attachment.spec.ts`: a one-way pair with each Graph active, a lone Edge, a pair the Active Graph is not in, and the same stacked vertically; a two-way pair with three Edges one way and one then two the other, with each Graph active, stacked vertically and mid-drag; three loops with two Graphs active in turn. No Graph active is reachable only in the unit tests.
- [x] ADR 0142, the ADR index, `rendering.md` and the spec say a one-way pair keeps its layout.
- [x] `CI passed` is green on #455 (`2f8685d`).
