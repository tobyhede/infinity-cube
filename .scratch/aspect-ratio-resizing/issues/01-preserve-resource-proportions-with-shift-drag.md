# 01 — Preserve a Resource’s proportions with Shift-drag

**What to build:** An author can hold Shift when starting a drag on a selected Resource’s bottom-right resize control to keep the proportions the Resource currently has on this Map. The gesture works wherever Resize is offered.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The gesture fixes the top-left corner and preserves the starting rect’s width-to-height ratio throughout the preview. Releasing Shift before the pointer keeps the gesture proportional. Pressing Shift after a free drag starts keeps that drag free.
- [x] Shrinking stops when either dimension reaches the Closed Size floor. A 400 × 300 rect stops at 260 × 195. A 600 × 200 rect stops at 438 × 146.
- [x] During preview, neighbours stay in place. Releasing after a size change commits the previewed size and any neighbour displacement in one Resize Edit. Cancellation discards the preview and makes no Edit.
- [x] Ordinary mouse and touch drags continue to resize width and height independently.
- [x] Browser tests exercise the gesture through the existing control, including both floor examples, modifier timing, non-default zoom, release and cancellation.
- [x] Record the gesture decision in an ADR and update the owning UI requirement and its snapshot marker.

## Answer

Shift held when the drag starts preserves the Resource’s current Map rect ratio through release. The existing control bypasses React Flow’s Shift-selection interception. Its stable proposal callback scales both dimensions together while respecting the Closed Size floor.

The browser specification proves proportional preview and persistence, the fixed top-left origin, neighbour positions during preview, both floor examples, and cancellation. The existing mouse and touch Resize proofs exercise ordinary drags. ADR 0165 refines ADR 0122, and UI-67 and UI-68 carry the current gesture and minimum-size requirements.
