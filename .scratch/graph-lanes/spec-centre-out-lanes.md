# Lanes are laid out from the centre out

Status: in-progress

## Problem Statement

Where several Graphs join the same pair of Resources, each Graph's Edge is drawn in its own lane (ADR 0100), and the author reads the bundle to see which Graphs make that connection and which one is active. The rule that places and shortens those lanes has stopped saying what the author needs.

- **Inactive Edges looked disconnected.** Every Edge outside the Active Graph stopped short, including where it was alone in its pair, so a Resource the Active Graph does not reach looked unconnected to the Graph it is actually in.
- **The Active Graph's Edge left the centre.** One attempt at fixing that put the lanes in Graph order whichever Graph was active. With Mid or Short active, the full-length line sat 8 or 16 flow units off the anchors, and its arrowhead, Title and toolbar went with it. This reintroduced the defect `issues/02` had fixed.
- **Direction was arbitrary.** An Edge and its reverse shared one stack, and which side each took came from Resource ids rather than from the way it travels.

## Solution

Lanes are laid out from the centre out, and length is ranked in each direction separately.

- **Rank.** In each direction between two Resources, the Active Graph's Edge counts first, then the other Graphs' Edges in the Map's Graph order. The first runs anchor to anchor. Each one after it leaves one more tenth of its length undrawn at each end, up to three tenths. Both values are new: today every Edge outside the Active Graph leaves a flat fifth undrawn at each end (ADR 0100).
- **One direction only.** Where every Edge in the pair runs the same way, the layout is as it was: the first takes the exact centre, and the rest stack one lane further out each on one side, below a horizontal Edge and right of a vertical one, whichever way they travel. Only the lengths change.
- **Both directions.** Where the pair has Edges both ways, each direction stacks on its own left of travel. The first in each direction runs half a gap from the centre, and each further one runs a gap further out. A rightward Edge sits above its reverse, and a downward Edge sits on the screen's right of its reverse. Where the Active Graph holds both directions, its two Edges share the centre as one line with a head at each end, and each direction's others stack outwards from it.
- **Gaps.** Neighbouring lanes run 12 flow units apart beside the Active Graph's Edge, to clear its full-size head, and 8 apart everywhere else. Where the two directions' first Edges are split either side of the centre, they run half the wider of their two gaps from it.
- **Loops.** Several Graphs' self-Edges on one Resource nest outwards from the Resource, as they did. The Active Graph's loop is innermost and full length, and the rest follow in Graph order, one trim increment shorter each.
- **Activation moves lanes and recedes the rest.** Changing the Active Graph brings its Edges to the centre. While a Graph is active every other Graph's Edge is a 1-unit hairline at 0.8 opacity with a small fixed head; the Active Graph keeps its 3-unit line and a head sized in stroke widths. With no Graph active every Edge is a 2-unit line at full strength. Colour, paint order and head shapes do not change.

