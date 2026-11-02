# Lanes are laid out from the centre out

Status: ready-for-agent

## Problem Statement

Where several Graphs join the same pair of Resources, each Graph's Edge is drawn in its own lane (ADR 0100), and the author reads the bundle to see which Graphs make that connection and which one is active. The rule that places and shortens those lanes has stopped saying what the author needs.

- **Inactive Edges looked disconnected.** Every Edge outside the Active Graph stopped short, including where it was alone in its pair, so a Resource the Active Graph does not reach looked unconnected to the Graph it is actually in.
- **The Active Graph's Edge left the centre.** One attempt at fixing that put the lanes in Graph order whichever Graph was active. With Mid or Short active, the full-length line sat 8 or 16 flow units off the anchors, and its arrowhead, Title and toolbar went with it. This reintroduced the defect `issues/02` had fixed.
- **Bundles were lopsided.** Every lane after the first stacked on one side of the centre line, so a bundle the Active Graph is not in sat off to one side of the line between its anchors.
- **Direction was arbitrary.** An Edge and its reverse shared one stack, and which side each took came from Resource ids rather than from the way it travels.

## Solution

Lanes are laid out from the centre out, and length is ranked in each direction separately.

- **Rank.** In each direction between two Resources, the Active Graph's Edge counts first, then the other Graphs' Edges in the Map's Graph order. The first runs anchor to anchor. Each one after it leaves one more tenth of its length undrawn at each end, up to three tenths. That is the same step and cap as today.
- **One direction only.** Where every Edge in the pair runs the same way, the first takes the exact centre. The rest alternate outwards one lane apart, starting on the keep-left side.
- **Both directions.** Where the pair has Edges both ways, each direction stacks on its own left of travel. The first in each direction runs half a lane from the centre, and each further one runs a lane further out. A rightward Edge sits above its reverse, and a downward Edge sits on the screen's right of its reverse. Where the Active Graph holds both directions, both its Edges are the innermost pair.
- **Loops.** Several Graphs' self-Edges on one Resource nest outwards from the Resource. The Active Graph's loop is innermost and full length, and the rest follow in Graph order, a step shorter each.
- **Activation moves lanes.** Changing the Active Graph brings its Edges to the centre. Colour, opacity, stroke width, paint order and head shapes do not change.

This is recorded as ADR 0142, which refines ADR 0100 (lane order and which Edges shorten) and ADR 0103 (the side of an offset follows the direction of travel).

## User Stories

1. As an author, I want an Edge of a Graph that is not active to be drawn anchor to anchor where no other Graph joins that pair, so that every Resource visibly connects to the Graphs it is in.
2. As an author, I want the Active Graph's Edge to always run anchor to anchor, so that the Graph I am working on reads as connected everywhere.
3. As an author, I want the Active Graph's Edge to sit on the centre line between its anchors where its pair runs one way, so that the line I am working on reads as the connection itself.
4. As an author, I want the Active Graph's arrowhead to land on the middle of the target's anchor, so that its head reads as reaching that Resource.
5. As an author, I want the Active Graph's Edge Title and toolbar to sit on the centre line, so that its controls are where its connection is.
6. As an author, I want the other Graphs on a pair to fan out evenly on both sides of the centre, so that the bundle stays centred between its two Resources.
7. As an author, I want each further Graph on a pair to be a step shorter than the one before it in that direction, so that I can tell the bundle's Edges apart by length as well as colour.
8. As an author, I want the shortening to stop at three tenths at each end, so that even a large bundle's shortest Edge still visibly spans its pair.
9. As an author, I want the Graphs after the Active one to take their places in the Map's Graph order, so that the bundle follows the order I authored.
10. As an author, I want the Active Graph's Edge to move to the centre when I activate its Graph, so that the emphasised connection is always the centred one.
11. As an author, I want Edges running opposite ways between two Resources to sit on opposite sides of the centre, so that I can read each direction as its own stack.
12. As an author, I want each direction to keep to its own left of travel, so that rightward Edges sit above leftward ones and downward Edges sit to the right of upward ones, as consistently as traffic.
13. As an author, I want the first Edge in each direction to run half a lane from the centre, so that the two directions' full-length lines sit together around the centre line.
14. As an author, I want each direction ranked on its own, so that a reverse Edge alone in its direction is full length even beside a longer bundle running the other way.
15. As an author, I want an Active Graph holding both directions of a pair to have both its Edges innermost, so that both its lines read as the centre of the bundle.
16. As an author, I want a reverse Edge to keep its side while I drag one of its Resources across the other, so that the stack doesn't flip to the wrong side mid-drag.
17. As an author, I want several Graphs' loops on one Resource to nest with the Active Graph's innermost, so that the Graph I am working on is the loop nearest the Resource.
18. As an author, I want the lanes to keep the same spacing as today, so that a bundle still reads as one connection carried by several Graphs.
19. As an author, I want lanes to stay parallel along the whole curve, as ADR 0103 draws them, so that the new layout changes where lanes go but not how they bend.
20. As an author, I want colours, receding opacity and stroke widths to stay as they are, so that which Graph is active still reads exactly as before.
21. As an author, I want the Active Graph's Edges still painted on top, so that its stroke wins wherever lanes cross.
22. As an author, I want every Edge to keep its Graph's head shape whatever its length, so that Graphs stay distinguishable without colour (ADR 0105).
23. As a presenter, I want a Map drawn inside a Space Resource to lay out its lanes by the same rule, so that a Map reads the same wherever it is drawn (ADR 0112).
24. As a developer, I want the whole ranking and placement rule decided in one module from the Edges and the Active Graph, so that a change to it touches one function and its tests.
25. As a developer, I want the side of a lane decided from the direction the Edge travels at the moment it is drawn, so that it stays right during a drag, when the projection does not run again.
26. As a developer, I want the rule recorded in ADR 0142 and in the canvas rendering guide, so that the next reader doesn't take ADR 0100's old rule as current.

