# Remove from Map asks first only when Edges would go

Status: accepted
Date: 2026-11-12
Refines: 0074
Related: 0079, 0122

ADR 0074 put confirmation in place of refusal: a destructive action asks first wherever authored work would be lost. Remove from Map keeps the Resource in the Space but discards everything that Map held for it: its position, its size, its Map content (a Shape or its Open state) and every Edge touching it in that Map's Graphs. A re-add brings none of it back, and Undo is not built. Read literally, 0074 would make every Remove from Map ask, which turns the most frequent tidy-up on a Map into two presses. The maintainer ruled on 12 November 2026 (ruling UI C2 in `docs/requirements/DECISIONS.md`).

## The decision

- **Remove from Map asks first when it would delete Edges**: when a Resource it removes is an endpoint of an Edge in any Graph of that Map. The question names the Resource, the Map and each Graph that loses Edges.
- **Otherwise it removes at once.** The position, size and Map content it discards are not reason enough to ask.
- This holds from the actions menu and from the Delete key, for one Resource or several, on the canvas and in a drawn Map.

## Why

- **Edges are the authored narrative.** A Graph's path through the Map is the work a talk is made of, and a lost Edge is hard to notice and to redraw.
- **The rest is cheap to redo.** A position, a size or an Open state is one gesture to set again, and asking for it would make the common removal slower without protecting anything an author would miss.

## Rejected

- **Always ask**, as 0074 reads literally: every removal becomes two presses.
- **Never ask**, treating Remove from Map as not destructive because the Resource stays in the Space: Edges would vanish without a word until Undo is built.

## Consequences

- Code differs today: Remove from Map never asks, by menu or key (UI UI-85).
- When Undo is built, whether the question is still needed is a new decision.
