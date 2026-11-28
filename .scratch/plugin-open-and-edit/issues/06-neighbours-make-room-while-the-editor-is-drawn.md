# 06: Neighbours make room while the editor is drawn

**Status:** implemented

**Blocked by:** 04

**What to build:** displacement that is drawn but not stored ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)). While the Resource shows its editor, the canvas applies the displacement rule a Resize uses (MG-24, `packages/graph/src/placement.ts`) to the editor's drawn rect and draws the Resources it passes at their displaced positions, with their Edges, including a shrinking axis. During a resize gesture the preview changes only the subject (ADR 0173). Release recomputes displacement from the settled rect. None of those positions is committed. A Resource placed or deliberately dragged during the edit stays at the authored point for the rest of that edit. A drag returning to its start leaves the temporary displacement intact. When editing ends every Resource is drawn where the Map stores it. A normal Resize keeps its stored displacement (MG-23–MG-26).

## Acceptance

- [x] The displacement for a rect is computed by the same pure function the Resize Edit uses, called by the canvas projection without an Edit.
- [x] An application Playwright test shows a neighbour drawn aside while editing, holding its position during a resize preview and moving further on release, and back at its stored position after Save and after Cancel, with only the completed resize writing a revision.
- [x] Edges to a displaced neighbour follow its drawn position.
