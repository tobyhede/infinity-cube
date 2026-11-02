# 07: Each direction keeps to its own left

**What to build:** Where Edges between two Resources run both ways, each direction stacks on its own left of travel. A rightward Edge sits above its reverse, and a downward Edge sits to the screen's right of its reverse. The first Edge in each direction, the Active Graph's where it runs that way, runs half a lane from the centre and full length. Each further one in that direction runs a lane further out and a step shorter. An Active Graph holding both directions has both its Edges innermost. The side follows the direction the Edge travels as it is drawn, so it stays right while a Resource is dragged. Spec: `../spec-centre-out-lanes.md`.

**Blocked by:** 06 (The Active Graph takes the centre, and lanes alternate outwards from it).

**Status:** ready-for-agent

- [ ] A positive lane offset is the Edge's left as it travels from source to target. The lane geometry turns it into a screen side for rightward, leftward, downward and upward travel. Bridges, spans and the translate fallback (ADR 0103) take the converted offset unchanged, and loops keep their own geometry.
- [ ] The lane module places a pair holding both directions at +(rank + ½) lanes in each direction, so the opposite direction lands on the opposite side by travel rather than by Resource id. A one-direction bundle's first alternate now falls on the keep-left side.
- [ ] Lane geometry tests show a positive offset on the left of travel in all four directions. The existing ADR 0103 distance properties pass with offsets of both signs.
- [ ] Lane module tests cover both directions with unequal counts, an Active Graph holding both directions, and the Active Graph in only one direction.
- [ ] The browser spec draws a B → A Edge on Collection 1. It checks that B → A runs below the A → B Edges, from half a lane out and full length, and that the A → B stack moves up to start half a lane above the centre. It also checks that the sides hold while A is dragged.
- [ ] The canvas rendering guide's lanes section covers the two-direction case, if 06 did not already.
- [ ] Screenshots of the two-direction case with each Graph active.
- [ ] Targeted local checks pass on Node 26, and `CI passed` is green on #455.
