# 05: The kind filter fits the popover however many kinds are registered

**What to build:** Every kind toggle in the Resources list (and the Connect list) sits inside the popover's width on one line, with its glyph and its count still readable. The count moves onto the glyph as a corner badge rather than beside it, so each toggle is roughly glyph-width. A guard proves the fit against the real kind registry, so the next kind module that would overflow the row fails a test rather than shipping.

**Why:** The row is a no-wrap flex line in a fixed-width popover and grows by one toggle per kind module; it was sized when there were fewer kinds and now runs off the panel (see ticket 04).

**Blocked by:** 04 (The Spaces source gets its own control, apart from the kind filter)

**Status:** resolved

- [x] Started with the `shadcn-first-ui` skill; any toggle styling change is built from `@project/ui` or recorded in the design-system inventory
- [x] Each toggle still shows its count, still names kind and count in its accessible name, and still draws pressed and unpressed distinctly
- [x] A Ladle spec asserts every kind toggle's box lies inside the popup, using every registered kind rather than a fixed list
- [x] The popover's width is unchanged
- [x] `pnpm e2e:ladle` and `pnpm ui:catalog:check` pass

## Progress

Built ahead of ticket 04, as an alternative to PR #454's treatment (popover widened to `w-80`, toggles wrapping in a grid), so the two can be compared for usability. The Spaces toggle stays in the row; with the registry's five kinds that is six toggles of 32px spread across the 272px row, so the fit does not depend on 04.

- `ToggleGroup`/`ToggleGroupItem` from `@project/ui` are unchanged; only the component stylesheet `resources-popover.css` changes, so no inventory entry is needed (`pnpm ui:catalog:check` is valid).
- Every toggle is one 32×28 box, because the Spaces glyph is larger and made its toggle 2px taller than the rest. The count is absolutely positioned over the top-right corner and anchored on the right, so a wider count grows inwards.
- `ladle-e2e/resources-popover.spec.ts`, "every filter toggle sits inside the popover on one line, its count still drawn", asserts `KIND_IDS.length + 1` toggles, one shared top, each toggle and its count inside the 288px popup. It failed before the change: the last toggle ended 2px past the panel with the story's single-digit counts.
- A ring halo round the badge was dropped: `structural-css-literals.test.ts` refuses a new bare `box-shadow`.

## Answer

Compared in review against PR #454's wider, wrapping row, Toby chose this one-line, corner-badge treatment as the more usable. PR #454's filter change (`w-80` and the grid in `resources-popover.css`) should not land beside it.
