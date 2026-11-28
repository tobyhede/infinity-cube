# 05: The plugin suggests an editor size and the canvas keeps the editor in view

**Status:** ready-for-agent

**Blocked by:** 03, 04

**What to build:** Implement the sizing contract in [ADR 0182](../../../docs/adr/0182-a-plugin-chooses-the-size-it-suggests-for-its-editor.md). A plugin identifies the editor it draws and may suggest dimensions. It chooses how to obtain them. Markdown and Mermaid use the real source editor. With no Edit size stored, they lay it out hidden, read its width and height once, then show the same editor. A stored Edit size skips measurement.

## Acceptance

- [ ] A test follows the same source editor from measurement through typing. A browser test checks that changing the saved source changes the next editor’s width and height. The suggestion stays fixed as the author types. Sizing works without loading rendered output.
- [ ] The canvas draws the stored Edit size, then falls back to the suggestion, then to the Display size. A suggestion smaller than the Display size remains smaller. Beginning an edit writes no revision. Holding a Claim for other work preserves the Display size.
- [ ] Each drawn dimension fits the visible canvas at the current zoom, less a margin. Zooming out reveals more of an oversized stored Edit size. The stored value survives changes to the cap.
- [ ] When editing begins or the cap changes, the camera pans the least distance to show the editor. Moving or resizing the editor alone leaves the camera in place.
