# 03: The Resources list shows one row per Space

**What to build:** Searching the Resources list for a Space shows it once while an unplaced Space Resource frames it. Following ticket 01's answer (ADR 0143), a Space row is withheld while the list's source holds a Space Resource framing that Space that no Map places, so the reader picks that Resource rather than meeting the same name twice. A Space Resource placed on another Map withholds nothing. The per-filter counts keep matching the rows drawn, and the empty-list sentences stay true over both sources.

**Why:** Today the list draws every unplaced Space Resource and, independently, every Space in the Meta Space bar the containing one, so one Space appears as a Space Resource row and a Space row at the same time (see ticket 01).

**Blocked by:** 01 (Decide what placing an already-framed Space does)

**Status:** resolved

- [x] With an unplaced Space Resource framing X listed, a search for X draws one row for X
- [x] With no unplaced Space Resource framing X, the Space row for X is offered as before
- [x] The Spaces count and the Space Resource kind's count agree with the rows drawn under the current search
- [x] The empty-list sentence reasoning still holds when the only matching Space is withheld
- [x] A component test covers both cases

## Answer

`unframedSpaces` in `packages/app/src/components/ResourcesPopover.tsx` filters the Spaces source before anything reads it, so the rows, the Spaces count and `emptyMessage` all see the same withheld set. `ResourcesPopover.test.tsx`, "a Space framed by a listed Space Resource", holds both cases: one row and a Spaces count of 0 while the Space Resource is placed on no Map, and both rows plus a count of 1 while it is placed on another Map.

The empty-list sentence needs no separate test: a Space is withheld only while a Space Resource is listed, so `available` is at least one and the sentence is "No matching Resources." whether or not the Space was counted.

`packages/app/e2e/space-resource.spec.ts` ("removing a Space Resource from the Map leaves the Resource and its target Space intact") asserted the Space row after Remove from Map; it now asserts the row is withheld, and returns once the Resource is placed again.
