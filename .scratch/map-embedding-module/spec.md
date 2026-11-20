# The Map embedding as one module

**Status:** resolved

Source: architecture review of 2026-11-19 (candidate 1), settled with the user over three rounds of design questions on 2026-11-20.

## Why

A **Map embedding** (CONTEXT.md) authored in place on a canvas runs one protocol. The embedding publishes, its Claim is lent to the gate, a pending framing is flushed on Done, the Resource is selected only while it is still drawn, and the embedding's commit is forgotten. No module owns that protocol.

The protocol currently lives in four places:
- the order in which the canvas declares its layout effects;
- a framing-flush callback that the canvas's gesture effect installs about 900 lines away from those effects;
- a hook that returns nine values;
- two trimming passes in the canvas's Resource authoring.

The canvas was the most-changed file in the month before this review. Embedding fixes kept landing in the same callers (f1bc4a8, d0eee7d, 562b24e, cf2e6de). The only test that proves the ordering mounts the whole application.

## Decisions

1. **What the module owns.** It owns:
   - the registry of Map embeddings and Claim lending;
   - Done (flush, then select-if-drawn, then forget);
   - framing drafts, the 160ms zoom debounce, and the framing write through the embedding's own `select` commit;
   - Space reads (holds, read failures, Resume after Exit);
   - footer heights;
   - the lifetime of each Map embedding's publication;
   - per-embedding notices and rail editing.

   The pointer and wheel gestures stay in the canvas. They report drafts to the module.
2. **Its shape.** It is a plain store, built on `createObservableState` and exposed as `getState` and `subscribe`, and driven by named operations. It is not a React hook. The canvas makes one `useSyncExternalStore` call.
3. **Nesting.** There is one module per root canvas, covering every depth of nesting, as the registry does today.
4. **Where it lives.** It lives in one folder in `app` that absorbs the registry, the embedding hook, publication and embed view. It stays host-side (ADR 0142). The canvas and Stage `HostMapProvider` adapters are a real seam with two adapters, so they stay where they are.
5. **Tests.** Interface tests come first, porting the cases behind f1bc4a8 and d0eee7d. Each ticket deletes the piece tests it replaces. The embedded-Map application mount is trimmed to the cases that need the real canvas.
6. **Collaborators.** The module calls its collaborators itself, as one operation. It does not return a plan for the canvas to carry out (AGENTS.md, functional core and imperative shell).
7. **Publications.** The module owns only the lifetime of each Map embedding's publication. The value is opaque to it.
8. **Notices and rail editing.** These follow one rule: they die with the embedding. The two trimming passes become one.
9. **How it lands.** One draft PR, with one commit per ticket. A test that moves takes its `docs/requirements/rendering.md` citation with it (RD-60, RD-61, RD-67). The untested drag gesture and wheel capture named there stay in the canvas and are out of scope.
10. **Its interface follows the house pattern** of Space Authoring, Edge Authoring and the continuation: one dependency object, collaborators named for their role, and an optional `reportObserverError` with a console default.

    ```
    createMapEmbedding({ spaces, claims, select, reportObserverError? }: MapEmbeddingDependencies)
    ```

    - `spaces` is Open Spaces, for holds.
    - `claims` is the plugin gate, named for the role it plays here: lending Claims.
    - `select` is the render adapter's `selectResource`.

    No clock is injected. The debounce calls `setTimeout`, and its tests use fake timers. The operations, refined as tests are written, are roughly: `publish`, `drawn`, `publishCanvas`, `reportFooter`, `pan`/`panEnd`, `zoom`, `resume`, `setNotice`, `setRailEditing`, `dispose`.
11. **Teardown.** `dispose()` lands every pending zoom framing without dropping drafts, and releases every Space hold. The canvas calls it from the effect that created the module.

## Timing promise to keep

Three things are currently adjusted as setState during render, so that no frame is painted with stale state: dropping dead publications, dropping failures, and the trims. In the module they become derivations on `drawn()`, which the canvas sends from a layout effect. A store update made in a layout effect re-renders before paint. Tests hold this promise.

## Out of scope

- The pointer and wheel gestures.
- The Stage adapter.
- The commit refusals through the plugin host, which are review candidate 2.
