# 04: What the canvas says about an embedding dies with it

**What to build:** A notice the canvas shows about a Map embedding, and that embedding's rail editing, go when the embedding goes, whatever closed it: the canvas, the plugin's own Map content commit, another author's Edit, or a replacement. Opening the Resource again starts afresh, as today. The Map embedding module holds both as per-embedding state under one rule, and the two trimming passes in the canvas's Resource authoring are deleted.

**Blocked by:** 02.

**Status:** resolved

- [x] One rule, held by interface tests: notices and rail editing for a Resource die when its drawing on this canvas stops embedding a Space.
- [x] If the two trimming passes turn out to cover a case on purpose that this one rule misses, stop and record it as a comment on this ticket rather than merging the passes.
- [x] The canvas's Resource authoring no longer reads the registry to trim state.
- [x] Existing tests of Close, replacement and another author's Edit taking an embedding down still pass.

## Comments

- The two trimming passes were one rule. The second (keep a Resource only while a node of this canvas embeds it) already dropped everything the first (keep a Resource only while some placement embeds it) did. Keyed by placement rather than by Resource, the module now drops both the moment the registry no longer holds the placement, and a notice that lands after its embedding has gone is not kept. Each canvas's title editing reads the rail editing of its own placements.
