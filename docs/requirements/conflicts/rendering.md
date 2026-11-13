# Conflicts: Rendering

Conflicts for [../rendering.md](../rendering.md). Conflict ids are never reused. Drafting rule 5 settles every other rendering behaviour the code implements and a test asserts.

## Open

None.

## Closed

Closed by ruling Rendering C1 (DECISIONS, Checkpoint 3 rulings, ruled 12 November 2026).

- **C1. Open content that does not fit its rect.** Option 1: Open content is clipped on the canvas, Markdown does not scroll there, and an unframed drawn Map is placed at authored scale from its Resources' top-left, not fitted. The author resizes for room, or pans and zooms the drawn Map while its Space Resource is in Edit. RD-5 states it; RD-61 (drag pans, wheel zooms) and RD-67 (the Edit exception) were corrected with it.

Closed by drafting rule 6 (DECISIONS, Checkpoint 3 rulings).

- **C2. How fast a Resource's content fades on a change of Active Graph.** Presentation, not a requirement; the rule it held is removed.
