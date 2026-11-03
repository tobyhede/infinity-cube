# 01: Decide what placing an already-framed Space does

**What to build:** A recorded decision, as an ADR note against ADR 0074 (references converge) and ADR 0079 (a Space Resource's selection is durable), answering: when this Space already holds a Space Resource framing Space X, does placing X's Space row from the Resources list (press or drop) bring back an existing Space Resource or author a second one with its own Map and Graph selection? And if more than one Space Resource framing X is unplaced in the selected Map, which one is brought back?

**Why:** Placing a Space row always authors a new Space Resource, and Remove from Map keeps a Resource in its Space (maps-and-graphs R34). So add a Space → Remove from Map → add again leaves one orphan Space Resource per cycle, and the Resources list shows each orphan plus the Space row itself, which the list offers no matter how many Space Resources frame it. Searching for the Space then shows it several times. Reported against "Core ontology map": two Space Resource rows (one placed on another Map, one placed nowhere) and the Space row.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The decision is recorded as an ADR or an amendment that ADR 0074 and ADR 0079 point to
- [x] It says what a press and a drop of the Space row do when an unplaced Space Resource framing that Space exists, and when only placed ones exist
- [x] It says which Space Resource is brought back when several are candidates, or that none is
- [x] It says whether the Space row stays offered while an unplaced Space Resource framing that Space is listed (ticket 03 builds on this answer)

## Answer

Recorded as ADR 0143, which refines ADR 0068 and ADR 0074. It refines 0068 (a Space Resource's selection is its own) rather than 0079 because that is where the reason lives; 0079 is Related.

- A press or drop of a Space row always authors a new Space Resource. None is ever brought back, so the "which of several" question does not arise.
- The row is withheld while the list holds a Space Resource framing that Space that no Map places. That Resource's own row is how the author re-adds it after Remove from Map, so the cycle makes no orphan.
- A Space Resource placed on another Map withholds nothing: re-adding it would share its selection across both Maps, so the Space row stays offered beside it. The Space Resource's row already names the Maps that place it, which tells the two rows apart.
- Withholding is decided over the list's source, not what the filters and search leave drawn.

Ticket 02 is superseded (`wontfix`); ticket 03 builds it.
