# An Edge stops short only beside the Active Graph

Status: accepted
Refines: 0100
Related: 0135

ADR 0100 has every Edge of a Graph other than the Active one stop short, leaving a fifth of its length undrawn at each end, "even where it is alone in its pair, so the rule reads the same everywhere on the canvas". Looking at a Map whose Active Graph reaches only part of it, that rule cut the other Graphs into fragments: a Resource the Active Graph does not reach showed its connections as short strokes in open space, and read as joined to nothing, although its own Graph joins it to its neighbours.

**An Edge stops short only where the Active Graph has an Edge between the same two Resources**, in either direction. There the Active Graph's Edge carries the connection, and the stopped-short Edge beside it is a reading of which Graphs also join the pair, as ADR 0100 says. Every other Edge runs anchor to anchor at its normal length: an Edge joining a pair the Active Graph does not join, and so every Edge of a Resource the Active Graph does not reach. While no Graph is active nothing stops short, as before.

Recession is unchanged: another Graph's Edges still recede by opacity and a narrower stroke, and a Resource the Active Graph does not reach still recedes (ADR 0135). The lanes are unchanged too: where the Active Graph has no Edge in a pair, the first Edge keeps the centre and the rest run beside it, all of them connecting.

Rejected: keeping ADR 0100's uniform rule. Its uniformity is a property of the drawing, not of what it says, and what it said about an unreached Resource was wrong.

What this does not touch: nothing is stored, and colours, head shapes (ADR 0105), lane offsets (ADR 0103) and the trim's length are unchanged. `graphLanes` decides whether an Edge connects from its pair alone.