This is recorded as ADR 0142, which refines ADR 0100 (which Edges shorten, and the two-way layout), ADR 0103 (in a two-way pair the side of an offset follows the direction of travel) and ADR 0105 (a receding Edge's head is small).

## User Stories

1. As an author, I want an Edge of a Graph that is not active to be drawn anchor to anchor where no other Graph joins that pair, so that every Resource visibly connects to the Graphs it is in.
2. As an author, I want the Active Graph's Edge to always run anchor to anchor, so that the Graph I am working on reads as connected everywhere.
3. As an author, I want the Active Graph's Edge to sit on the centre line between its anchors where its pair runs one way, so that the line I am working on reads as the connection itself.
4. As an author, I want the Active Graph's arrowhead to land on the middle of the target's anchor where its pair runs one way, or where it runs the pair both ways, so that its head reads as reaching that Resource.
5. As an author, I want the Active Graph's Edge Title and toolbar to sit on the centre line where its pair runs one way, or where it runs the pair both ways, so that its controls are where its connection is.
6. As an author, I want a pair whose Edges all run one way to keep the layout I already know, so that only its lengths change.
7. As an author, I want each further Graph on a pair to be one trim increment shorter than the one before it in that direction, so that I can tell the bundle's Edges apart by length as well as colour.
8. As an author, I want the shortening to stop at three tenths at each end, so that even a large bundle's shortest Edge still visibly spans its pair.
9. As an author, I want the Graphs after the Active one to take their places in the Map's Graph order, so that the bundle follows the order I authored.
10. As an author, I want the Active Graph's Edge to move to the centre when I activate its Graph, so that the emphasised connection is always the centred one.
11. As an author, I want Edges running opposite ways between two Resources to sit on opposite sides of the centre, so that I can read each direction as its own stack.
12. As an author, I want each direction to keep to its own left of travel, so that rightward Edges sit above leftward ones and downward Edges sit to the right of upward ones, as consistently as traffic.
13. As an author, I want the first Edge in each direction to run half a gap from the centre, so that the two directions' full-length lines sit together around the centre line.
14. As an author, I want each direction ranked on its own, so that a reverse Edge alone in its direction is full length even beside a longer bundle running the other way.
15. As an author, I want an Active Graph holding both directions of a pair drawn as one line on the centre with a head at each end, so that its two-way connection reads as one, with no two full-size heads crowding each other.
16. As an author, I want a reverse Edge to keep its side while I drag one of its Resources across the other, so that the stack doesn't flip to the wrong side mid-drag.
17. As an author, I want several Graphs' loops on one Resource to nest with the Active Graph's innermost, so that the Graph I am working on is the loop nearest the Resource.
18. As an author, I want the gap beside the Active Graph's Edge wide enough to clear its full-size head, and every other gap to stay 8 units, so that no head reaches over a neighbouring line and a bundle still reads as one connection carried by several Graphs.
19. As an author, I want lanes to stay parallel along the whole curve, as ADR 0103 draws them, so that the new layout changes where lanes go but not how they bend.
20. As an author, I want the Graphs that are not active drawn as hairlines with small heads while one is active, and colours unchanged, so that the Active Graph reads first and the others stay legible by colour and head shape.
21. As an author, I want the Active Graph's Edges still painted on top, so that its stroke wins wherever lanes cross.
22. As an author, I want every Edge to keep its Graph's head shape whatever its length, so that Graphs stay distinguishable without colour (ADR 0105).
23. As a presenter, I want a Map drawn inside a Space Resource to lay out its lanes by the same rule, so that a Map reads the same wherever it is drawn (ADR 0112).
24. As a developer, I want the whole ranking and placement rule decided in one module from the Edges and the Active Graph, so that a change to it touches one function and its tests.
25. As a developer, I want the side of a lane decided from the direction the Edge travels at the moment it is drawn, so that it stays right during a drag, when the projection does not run again.
26. As a developer, I want the rule recorded in ADR 0142 and in the canvas rendering guide, so that the next reader doesn't take ADR 0100's old rule as current.

## Implementation Decisions

- **The lane module decides rank, lane and length.** `graphLanes` takes the drawn Edges, each with its Graph, and the Active Graph, and answers each Edge's lane offset, its pair's reach and its end trim. Inside each pair it groups Edges by direction, orders each direction with the Active Graph's Edge first and then Graph order, and assigns:
  - **one direction:** the first on the centre and the rest stacked outwards, read on the screen (`side: 'screen'`), as before.
  - **gaps:** each Edge sits one gap further out than the one before it in its direction: `ACTIVE_LANE_SPACING` (12) beside the Active Graph's Edge, `GRAPH_LANE_SPACING` (8) otherwise. Offsets are in flow units.
  - **both directions:** each direction starts half the wider of its two innermost gaps from the centre, or on it where both innermost Edges are the Active Graph's, and stacks outwards from there, read by travel (`side: 'travel'`). The opposite direction lands on the opposite side because the sign is relative to travel.
  - **loops (source equals target):** as one direction, read on the screen, nesting outwards.
  - **trim:** rank × the trim increment of a tenth, capped at three tenths. Both values are new, and they replace the flat fifth (`DETACHED_END_TRIM`) every Edge outside the Active Graph leaves today.
  - **reach:** the largest magnitude of any offset in the pair, so every lane of a pair is offset over the same stretch of curve (ADR 0103).
- **A two-way pair's offset is relative to the direction of travel.** Each lane says how its offset is read. In a two-way pair a positive offset is the Edge's left as it travels from source to target, and the lane geometry turns that into a screen side from the side the Edge leaves, which the facing rule always resolves opposite for an Edge and its reverse, so a rightward or upward Edge runs on the opposite screen side from its leftward or downward reverse. A one-way pair and a loop keep the screen-fixed sign, so that conversion is the one geometric change. Bridges, spans and the translate fallback (ADR 0103) take the converted offset exactly as they take one today. Loops keep their own geometry.
- **The projection copies the lane and recedes the rest.** `projectGraphEdges` hands each Edge its offset, reach and trim. While a Graph is active it draws every other Graph's Edge at `RECEDING_STROKE_WIDTH` (1) and `OTHER_GRAPH_OPACITY` (0.8) with its `small` head marker; colour and paint order are kept. Graph order reaches the lane module as the order the Map's Graphs give their Edges, which it already does.
- **The Active Graph argument is required.** The lane module takes the Active Graph, or none, explicitly, with no default.
- **Records.** ADR 0142, "Lanes are laid out from the centre out, each direction on its own left", refines ADR 0100 and ADR 0103. Their status lines gain `Refined by: 0142`, and the ADR index gains its row. It records the rejected alternatives and their costs:
  - every inactive Edge stopping short (ADR 0100), which made reached Resources look disconnected
  - lanes in Graph order whichever Graph is active, which keeps lanes still but takes the Active Graph off the centre
  - alternating a one-way pair's lanes either side of the centre, which changes a layout that was not wrong
  - reading every offset by travel, which flips a one-way bundle when its Resources swap places
  - splitting the centre by Resource id (`issues/02`), which picks a side without meaning
  - shortening at the tail only, which was rejected as a reading of the sketch rather than a requirement

  The canvas rendering guide gains a short lanes section stating the current rule and citing ADR 0142, since the Maps and Graphs contract already sends readers there for lanes.

## Testing Decisions

- A good test states a drawing rule in terms an author sees, with Edges by Graph and Resource and which Graph is active, and checks the answer, not how it was computed.
- **The lane module** is the rule's seam. Cover:
  - each case: a lone Edge, one direction with two to five Graphs, the Active Graph in every position of Graph order, both directions with unequal counts, an Active Graph holding both directions, the Active Graph absent from the pair, no Active Graph, loops, and the trim cap
  - reach
  - that activation alone moves lanes

  Prior art: the existing `graphLanes` tests.
- **The lane geometry** is the side's seam. A positive offset draws on the left of travel in all four directions, rightward, leftward, downward and upward. The existing ADR 0103 distance properties keep passing with offsets of both signs. Prior art: the existing `laneBezier` tests and properties.
- **The projection** gets one test that each Edge carries its lane, and one that changing the Active Graph moves the centre. Prior art: the existing `projectGraphEdges` lane tests.
- **The browser** suite is the end-to-end check. Cover:
  - the fixture's Long, Mid and Short over A → B: the Active Graph centred and full length, the rest stacked below and shortening, and the centre moving when Mid and then Short is activated; the same stacked vertically; a lone Edge and a pair the Active Graph is not in
  - B → A Edges that the test draws itself, one and then two, to show the two directions stacking on opposite sides with each Graph active, the Active Graph running both ways on the centre, stacked vertically and mid-drag
  - a receding Graph's head drawn small and painted at its Edge's opacity
  - three loops on one Resource, nesting outwards with the Active Graph innermost

  The tracked fixture does not change. Prior art: the existing Edge attachment browser spec.

## Out of Scope

- Colour, paint order and head shapes. Receding opacity, stroke widths, head size and lane spacing were out of scope here and are `issues/09`'s.
- Edge receding while the Active Graph has no Edges, and the gathering of Graph drawing policy into one module. Both were discussed in the earlier `graphDrawing` design and are separate work.
- Edge anchors and the facing rule (ADR 0087, ADR 0110).

## Further Notes

- This replaces `issues/02`'s centring rule. That ticket stays resolved as history.
- All of this ships on PR #455, which is reset to `main` and rebuilt from this spec.
- `issues/09` revises this spec after review on #455: the gap beside the Active Graph's Edge opens to 12 to clear its full-size head, an Active Graph running a pair both ways is drawn as one line on the centre with a head at each end, and while a Graph is active the others are hairlines with small heads. Where this spec says "a lane", read the gap that ticket gives.
- `issues/06` and `issues/07` first changed the one-way layout too, alternating it either side of the centre and reading its side by travel. That was never in scope. `issues/08` restores it and records the approved design canvas.
