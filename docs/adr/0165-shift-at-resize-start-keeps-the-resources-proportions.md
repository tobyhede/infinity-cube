# Shift at Resize start keeps the Resource’s proportions

Status: accepted
Date: 2026-11-20
Refines: 0122

ADR 0122 gives every selected Resource one bottom-right resize control, with a fixed top-left origin and one Edit on release. An author also needs to enlarge a Resource’s rect while keeping its proportions. The control takes Shift when the drag starts to choose that gesture.

Hold Shift when starting Resize to keep the drawn rect’s starting width-to-height ratio for that whole drag. Releasing Shift before the pointer keeps that ratio. A drag started without Shift changes its dimensions independently for its whole duration, even if Shift is pressed later. The ratio is the Resource’s rect on the current Map when the gesture starts.

The control scales both dimensions together and stops when either reaches the Closed Size floor. A 400 × 300 rect stops at 260 × 195. A 600 × 200 rect stops at 438 × 146. The top-left stays fixed. The preview changes only the subject, release writes the previewed size and its displacement in one Resize Edit, and cancellation discards the draft.

Sampling Shift once keeps a drag consistent while the author releases a key or moves between input devices. Changing the mode during the drag was rejected because switching the constraint would change how the same pointer position maps to a size part-way through the gesture. A stored proportion lock was rejected because this choice belongs to one gesture and needs no additional authored fact.
