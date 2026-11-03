# Conflicts: UI

These are conflicts for [../ui.md](../ui.md) that drafting rules 1–5 and [../DECISIONS.md](../DECISIONS.md) do not settle. Conflict ids are never reused. Paths are relative to `packages/`.

## C1. What a connection released across drawings tells the author

**Rules affected:** UI-77; MG-59 (maps-and-graphs.md), which should carry the same status or point here.

**The disagreement.** 0112 records, among the differences a drawn Map may have: "A connection between Resources of two different drawn Maps is refused with wording, like any other connection refusal." The code shows no wording. In a drawing, a Resource of another drawing never shows a seeking end (`mayOfferConnectionEnd` asks this drawing's Edge Authoring, whose draft is not a connection), `isValidConnection` answers false because this drawing cannot resolve the node, and React Flow never calls `onConnect`. Nothing reaches the canvas announcement channel (`edge-authoring-react.tsx`, `role="alert"` `canvas-refusal`), which carries only refusals Edge Authoring produced.

"Like any other connection refusal" does not settle it either way. A release on an ineligible Resource of the same drawing (an Edge that already exists, say) is not worded at release either: the target is marked ineligible during the drag and never snapped to (`app/e2e/editing.spec.ts` › "a duplicate Edge is marked invalid while the drag is still live"). The canvas announcement is used for a refusal that Authoring returns after a completed gesture, such as a refused Option/Alt drop.

**Options.**
- **(a) Word it.** On a release over a Resource of another drawing, announce a sentence on the canvas channel ("An Edge joins Resources of one Space", or similar). It needs a new refusal identity or a UI-only sentence, and a hit test at release.
- **(b) Treat it as any ineligible end.** Another drawing's Resources are not offered as connection ends during the drag and a release on one completes nothing, silently, as for every other ineligible end. The Connect list already offers only the drawing's own Resources. UI-77 becomes a **built (untested)** rule saying so.

**Recommendation: (b).** It is what every other ineligible end does, it needs no new identity, and 0112's own comparison ("like any other connection refusal") is met by it. Add a test that a release on another drawing's Resource completes nothing.

**Evidence.** `docs/adr/0112-a-map-behaves-the-same-wherever-it-is-drawn.md:33`; `app/src/edge-authoring-react.tsx` (`mayOfferConnectionEnd`, `isValidConnection`, the gesture-refusal span); `app/test/edge-authoring-react.test.tsx` › "shows the reason a finished pointer gesture ran into". No test covers a cross-drawing release.

## C2. Whether Remove from Map asks first

**Rules affected:** UI-85; UI-83.

**The disagreement.** 0074: "a destructive Card action states whether it affects one Layout or the whole Space, and asks first wherever authored work would be lost." Remove from Map removes every Edge touching the Resource in that Map's Graphs and forgets its size, Shape and Open state; re-adding restores none of them (MG-16, MG-19). The code never asks: neither the actions menu row nor Delete/Backspace on the canvas raises a question, while Delete from Space, Delete Map, Delete Graph and Delete Edge all do. The old guide itself says "removing a Resource from a Map or deleting an Edge cannot be undone" (`docs/agents/ui.md`, key-bindings bullet), and Undo is not built (DECISIONS 5).

**Options.**
- **(a) Ask when Edges would go.** Remove from Map asks first, naming the Map and the Edges it removes, whenever the Resource is an endpoint of an Edge in that Map; otherwise it runs at once. The common case stays one press.
- **(b) Ask always.** Every Remove from Map asks, as Delete from Space does.
- **(c) Never ask.** Record that Remove from Map is not destructive in 0074's sense, because the Resource stays in the Space, and accept the Edge loss until Undo is built.

**Recommendation: (a).** Edges are the authored narrative and the one thing a re-add cannot bring back, which is exactly 0074's test; asking only then keeps the frequent tidy-up removal at one press. If the maintainer prefers (c), UI-85 becomes built as "Remove from Map asks nothing" with the Undo dependency noted.

**Evidence.** `docs/adr/0074-space-card-references-own-the-target-space.md:59-62`; `app/test/resource-rail-actions.test.tsx` › "removes the Resource from this Map and leaves it in the Space, without asking"; `app/e2e/editing.spec.ts` › "${key} with a Resource selected removes it and its Edges from this Map"; `app/src/components/DeleteConfirmation.tsx` (asks for the other deletions).

## C3. How a question or notice names a Resource, Map or Graph

**Rules affected:** UI-99; UI-83; Effects "Names".

**The disagreement.** 0083 ("The first line is the name"): every surface that lists or refers to a Resource "shows `titleName` and nothing else", and it names "the Delete question" among them. `CONTEXT.md` (Title Lines) defines a **short Title**, the name with an ellipsis when more Title Lines follow, and says any surface that cannot draw every line (a question or notice, an Edge endpoint) shows it "so a part of the Title is never presented as the whole of it". The code follows `CONTEXT.md`: `core/src/title.ts` `shortTitle`, used by the delete question (`app/src/resource-deletion.ts`) and the Map and Graph commands (`app/src/graph-authoring-commands.ts`). Drafting rule 1 does not settle it: the later source agreeing with the code is the glossary, not an ADR. Controls, rows and accessible names use the name alone, which both sources agree on.

**Options.**
- **(a) The short Title.** Questions, notices and Edge endpoints use the name plus an ellipsis when lines follow; controls, rows and accessible names use the name alone. UI-99 becomes built.
- **(b) The name only, as 0083 says.** Drop the ellipsis from questions and notices; `shortTitle` goes.

**Recommendation: (a).** The ellipsis keeps the name 0083 asks for and only adds the signal that more follows, which is 0083's own concern (part of a Title must not read as the whole). It is built and tested.

**Evidence.** `docs/adr/0083-a-card-title-is-title-lines.md:27`; `CONTEXT.md:47`; `app/test/DeleteResourceConfirmation.test.tsx` › "names a Resource whose Title spans several lines by its first line and an ellipsis"; `app/test/resource-rail-actions.test.tsx` › "names the Resource in the question by its short Title and not by its whole Title".
