# 04: What the canvas says about an embedding dies with it

**What to build:** A notice the canvas shows about a Map embedding, and that embedding's rail editing, go when the embedding goes, whatever closed it: the canvas, the plugin's own Map content commit, another author's Edit, or a replacement. Opening the Resource again starts afresh, as today. The Map embedding module holds both as per-embedding state under one rule, and the two trimming passes in the canvas's Resource authoring are deleted.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] One rule, held by interface tests: notices and rail editing for a Resource die when its drawing on this canvas stops embedding a Space.
- [ ] If the two trimming passes turn out to cover a case on purpose that this one rule misses, stop and record it as a comment on this ticket rather than merging the passes.
- [ ] The canvas's Resource authoring no longer reads the registry to trim state.
- [ ] Existing tests of Close, replacement and another author's Edit taking an embedding down still pass.
