# 09: The editor's cap keeps the shape of what it caps

**Status:** needs-triage

**Blocked by:** 05

**What to build:** Ticket 05 caps the drawn editor at the visible canvas "as `visible-canvas-cap.ts` caps a hint today". `capSizeHint` keeps a narrowed hint's area, but the editor cap clamps each axis on its own, so a capped editor changes shape. Decide which rule the editor cap follows, then make the code and its test match ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)).

Raised in review on PR #547 (`packages/app/src/render-adapter.ts`).

## Acceptance

- [ ] The editor cap and `capSizeHint` follow one stated rule, or the ticket records why they differ.
- [ ] A unit test holds the rule for an editor wider than the visible canvas and for one taller than it.
