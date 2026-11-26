# 05: The editor measures its default and stays in view

**Status:** ready-for-agent

**Blocked by:** 03, 04

**What to build:** the default Edit size and keeping the editor visible ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)). When a plugin opts in on an entry with no `editSize`, it sends a size hint measured as its Open measured before ticket 03, and the canvas draws the editor at the larger of the hint and `size` on each axis, storing nothing; each edit measures again until an Edit size is stored. The canvas caps the drawn editor at the visible canvas at the current zoom, less a margin, as `visible-canvas-cap.ts` caps a hint today, without changing a stored `editSize`. If the capped editor reaches past the visible canvas, the camera pans the least distance that shows it, which is not an Edit.

## Acceptance

- [ ] Markdown and Mermaid send their measured hint with the opt-in when no `editSize` is stored, and none when one is; a Mermaid diagram that has not drawn in time sends none.
- [ ] With no `editSize`, the editor draws at the per-axis larger of the hint and `size`, and beginning an edit makes no revision.
- [ ] A stored `editSize` larger than the visible canvas draws capped and stays stored unchanged; zooming out draws more of it.
- [ ] An editor that would reach past the visible canvas pans the camera by the least distance, with no Edit.
