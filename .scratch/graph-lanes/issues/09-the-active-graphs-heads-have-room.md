# 09: The Active Graph's heads have room, and the others recede to hairlines

**What to build:** Every head was sized in stroke widths, about twelve units across on a receding 2-unit Edge and about seventeen on the Active Graph's 3-unit one, inside 8-unit lanes, so heads reached over the lines beside them, worst between two directions of a two-way pair. While a Graph is active, every other Graph's Edge is drawn as a hairline: a 1-unit line in its colour at 0.8 opacity with its head shape at one small fixed size, about seven units across. The Active Graph keeps its 3-unit line and full-size head. The gap beside the Active Graph's Edge opens to 12 units so its head clears the next line, and every other gap stays 8. Where the Active Graph runs a pair both ways, its two Edges share the centre as one line with a head at each end, and each direction's others stack outwards from it. Lane sides and ranked lengths are `08`'s, unchanged. With no Graph active nothing changes from `main`. Spec: `../spec-centre-out-lanes.md`, revised by this ticket; ADR 0142.

The design was chosen as "D4c · D4b, active overlaid" on the design canvas: https://claude.ai/artifact/MN2qGZrQja1fZETsXSgU4M

**Blocked by:** 08 (A pair running one way keeps its layout).

**Status:** in progress

- [x] `graphLanes` places lanes in flow units: `ACTIVE_LANE_SPACING` (12) beside the Active Graph's Edge and `GRAPH_LANE_SPACING` (8) elsewhere; a two-way pair's directions start half the wider of their innermost gaps from the centre, or on it where both are the Active Graph's.
- [x] `edge-lanes.test.ts` rows in flow units, plus a property that nothing in a direction sits closer than `ACTIVE_LANE_SPACING` to the Active Graph's Edge.
- [x] `GraphHeadMarker` takes a `size`: `full` in stroke widths, `small` fixed in user space. `graphHeadMarkerId` names a `-small` marker beside each Graph's full one, and `GraphHeadMarkers` draws each named size.
- [x] `projectGraphEdges` draws a receding Edge at `RECEDING_STROKE_WIDTH` (1) and `OTHER_GRAPH_OPACITY` (0.8) with a `small` head, and carries `headSize` on the Edge's data.
- [x] `edge-attachment.spec.ts`: lanes in flow units for one-way and two-way pairs and loops, an Active Graph running both ways overlaid, and a receding head small and painted at its Edge's opacity.
- [x] ADR 0142, the ADR index, `rendering.md` and the spec say so.
- [ ] `CI passed` is green on #455.
