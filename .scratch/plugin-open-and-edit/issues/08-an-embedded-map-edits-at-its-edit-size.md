# 08: An embedded Map draws its editor at its Edit size

**Status:** needs-triage

**Blocked by:** 05

**What to build:** [ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md) says a Resource's Edit size applies wherever its Map is drawn and the Resource is edited (ADR 0112). After ticket 05, only the outer canvas does this. An editor on a Map drawn inside a Space Resource is not drawn at its Edit size, not capped at the visible canvas, and the camera does not pan to show it, because `editorCap` is worked out only in `SpaceCanvas.tsx`. Make an embedded Map's editor follow the same rules as the outer canvas's.

Raised in review on PR #547 (`packages/app/src/canvas-resource-authoring.ts`).

## Acceptance

- [ ] An editor on an embedded Map is drawn at its entry's Edit size, or at its default when none is stored.
- [ ] It is capped at the part of the canvas that is visible, and the camera pans to show it as it does on the outer canvas.
- [ ] A Playwright test edits a Markdown Resource on an embedded Map and finds it drawn at its Edit size.