## Implementation Decisions

- **The lane module decides rank, lane and length.** `graphLanes` takes the drawn Edges, each with its Graph, and the Active Graph, and answers each Edge's lane offset, its pair's reach and its end trim. Inside each pair it groups Edges by direction, orders each direction with the Active Graph's Edge first and then Graph order, and assigns:
  - **one direction:** rank 0 at offset 0, then ranks 1, 2, 3 … at +1, −1, +2, −2 … lanes. Positive is the keep-left side, so rank 1 sits on the keep-left side.
  - **both directions:** rank r at +(r + ½) lanes in each direction. The opposite direction lands on the opposite side because the sign is relative to travel.
  - **loops (source equals target):** rank r at r lanes, nesting outwards, as loops do today.
  - **trim:** rank × the step, capped. The step and cap keep their current values.
  - **reach:** the largest magnitude of any offset in the pair, so every lane of a pair is offset over the same stretch of curve (ADR 0103).
- **An offset is relative to the direction of travel.** A positive offset is the Edge's left as it travels from source to target. The lane geometry turns that into a screen side from the sides and positions it resolves while drawing. A rightward or upward Edge runs on the opposite screen side from its leftward or downward reverse. Today the sign is fixed to the screen whichever way the Edge travels, so that conversion is the one geometric change. Bridges, spans and the translate fallback (ADR 0103) take the converted offset exactly as they take one today. Loops keep their own geometry.
- **The projection copies the lane.** `projectGraphEdges` hands each Edge its offset, reach and trim, and keeps colour, opacity, stroke width, paint order and head marker as they are. Graph order reaches the lane module as the order the Map's Graphs give their Edges, which it already does.
- **The Active Graph argument is required.** The lane module takes the Active Graph, or none, explicitly, with no default.
- **Records.** ADR 0142, "Lanes are laid out from the centre out, each direction on its own left", refines ADR 0100 and ADR 0103. Their status lines gain `Refined by: 0142`, and the ADR index gains its row. It records the rejected alternatives and their costs:
  - every inactive Edge stopping short (ADR 0100), which made reached Resources look disconnected
  - lanes in Graph order whichever Graph is active, which keeps lanes still but takes the Active Graph off the centre
  - every further lane stacking on one side, which gives lopsided bundles
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
  - the fixture's Long, Mid and Short over A → B: the Active Graph centred and full length, the rest alternating and shortening, and the centre moving when Mid and then Short is activated
  - a B → A Edge that the test draws itself, to show the two directions stacking on opposite sides from half a lane out

  The tracked fixture does not change. Prior art: the existing Edge attachment browser spec.

## Out of Scope

- Colour, receding opacity, stroke widths, paint order and head shapes.
- Lane spacing, the trim step and the trim cap.
- Edge receding while the Active Graph has no Edges, and the gathering of Graph drawing policy into one module. Both were discussed in the earlier `graphDrawing` design and are separate work.
- Edge anchors and the facing rule (ADR 0087, ADR 0110).

## Further Notes

- This replaces `issues/02`'s centring rule. That ticket stays resolved as history.
- All of this ships on PR #455, which is reset to `main` and rebuilt from this spec.
