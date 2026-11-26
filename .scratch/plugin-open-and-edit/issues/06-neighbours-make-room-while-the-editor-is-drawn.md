# 06: Neighbours make room while the editor is drawn

**Status:** ready-for-agent

**Blocked by:** 04

**What to build:** displacement that is drawn but not stored ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)). While an opted-in Claim is held, the canvas applies the displacement rule a Resize uses (MG-24, `packages/graph/src/placement.ts`) to the editor's drawn rect and draws the Resources it passes at their displaced positions, with their Edges, recomputing as the editor is resized. None of those positions is committed. When the Claim is released every Resource is drawn where the Map stores it. A normal Resize keeps its stored displacement (MG-23–MG-26).

## Acceptance

- [ ] The displacement for a rect is computed by the same pure function the Resize Edit uses, called by the canvas projection without an Edit.
- [ ] An application Playwright test shows a neighbour drawn aside while editing, moving further as the editor grows, and back at its stored position after Save and after Cancel, with no revision for any of it.
- [ ] Edges to a displaced neighbour follow its drawn position.
