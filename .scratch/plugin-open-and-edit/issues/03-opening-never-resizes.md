# 03: Opening never resizes

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** Markdown and Mermaid stop sending a size hint when they Open ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)). An Open is one Map content commit, made at once without first reading or measuring the content, so it keeps the entry's size and moves no Resource; the content loads after it is drawn. Closing is unchanged. The Open and Close rail control gets its own glyph, so it no longer reads as Resize, keeping the Open and Close labels. Reference and Space are unchanged.

## Acceptance

- [ ] `packages/plugin-markdown` and `packages/plugin-mermaid` Open with a Map content commit that carries no size hint and is made before the text is read; their tests that assert a hint on Open ("Opens with one Map content commit carrying a size hint at least the reading width", and Mermaid's timeout case) are replaced by tests of the new rule.
- [ ] `app/e2e/editing.spec.ts` › "Opening an unresized Markdown Resource grows it to its content, and Closing keeps that size" is replaced by an e2e showing an Open at the Closed Size and at an authored size keeps the rect and a neighbour's position.
- [ ] e2e tests that wait for an Open's revision (PR 490) still pass.
- [ ] The Open and Close control uses a new glyph on every plugin that offers it, chosen through the `shadcn-first-ui` skill (Lucide), with its Ladle story evidence updated.
- [ ] The size hint on a Map content commit (`MapCommit`'s `sizeHint`, MG-88) is removed, with the canvas's cap on it, the Edit's handling of it and the test host's record of it: no plugin sends one after this ticket. ADR 0178 keeps a size hint in the Resource API as the default Edit size; ticket 05 adds it where an edit begins, not on the Map content commit.
