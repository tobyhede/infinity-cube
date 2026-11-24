# 01 — Preserve a Resource’s proportions with Shift-drag

**What to build:** An author can hold Shift when starting a drag on a selected Resource’s bottom-right resize control to keep the proportions the Resource currently has on this Map. The gesture works wherever Resize is offered to a pointer with Shift available: a mouse or trackpad, or touch on a device with a keyboard. A visible “Constrain proportions” control for touch with no keyboard is out of scope. The rationale is in [the research note](../research.md).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The gesture fixes the top-left corner and preserves the starting rect’s width-to-height ratio throughout the preview. Releasing Shift before the pointer keeps the gesture proportional. Pressing Shift after a free drag starts keeps that drag free.
- [ ] Shrinking stops when either dimension reaches the Closed Size floor. A 400 × 300 rect stops at 260 × 195. A 600 × 200 rect stops at 438 × 146. The saved rect is whole canvas units: the dimension that meets the floor is exactly 260 or 146, and the other is derived from it.
- [ ] During preview, neighbours stay in place. Releasing after a size change commits the previewed size and any neighbour displacement in one Resize Edit. Cancellation discards the preview and makes no Edit.
- [ ] Ordinary mouse and touch drags continue to resize width and height independently.
- [ ] Browser tests exercise the gesture through the existing control, including both floor examples, modifier timing, non-default zoom, release and cancellation. They check that the preview and saved rect agree, and that a Shift-press on the control with no movement keeps the Resource selected and makes no Edit, since Shift is also the multi-selection key (Navigation NV-9).
- [ ] Record the gesture decision in an ADR and update the owning UI requirements, UI-67 and UI-68, and their snapshot marker. Update Rendering RD-2, which says an Open Resource takes its rect with no aspect-ratio constraint, to say the gesture is a choice made while authoring, not a constraint on drawing.
