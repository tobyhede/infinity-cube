# 04: The Spaces source gets its own control, apart from the kind filter

**What to build:** In the Resources list, the switch that adds the Meta Space's Spaces as a second source moves out of the row of kind toggles into its own control, for example a switch beside or under the search. It keeps its count (answering the current search) and its accessible name with that count, starts on, and is reset with the rest of the list when the list closes. The kind row then holds kinds only.

**Why:** The kind toggle row overflows the popover and runs off its right edge: seven toggles (one per registered kind plus Spaces), each a glyph and a count, need about 395px in a 288px popover. Spaces is not a kind (it is a second source, as the list's own filter type says), so it is the one item that does not belong in that row; taking it out also makes "what am I looking at" legible from the controls.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Started with the `shadcn-first-ui` skill: the control is built from `@project/ui` or the shadcn registry, or a deviation is recorded before it is written
- [ ] The kind row holds one toggle per registered kind and nothing else
- [ ] The Spaces control carries its count and an accessible name that includes it, and turning it off withholds Space rows
- [ ] The Connect list, which never offers Spaces, draws no Spaces control
- [ ] The Ladle story and its spec are updated; `pnpm ui:catalog:check` passes
