# Open content that does not fit is clipped on the canvas

Status: accepted
Date: 2026-11-12
Refines: 0122
Related: 0064, 0112, 0140, 0142

ADR 0122 made the Closed Size the one floor for every kind and had content adapt to the rect it is given: a small Open document scrolls, a picture scales down, an embedded Map fits. The maintainer ruled on 12 November 2026 (ruling Rendering C1 in `docs/requirements/DECISIONS.md`) that a document and an embedded Map do not adapt that way on the canvas.

## The decision

- **Open content that does not fit its rect is clipped at the rect on the canvas.** Markdown longer than its rect does not scroll there.
- **A drawn Map with no framing is placed at authored scale**, with the top-left of its Resources at the window's inner top-left, and is not shrunk to fit; what lies past the window is clipped.
- **To see more, the author resizes the Resource**, or pans and zooms a drawn Map while its Space Resource is in Edit.
- A picture still scales down to its rect. Presenting still scrolls long Markdown, and a presented Space Resource's Map is still drawn whole and fitted (ADR 0140).

## Why

- **The wheel belongs to the canvas.** A scrolling body on the canvas would be reachable only by its scrollbar.
- **A fitted Map changes scale with the rect.** Placing it at authored scale keeps its Titles readable and makes Resize the one way to show more.

## Consequences

- The code already clips and places a drawn Map this way (Rendering RD-5); clipping Markdown is untested.
