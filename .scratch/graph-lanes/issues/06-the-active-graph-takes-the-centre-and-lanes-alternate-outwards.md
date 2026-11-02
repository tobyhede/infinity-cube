# 06: The Active Graph takes the centre, and lanes alternate outwards from it

**What to build:** Where every Edge between two Resources runs one way, the Active Graph's Edge is drawn on the centre line, anchor to anchor. The other Graphs' Edges alternate outwards from it, one lane apart, starting on the positive side, each a step shorter than the one before in Graph order. Where a pair has Edges both ways, each direction's first Edge runs half a lane from the centre and the rest step outwards, with the direction whose source sorts first on the negative side, as `issues/02` did. That keeps the bundle drawable until 07 makes the positive side each Edge's own left. Activating another Graph moves its Edge to the centre. An Edge alone in its pair runs anchor to anchor whichever Graph is active. Several Graphs' loops on one Resource nest outwards with the Active Graph's innermost and full length. Colour, opacity, stroke width, paint order and head shapes are unchanged. The whole rule is recorded now, in ADR 0142 and the canvas rendering guide, because every part of it is decided. Spec: `../spec-centre-out-lanes.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The lane module ranks each direction of a pair with the Active Graph's Edge first, then Graph order. It places a one-direction pair at 0, +1, −1, +2 … lanes by rank, a two-direction pair at ±(rank + ½) lanes with the direction whose source sorts first negative, and loops at 0, 1, 2 … lanes by rank. Each rank trims one step more, capped as today. It takes the Active Graph, or none, as a required argument.
- [ ] Reach is the largest offset magnitude in the pair.
- [ ] Lane module tests cover: a lone Edge; one direction with two to five Graphs; both directions with no two Edges sharing a lane; the Active Graph at each position of Graph order; the Active Graph absent from the pair; no Active Graph; loops; the trim cap; and that activation alone moves lanes.
- [ ] Projection tests check that each Edge carries its lane and that activation moves the centre. Colour, opacity, stroke, paint order and head-marker tests pass unchanged.
- [ ] The browser spec, on the fixture's Long, Mid and Short over A → B, checks that the Active Graph runs centred and full length with Long, then Mid, then Short active, and that the rest alternate either side and shorten in Graph order. It also checks that Long's D → A′ runs anchor to anchor with Mid active.
- [ ] ADR 0142 "Lanes are laid out from the centre out, each direction on its own left" is written with its rejected alternatives and costs. ADR 0100 and ADR 0103 gain `Refined by: 0142`, and the ADR index gains its row.
- [ ] The canvas rendering guide has a lanes section stating the current rule and citing ADR 0142.
- [ ] Before-and-after screenshots of A → B with each Graph active.
- [ ] Targeted local checks pass on Node 26, and `CI passed` is green on #455.
