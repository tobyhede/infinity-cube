# Lanes are laid out from the centre out, each direction on its own left

Status: accepted
Refines: 0100, 0103
Related: 0087, 0105, 0112

ADR 0100 gave each Graph sharing a pair of Resources its own lane. The Active Graph took the centre and connected, and every other Graph's Edge stacked on one side of it and stopped short, even where it was alone in its pair. ADR 0103 fixed the side of an offset to the screen, whichever way the Edge travelled. Both made the canvas say something the author did not mean. A Resource the Active Graph does not reach showed its connections as fragments, so it read as disconnected from the Graph it is in. Every bundle sat lopsided, off to one side of its anchors. An Edge and its reverse sat in one stack, on sides chosen by Resource id rather than by the way they travel.

## The decision

- **Each direction of a pair is ranked on its own.** In each direction between two Resources, the Active Graph's Edge counts first, then the other Graphs' Edges in the Map's Graph order. With no Graph active, Graph order alone decides.
- **The first runs anchor to anchor, and each further one is a step shorter.** It leaves one more tenth of its length undrawn at each end per rank, up to three tenths. An Edge alone in its direction is therefore full length whichever Graph is active.
- **A pair running one way is laid out from the centre out.** The first Edge takes the centre line. The rest alternate outwards one lane apart, starting on the keep-left side, then the other side, then the keep-left side one lane further, and so on.
- **A pair running both ways stacks each direction on its own left of travel.** The first Edge in each direction runs half a lane from the centre, and each further one runs a lane further out. A rightward Edge sits above its reverse, and a downward Edge sits to the screen's right of its reverse. An Active Graph holding both directions has both its Edges innermost.
- **An offset is relative to the direction of travel.** A positive offset is the Edge's own left as it travels from source to target. The Edge turns it into a screen side from the sides and positions it resolves while drawing, so the side stays right during a drag, when the projection does not run again. This replaces ADR 0103's screen-fixed sign. Its spans, bridges and translate fallback are otherwise unchanged.
- **Loops on one Resource nest outwards from it,** the Active Graph's innermost and full length, then the rest a lane further out and a step shorter each, in Graph order.
- **Activating a Graph brings its Edges to the centre.** Lanes move when the Active Graph changes. Colour, receding opacity, stroke width, paint order and head shapes do not change.

## Why

- **The centre is where the connection is read.** The Active Graph is the narrative being followed, so its Edge sits where a lone Edge would: on the anchors, with its arrowhead, Title and toolbar there.
- **Length ranks a bundle without hiding membership.** A step per rank tells a bundle's Edges apart beside colour and head shape (ADR 0105), and no Edge stops short unless another Edge in its direction is drawn before it.
- **Direction is read from the side, as on a road.** Opposite directions on opposite sides make a two-way pair two readable stacks rather than one mixed one.

## Rejected

- **Every inactive Edge stopping short (ADR 0100).** Resources the Active Graph does not reach read as disconnected.
- **Lanes in Graph order whichever Graph is active.** Lanes stay still on activation, but the Active Graph's Edge leaves the centre, taking its arrowhead, Title and toolbar off the anchors. This reintroduces the defect `.scratch/graph-lanes/issues/02` fixed.
- **Every further lane stacking on one side.** Bundles sit lopsided between their anchors.
- **Splitting a two-way pair by Resource id (`.scratch/graph-lanes/issues/02`).** It picks a side that means nothing to the reader.
- **Ranking a pair as a whole rather than each direction.** A reverse Edge alone in its direction would stop short beside Edges going the other way, and its direction would be read only from its head.
- **Shortening at the tail only, so every head reaches its target.** That was a reading of an ASCII sketch, not a requirement.

## Cost accepted

- **Lanes move when the Active Graph changes.** The Active Graph's Edges are always centred, so activating another Graph rearranges every bundle it is in.
- **Past three tenths, length stops ranking.** A fifth Graph and beyond in one direction share the shortest length, and colour and head shape tell them apart.

Delivery is `.scratch/graph-lanes/spec-centre-out-lanes.md`. Until its ticket 07 is resolved, offsets keep ADR 0103's screen-fixed sign, so a pair running one way alternates starting below or to the right, and a pair running both ways splits by Resource id.
