# 02: Placing a Space reuses its unplaced Space Resource

**What to build:** When this Space holds an unplaced Space Resource framing Space X, pressing or dropping X's Space row in the Resources list places that Space Resource on the selected Map, at the centre for a press and at the drop point for a drop, instead of authoring a new one. Its Map and Graph selection is kept. Where ticket 01 decides that several candidates exist, the one it names is placed. Where none exists, placing still authors a new Space Resource as it does today.

**Why:** Each add → Remove from Map → add cycle currently authors a fresh Space Resource and leaves the last one orphaned in the Space (see ticket 01).

**Blocked by:** 01 (Decide what placing an already-framed Space does)

**Status:** wontfix

Superseded by ADR 0144 (ticket 01's answer): placing a Space row never reuses a Space Resource. The orphan cycle is closed by withholding the Space row while an unplaced Space Resource framing it is listed, which ticket 03 builds; the author re-adds that Resource from its own row.

- [ ] A failing test first reproduces two add → Remove from Map cycles and shows the Space's Resource count growing; it passes once this ticket is done
- [ ] Press and drop both reuse the unplaced Space Resource, keeping its id, title and selection
- [ ] With no unplaced Space Resource framing X, placing authors a new one exactly as before
- [ ] A refusal still reaches the list that asked for it, on the opening that asked (unchanged settlement path)
- [ ] A Playwright spec covers the add, remove and add-again sequence and asserts one Space Resource framing X remains
