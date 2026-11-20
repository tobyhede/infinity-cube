# Conflicts: Rendering

Conflicts for [../rendering.md](../rendering.md). Conflict ids are never reused. Drafting rule 5 settles every other rendering behaviour the code implements and a test asserts.

## Open

- **C3. When an Open Mermaid diagram is wider than its rect on the canvas, should it be clipped at the rect, as other Open content is, or scaled down to the rect's width, as a picture is?** Raised 20 November 2026 in the snapshot refresh against `d461223`.
  - *Competing claims.* ADR 0149: "Open content that does not fit its rect is clipped at the rect on the canvas", with one exception, "A picture still scales down to its rect", and the reason that a fitted drawing "changes scale with the rect", while authored scale "keeps its Titles readable and makes Resize the one way to show more". ADR 0158, written after it, makes the Mermaid Resource "the Markdown Resource in every way but what it draws" and draws the diagram "straight onto the rect with no card of its own", but says nothing about a diagram wider than its rect. A diagram is an SVG, as a picture may be, and holds text, as Markdown does, so neither exception plainly covers it.
  - *What the code does.* `packages/plugin-mermaid/src/mermaid.ts` `MERMAID_SETTINGS` sets `startOnLoad`, `securityLevel` and `suppressErrorRendering` and leaves `useMaxWidth` at Mermaid's default, on (mermaid 11.17.2), which sizes the SVG to the width it is given up to its natural width. `packages/plugin-mermaid/src/view.tsx` `DrawnDiagram` inserts it in a flex container inside the rect, and the host's rect clips what overflows (`packages/ui/src/canvas-resource.css`, `overflow: hidden`). So, as read from the code and not observed in a browser, a wide diagram shrinks to the rect's width and one taller than its rect is clipped. No test asserts either: `packages/app/e2e/mermaid-resource.spec.ts` › "a Mermaid Resource draws its saved source with Mermaid, in the canvas’s colour scheme" asserts only that the page does not grow past its viewport. Opening measures the size hint at the reading width (MG-88), so a diagram is usually given room on Open; the case arises after a Resize narrower than the diagram, or when Mermaid has not drawn within the load wait and no hint is sent.
  - *Recommendation.* Clip, as ADR 0149 states for Open content in general: set `useMaxWidth: false` in the plugin's settings, so a diagram keeps the scale its text was laid out at, and Resize stays the one way to show more. Consequence for the author: a narrowed Resource shows part of a diagram rather than all of it smaller. Implementation gap: one setting and an end-to-end test. The other choice, scaling down as a picture does, would need a new ADR refining 0149, because 0149 names the picture as its only exception.
  - *Affects.* RD-5 (marked undecided for the Mermaid case), space-and-resources.md SR-67 (what the Mermaid Resource draws), maps-and-graphs.md MG-88 (the size hint).

## Closed

Closed by ruling Rendering C1 (DECISIONS, Checkpoint 3 rulings, ruled 12 November 2026), recorded as ADR 0149, which refines 0122.

- **C1. Open content that does not fit its rect.** Option 1: Open content is clipped on the canvas, Markdown does not scroll there, and an unframed drawn Map is placed at authored scale from its Resources' top-left, not fitted. The author resizes for room, or pans and zooms the drawn Map while its Space Resource is in Edit. RD-5 states it; RD-61 (drag pans, wheel zooms) and RD-67 (the Edit exception) were corrected with it.

Closed by drafting rule 6 (DECISIONS, Checkpoint 3 rulings).

- **C2. How fast a Resource's content fades on a change of Active Graph.** Presentation, not a requirement; the rule it held is removed.
