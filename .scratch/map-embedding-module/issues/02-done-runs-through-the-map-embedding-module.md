# 02: Done on a Map authored in place runs through the Map embedding module

**What to build:** An author who presses Done on a Space Resource whose Map they authored in place sees exactly what they see today. The framing they drew lands, the Resource is selected if it is still drawn and not otherwise, and the Claim returns. All of this is now decided by one Map embedding module, created per root canvas as `createMapEmbedding({ spaces, claims, select, reportObserverError? })` (spec, decision 10).

The module owns:
- the registry;
- lending each authored embedding's Claim to the gate;
- framing drafts and the 160ms zoom debounce;
- the framing write through the embedding's own `select` commit, including the last-known request at unmount.

Done flushes the framing, then selects, then forgets, in that order, inside the module. The canvas keeps its pan and wheel listeners, which report into the module through `beginPan`, `draft`, `frame` and `zoom`, and it sends `drawn` from a layout effect. The canvas's layout effects for lend, flush, select and forget, and its framing-flush callback ref, are deleted.

**Blocked by:** 01.

**Status:** resolved

- [x] Interface tests, which need no React and no application mount, cover:
  - a Claim lent while authored and returned on Done;
  - a pending zoom flushed on Done before the commit is withdrawn;
  - selection on Done and on Close only while the Resource is still drawn;
  - no selection when the placement went (Map switched, Resource deleted or unplaced), which is the f1bc4a8 case;
  - the d0eee7d case;
  - a withdrawn embedding's commit forgotten only after its flush has landed.
- [x] `dispose()` lands a zoom still pending at unmount, without dropping drafts. A test holds it.
- [x] The debounce uses `setTimeout`, and its tests use fake timers. No clock is injected.
- [x] The registry's own piece tests are deleted where the new interface tests cover them. Any `rendering.md` citation (RD-60, RD-61) of a moved or renamed test moves with it.
- [x] The embedded-Map application mount still passes untouched.
