# A Space row frames its Space with a new Space Resource, and is withheld while an unplaced one frames it

Status: accepted
Refines: 0068, 0074
Related: 0040, 0079

The Dock's Resources list draws two sources: the Resources the selected Map does not place, and every Space of the Meta Space bar the containing one. Placing a Space row, by press or drop, authors a Space Resource framing that Space. Remove from Map keeps a Resource in its Space (ADR 0040). So add a Space, Remove it from the Map and add it again, and each cycle left one more Space Resource in the Space, placed on no Map, and the list showed each of them beside the Space row. Searching for the Space found it several times, and each orphan kept the target Space alive (ADR 0074).

**A Space row means "frame this Space with a new Space Resource", and placing it never brings back an existing one.** A Space Resource's selection is its own, and a second view of a Space needs a second Space Resource (ADR 0068), so a Space row that sometimes authored a Resource and sometimes reused one would decide for the author which they get, and would need a rule for which of several candidates comes back.

**The list withholds a Space's row while it lists a Space Resource that frames that Space and is placed on no Map.** That Resource's own row is the way back: after Remove from Map the author places the same Resource, with its selection, and no orphan is made. Placing it takes it out of the list, and the Space row returns, so a second view stays one press away.

**A Space Resource placed on another Map does not withhold the row.** Placing it here too shares one Resource, and its selection, across both Maps, and a Space row is how an author gets a view of their own instead. Both rows stay offered, and the Space Resource's row names the Maps that place it, which tells the two apart. A Space Resource already placed on this Map is not in the list at all, so it withholds nothing either: the Space row is offered while that Resource is on the canvas, and pressing it authors a second view.

The withholding is decided over the list's source, not over what the kind filter and search leave drawn. Switching the Space Resource kind off hides both rows rather than bringing back the Space row that would author a second Space Resource. The Spaces count and the empty-list sentence read the same withheld set.

**Rejected: placing a Space row reuses an unplaced Space Resource framing it.** It removes the orphan but hides which Resource, and which selection, a press produces, needs a choice between several unplaced candidates, and still shows one Space under two names until it is pressed.

**Rejected: withholding the row whenever any listed Space Resource frames the Space**, wherever it is placed. It would make sharing a Resource across Maps the only one-press way to show that Space, and leave a new view reachable only by first placing that shared Resource.

**Cost accepted:** a deliberate second view of a Space whose Space Resource is unplaced takes two presses, placing that Resource and then the Space row. A Space Resource placed on another Map still appears beside its Space's row. Orphans made before this decision stay in their Spaces until the author deletes them from the list.
