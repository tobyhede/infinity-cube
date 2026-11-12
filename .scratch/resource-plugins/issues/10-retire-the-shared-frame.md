# 10 — Retire the shared frame and the core fields

Status: ready-for-agent

**Blocked by:** 07 — The Space plugin; 08 — Creation through the API; 09 — The default plugin.

**What to build:** delete what every plugin has made unused: Open and expand (`open-and-expand.tsx`, `SnapshotEdit.openAndExpand`, `opened-resource-to-fit`, its key binding and shortcut sheet row), `opensToFit`, `CanvasResource`, `ResourceDisplay`'s `editing` arm, `ResourceContentEdit`, `KindView`'s `canvas` and `presented`, the fallback paths from `02`, the `kinds/` halves, and the Map entry's `open`. In the core, `canOpen`, `takesOpen`, the `opened-resource` and `closed-resource` Edits and the `open-requires-content` refusal go. The entry's `shape`, `takesResourceShape` and `shape-not-taken` went in `02`. A Map entry is `{ x, y, size?, content? }`.

**Roll forward:** `packages/app/stories/`, `design-system-inventory.ts`, the structural guards that name the frame (`kind-stylesheet-order`, `kind-css-selectors`, `kind-ids-in-modules`, `KIND_FEATURE_FILES`), `test/e2e/` and `packages/app/e2e/graph.ts`, `docs/agents/ui.md`, `rendering.md` and `authoring-refusal-cascade.md`, AGENTS.md's ADR 0128 and 0142 entries, and `maps-and-graphs.md`'s "Accepted, not built" entry. Domain vocabulary moves to Resource plugin in a separate rename commit.

**Acceptance:**

- `CI passed` is green with every required job, including the PostgreSQL and SQLite restart proofs.
- Nothing outside a plugin package names a Resource kind, bar what `kind-sites.md` still keeps with a reason.
