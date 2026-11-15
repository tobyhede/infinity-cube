# Graph navigation on the canvas keeps no history

Status: accepted
Date: 2026-11-12
Refines: 0041
Related: 0024, 0032

ADR 0041 gave working Graph navigation, as well as presenting, the transient Traversal history needed to retreat through the path actually taken. The maintainer ruled on 12 November 2026 (ruling Navigation C2 in `docs/requirements/DECISIONS.md`) that the canvas keeps none.

## The decision

- **Graph navigation on the canvas moves the selection to an Active Graph neighbour** in the direction of the arrow pressed, joined by an Edge in either direction, and keeps no Traversal history. It writes nothing.
- **Traversal history exists only while presenting**, where advancing appends the Resource reached and retreating walks back through the path taken (ADR 0024, ADR 0032).

## Why

- **An author on the canvas moves in space, not along a talk.** The arrows pick the neighbour that lies that way, so retreating along a recorded path would fight the direction the author pressed.

## Consequences

- The code already behaves this way (Navigation NV-13). `CONTEXT.md`'s Graph navigation and Traversal history entries say that history belongs to presenting.
