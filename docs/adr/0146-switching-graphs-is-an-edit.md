# Switching Graphs is an Edit

Status: accepted
Date: 2026-11-03
Refines: 0028, 0041, 0068, 0116
Related: 0040, 0079, 0112

ADR 0028 made activating a Graph navigation and not an Edit: the choice was carried into the file only by the next real Edit, so switching Graphs and reloading returned the file's answer. ADR 0041 kept that ("activation remains navigation and not an Edit"), ADR 0068 had changing the Graph inside an entered Space write nothing, and ADR 0116 recorded `defaultMap` and `activeGraph` only from an Edit through the canvas's Map, treating "choosing or viewing" as recording nothing. The reason 0028 gave was that a Space with no Layout had nowhere to record an active Graph, so activation would have had to materialise a Layout. ADR 0079 removed that case: every working Space has an authored Map, and a Map always owns its Graphs and its `activeGraph`.

The maintainer ruled on 3 November 2026 (rulings 1, C1 and C2 in `docs/requirements/DECISIONS.md`).

## The decision

- **Switching Graphs on the canvas is an Edit.** It writes the Map's `activeGraph`, and, like every Edit through the canvas's Map (ADR 0116), records that Map as `defaultMap`.
- **Switching to the Graph that is already the saved Active Graph is unchanged** and writes nothing, `defaultMap` included.
- **Switching Graphs inside an Open Space Resource is that Space Resource's selection Edit.** It writes the Space Resource's selection and leaves the target Map's `activeGraph` and the target Space's `defaultMap` alone, as ADR 0116 has every Edit through a drawn Map do. An entered Space is its own canvas, so switching there is a canvas Edit of that Space.
- What ADR 0028 decides about the fallback stands: with no `activeGraph` stored the first Graph opens, and that read is never written on its own.

## Why

- **The Graph an author is working in is durable state of the Map.** An author who switches Graphs and reloads expects to come back to the Graph they chose.
- **0028's cost no longer exists.** Recording the choice needs no Layout to be created, because every working Space has an authored Map.
- **One rule for where a Space opens.** An Edit on the canvas records where the author is working; making the switch an Edit puts it under that rule rather than beside it.

## Consequences

- Code differs today: switching only changes navigation state and is saved when a later canvas Edit writes it (Maps and Graphs MG-45, MG-46, MG-84). Switching inside an Open Space Resource already writes only the selection (MG-47).
- Each switch is a commit, so a talk's directory under Running changes when an author switches Graphs.
