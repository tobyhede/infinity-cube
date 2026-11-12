# Lanes are laid out from the centre out, each direction on its own left

Status: accepted
Refines: 0100, 0103, 0105
Related: 0087, 0105, 0112

ADR 0100 gave each Graph sharing a pair of Resources its own lane. The Active Graph took the centre and connected, and every other Graph's Edge stacked on one side of it and stopped short, even where it was alone in its pair. ADR 0103 fixed the side of an offset to the screen, whichever way the Edge travelled. Three things read wrong. A Resource the Active Graph does not reach showed its connections as fragments, so it read as disconnected from the Graph it is in. An Edge and its reverse sat in one stack, on sides chosen by Resource id rather than by the way they travel. And every head was sized in stroke widths (ADR 0105), about twelve units across on a receding 2-unit line and about seventeen on the Active Graph's 3-unit line, wider than the 8-unit lane: each head reached over the lines beside it.

## The decision

- **Each direction of a pair is ranked on its own.** In each direction between two Resources, the Active Graph's Edge counts first, then the other Graphs' Edges in the Map's Graph order. With no Graph active, Graph order alone decides.
- **The first runs anchor to anchor, and each further one is one trim increment shorter.** It leaves one more tenth of its length undrawn at each end per rank, up to three tenths. These values are new: ADR 0100 left a flat fifth undrawn at each end of every Edge outside the Active Graph. An Edge alone in its direction is therefore full length whichever Graph is active.
- **A pair running one way keeps ADR 0100's layout.** The first Edge takes the centre line, and the rest stack outwards on one side, in rank order. The side is ADR 0103's, fixed to the screen: below an Edge between left and right anchors and right of one between top and bottom anchors, whichever way it travels. Only the lengths change.
- **A pair running both ways stacks each direction on its own left of travel.** The first Edge in each direction runs half a gap from the centre, and each further one runs a gap further out. A rightward Edge sits above its reverse, and a downward Edge sits to the screen's right of its reverse.
- **An Active Graph running a pair both ways is one line with a head at each end.** Its two Edges share the centre line, and each direction's other Edges stack outwards from it on that direction's left.
- **The gap beside the Active Graph's Edge is 12 units, and every other gap 8.** Neighbouring lanes run `ACTIVE_LANE_SPACING` (12) apart beside the Active Graph's Edge, which clears its full-size head, and `GRAPH_LANE_SPACING` (8) apart everywhere else. Where the two directions' first Edges are split either side of the centre, they run half the wider of their two gaps from it.
- **While a Graph is active, every other Graph's Edge is a hairline with a small head.** It is a 1-unit line in its Graph's colour at 0.8 opacity, ending in its Graph's head shape at one fixed size, about seven units across, whatever its stroke. The Active Graph's Edges keep their 3-unit line and a head sized in stroke widths. With no Graph active, every Edge is drawn as before: a 2-unit line at full strength with a head sized in stroke widths.
- **A two-way pair's offset is relative to the direction of travel.** There a positive offset is the Edge's own left as it travels from source to target. The Edge turns it into a screen side from the sides and positions it resolves while drawing, so the side stays right during a drag, when the projection does not run again. A one-way pair and a loop keep ADR 0103's screen-fixed sign. Spans, bridges and the translate fallback are unchanged.
- **Loops on one Resource nest outwards from it,** as before: the Active Graph's innermost, then the rest outwards in Graph order, with the same gaps. Their lengths are ranked like any other direction.
- **Activating a Graph brings its Edges to the centre.** Lanes move when the Active Graph changes, and the others recede to hairlines. Colour, paint order and head shapes do not change.

## Why

- **The centre is where the connection is read.** The Active Graph is the narrative being followed, so its Edge sits where a lone Edge would: on the anchors, with its arrowhead, Title and toolbar there.
- **A one-way pair already read correctly.** Its layout was never the problem, so it is left as authors know it, and only its lengths follow the rank.
- **Length ranks a bundle without hiding membership.** A trim increment per rank tells a bundle's Edges apart beside colour and head shape (ADR 0105), and no Edge stops short unless another Edge in its direction is drawn before it.
- **Direction is read from the side, as on a road.** Opposite directions on opposite sides make a two-way pair two readable stacks rather than one mixed one.
- **Only the Active Graph's heads need to be large.** The heads that recede are read for their shape, to match a Graph in the legend, and a small fixed head keeps its shape on a hairline while staying inside its lane. The gap opens only where a full-size head needs it, so bundles grow by four units per Active Graph Edge rather than everywhere.
- **The Active Graph running both ways is one connection.** Two full-size heads half a lane apart crowd each other; one line with a head at each end reads as the two-way connection it is.

## Rejected

- **Every inactive Edge stopping short (ADR 0100).** Resources the Active Graph does not reach read as disconnected.
- **Lanes in Graph order whichever Graph is active.** Lanes stay still on activation, but the Active Graph's Edge leaves the centre, taking its arrowhead, Title and toolbar off the anchors. This reintroduces the defect `.scratch/graph-lanes/issues/02` fixed.
- **Alternating a one-way pair's lanes either side of the centre.** It centres the bundle between its anchors, but it changes a layout that was not wrong and moves every one-way bundle on every Map.
- **Reading every offset by the direction of travel.** A one-way bundle would flip to the other side of its Active Graph's Edge whenever its Resources swapped places.
- **Splitting a two-way pair by Resource id (`.scratch/graph-lanes/issues/02`).** It picks a side that means nothing to the reader.
- **Ranking a pair as a whole rather than each direction.** A reverse Edge alone in its direction would stop short beside Edges going the other way, and its direction would be read only from its head.
- **Shortening at the tail only, so every head reaches its target.** That was a reading of an ASCII sketch, not a requirement.
- **Wider lanes everywhere, to clear every head.** Every bundle grows by half again, and the receding heads stay as loud as the Active Graph's.
- **Smaller heads for every Graph, at tiered gaps.** The Active Graph's head is the one being followed, so it keeps its full size.
- **One line per direction, the other Graphs shown on it as dots, ticks or a count.** It hides which Resources each other Graph joins until hovered, and it moves far from the layout authors know.
- **Stopping the Active Graph's two-way line short by a head's length at each end.** Its heads no longer meet their Resources, and the line reads as two Edges again.

## Cost accepted

- **Lanes move when the Active Graph changes.** The Active Graph's Edges are always centred, so activating another Graph rearranges every bundle it is in.
- **A one-way bundle sits on one side of its anchors.** Its outer lanes are all below or right of the Active Graph's Edge.
- **A one-way bundle's first outer lane moves from 8 to 12 units out** while its Active Graph is in it.
- **A hairline is harder to hit.** Selecting another Graph's Edge needs a closer pointer, though its interaction path is unchanged.
- **Past three tenths, length stops ranking.** A fifth Graph and beyond in one direction share the shortest length, and colour and head shape tell them apart.

Delivery is `.scratch/graph-lanes/spec-centre-out-lanes.md`; the heads, hairlines and gaps are `.scratch/graph-lanes/issues/09`.
