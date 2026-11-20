# 05: Trim the embedded-Map application mount to what needs the real canvas

**What to build:** The embedded-Map application-mount suite keeps only the cases that need real React Flow and real pointer and wheel events: clipping, the wheel framing an authored Map, and dragging embedded Resources. Each case it drops is one an interface test from tickets 02 to 04 already holds. The suite gets faster, and a failure in the Map embedding's lifecycle now points at the module.

**Blocked by:** 03, 04.

**Status:** ready-for-agent

- [ ] For every dropped case, the commit message names the interface test that covers it. A case with no equivalent stays.
- [ ] Every `rendering.md` citation (RD-60, RD-61, RD-67) still names a test that exists.
- [ ] The full Vitest run, `e2e` and `e2e:ladle` pass in CI on the draft PR.
