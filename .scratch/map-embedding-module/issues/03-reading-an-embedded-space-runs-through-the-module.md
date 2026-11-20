# 03: Reading an embedded Space runs through the module

**What to build:** Opening a Space Resource reads its Space exactly as today. One hold is taken per drawn request. A Space that cannot be read is announced by the Title the author gave its Resource. Resume after Exit reads it again. A footer's measured height shapes the drawn Map. A nested canvas's publication lasts only while its request stands. The Map embedding module now owns all of this, and the embedded Open Space Resources hook is deleted. The canvas reads one state from the module, not nine values.

**Blocked by:** 02.

**Status:** resolved

- [x] Interface tests cover:
  - a hold taken per drawn request and released when the request goes;
  - a hold that resolves after its request went is released at once;
  - a failure kept per Space, named per placement, and cleared when the read succeeds;
  - `resume` reading again only placements with no hold;
  - a Closed Space Resource's publication dropped, while an Exited target's last read is kept.
- [x] The publication value stays opaque to the module (spec, decision 7).
- [x] `dispose()` releases every hold. A test holds it.
- [x] No frame is painted with a dead publication or a stale failure. A test holds this, where today a setState during render does the work (spec, "Timing promise to keep").
- [x] The hook's piece tests are deleted where the interface tests cover them.

## Comments

- The embedded Open Space Resources hook is deleted. The canvas derives what it draws during render with the pure `drawnEmbeddings` over the module's state, so a publication whose request no longer stands is left out before paint, as the hook's setState during render did; `space-resource-embedded-map.test.tsx` › "forgets what a Closed Space Resource read, so reopening embeds nothing it held" holds it through the canvas. The hook's tests now drive the module through `test/drawn-embeddings.ts`, which composes it as the canvas does.
