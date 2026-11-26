# 04: The canvas draws an opted-in Claim at its Edit size

**Status:** ready-for-agent

**Blocked by:** 02

**What to build:** the Resource API opt-in and the canvas drawing it ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)). A plugin taking its Claim may opt in to editing in place. While that Claim is held, the canvas draws the Resource at the entry's `editSize`, or at its `size` when none is stored, from the entry's top-left, wherever the Map is drawn (ADR 0112) but never on the Stage (NV-62). The resize control then writes `editSize` through ticket 02's Edit, by the Resize control's rules (Closed Size floor, Shift keeps proportions, ADR 0173), one Edit per completed gesture, never `size`. Releasing the Claim draws the Resource at `size` again. A Claim that does not opt in, such as a Space Resource's, draws nothing differently. Markdown and Mermaid opt in; their Edit from Open is otherwise unchanged in this ticket.

## Acceptance

- [ ] `packages/resource-api/src/view` gives a Claim an opt-in to editing in place, with a slot for an optional size hint (used in ticket 05), and `renderPlugin` in `/view/testing` records it.
- [ ] The canvas (`packages/app`, through the plugin host in `packages/ui`) draws an opted-in Resource at `editSize` or `size` while the Claim is held, and at `size` after release, Edges attached to the drawn rect.
- [ ] A resize during an opted-in Claim writes `editSize` and leaves `size`; Save and Cancel both keep it; the next edit draws at it, after a reload and on that Map only (the same Resource on two Maps keeps two).
- [ ] A Space Resource's Edit draws at its `size` as today.
- [ ] Markdown and Mermaid opt in, shown by an application Playwright test that edits, resizes, Cancels and edits again.
