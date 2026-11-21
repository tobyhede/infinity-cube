# 05: Trim the embedded-Map application mount to what needs the real canvas

**What to build:** The embedded-Map application-mount suite keeps only the cases that need real React Flow and real pointer and wheel events: clipping, the wheel framing an authored Map, and dragging embedded Resources. Each case it drops is one an interface test from tickets 02 to 04 already holds. The suite gets faster, and a failure in the Map embedding's lifecycle now points at the module.

**Blocked by:** 03, 04.

**Status:** resolved

- [x] For every dropped case, the commit message names the interface test that covers it. A case with no equivalent stays.
- [x] Every `rendering.md` citation (RD-60, RD-61, RD-67) still names a test that exists.
- [x] The full Vitest run, `e2e` and `e2e:ladle` pass in CI on the draft PR.

## Comments

- No case was dropped. Each case in the application mount that touches the Map embedding's lifecycle (framing pending when the Resource leaves the Map, selecting nothing on leave and the Resource on Done, the pending zoom at unmount, wheel framing per Resource within the debounce) also proves the canvas's wiring of the module: that it reports what it drew after the commit that changed it, calls `dispose` when it goes, and routes the wheel and pointer into it. f1bc4a8 was a bug in exactly that timing, so the interface tests in `map-embedding.test.ts` are not equivalent and, by this ticket's rule, the cases stay. The hook's tests moved to `map-embedding-reads.test.ts` in 03.
- The last criterion (full Vitest, `e2e` and `e2e:ladle` in CI) is checked on the PR, not here.
