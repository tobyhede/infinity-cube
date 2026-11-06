# Conflicts: Rendering

Conflicts for [../rendering.md](../rendering.md). Conflict ids are never reused. Drafting rule 5 settles every other rendering behaviour the code implements and a test asserts.

## C1. Open content that does not fit its rect

- **Rules affected:** RD-5. RD-4 (the picture) and RD-60 (a framed drawn Map) are outside it.
- **The disagreement:** ADR 0122 says content adapts to its rect: "a small Open document scrolls, a picture scales down, an embedded Map fits". The space-and-resources trace sends "a Space Resource with no framing fits its Map" here, and `space-and-resources.md`'s "Not here" table points to "a Space Resource's fit" in rendering.md. ADR 0064 says scroll is not contained (no `nowheel`; the wheel belongs to the canvas) and that "an open Card that needs more room is resized". The code does neither of 0122's first and third clauses:
  - Open rendered Markdown is clipped: `ui/src/markdown-resource-body.css` sets `overflow: hidden` on `.markdown-resource-body__rendered`, and nothing scrolls it. No test asserts clipping or scrolling.
  - An unframed drawn Map is not fitted to its window. `app/src/components/EmbeddedMapAuthoring.tsx` takes the least `x` and least `y` of the drawn Resources' positions, once, when it is drawn; `embedCamera` (`app/src/space-resource-framing.ts`) puts that point at the window's inner top-left at zoom 1, and what lies past the window is clipped (`app/test/space-resource-framing.test.ts` › "fits from the Map origin when nothing has been framed yet"; `app/test/embedded-map.test.ts` › "draws a Resource beyond the containing bounds where it was authored, clipped rather than moved").
  - The picture clause holds (RD-4).
- **Options:**
  1. **Clip, and resize or frame for room (recommended).** Overflowing Markdown and an unframed drawn Map larger than its window are clipped at the rect, the drawn Map placed by its Resources' top-left. The author Resizes for room and frames a drawn Map by panning and zooming it in Edit (RD-61). Matches the code, 0064's "resize", and RD-67 (the wheel is the canvas's, so a scrolling body would be reachable only by its scrollbar). Needs one test asserting Markdown clipping. `space-and-resources.md` would change "fit" to "placement".
  2. **Scroll Markdown, fit the drawn Map.** Implement 0122 as written: give the rendered body `overflow-y: auto` (scrollbar only, since the wheel stays the canvas's) and scale an unframed drawn Map to fit its window. A code change on two surfaces.
  3. Split: clip Markdown, fit the drawn Map (or the reverse).
- **Evidence:** ADR 0122 ("The Closed Size is the one floor"); ADR 0064 ("Scroll is not contained"); `trace/space-and-resources.md` §5; the files above.

## Closed

Closed by drafting rule 6 (DECISIONS, Checkpoint 3 rulings).

- **C2. How fast a Resource's content fades on a change of Active Graph.** Presentation, not a requirement; the rule it held is removed.
