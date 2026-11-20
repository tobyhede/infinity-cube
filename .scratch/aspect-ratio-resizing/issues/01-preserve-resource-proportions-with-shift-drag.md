# 01 — Preserve a Resource’s proportions with Shift-drag

**What to build:** An author can hold Shift when starting a drag on a selected Resource’s bottom-right resize control to keep the proportions the Resource currently has on this Map. The gesture works wherever Resize is offered.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The gesture fixes the top-left corner and preserves the starting rect’s width-to-height ratio throughout the preview. Releasing Shift before the pointer keeps the gesture proportional. Pressing Shift after a free drag starts keeps that drag free.
- [ ] Shrinking stops when either dimension reaches the Closed Size floor. A 400 × 300 rect stops at 260 × 195. A 600 × 200 rect stops at 438 × 146.
- [ ] During preview, neighbours stay in place. Releasing after a size change commits the previewed size and any neighbour displacement in one Resize Edit. Cancellation discards the preview and makes no Edit.
- [ ] Ordinary mouse and touch drags continue to resize width and height independently.
- [ ] Browser tests exercise the gesture through the existing control, including both floor examples, modifier timing, non-default zoom, release and cancellation.
- [ ] Record the gesture decision in an ADR and update the owning UI requirement and its snapshot marker.
