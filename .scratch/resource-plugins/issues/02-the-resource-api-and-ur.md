# 02 — The Resource API and its hosts, with Ur on it

Status: ready-for-agent

**Blocked by:** 01 — Prove the interface.

**What to build:** `@project/resource-api` with its `/domain` and `/view` entries, as [`spec.md`](../spec.md) sets out, `renderPlugin`, and the build-time plugin list. `/domain` declares `Resource<C>`, the one structure the core, stores, HTTP and plugins take. The host's Claim chain and `exclusively` are built here, as the spec's invariants set out. A Map host in `ResourceNode` draws the rect, handles, rail, and the border and ring on a declared outline around a plugin's view, inside a per-Resource failure boundary. The Stage hosts the same view. Both fall back to today's `CanvasResource` and `presented` for a kind not yet moved. Map entries gain optional `content`, parsed by the plugin's Map content schema, resolved through its default and `withoutMap`, committed as an Edit and carried through Import and Export. `complete` gains a way to settle a `queued` Edit, and the host refuses a commit from a withdrawn surface.

Ur moves first because it is the smallest. Its package holds both halves, it declares its outline from its Shape, and `shape` moves into its Map content. `Title`, `Own` and `<Rail>` are built here.

**Roll forward:** every stored Ur `shape` moves to Map content, `docs/schema/space.schema.json` follows, and `CanvasResource`'s Ur branch goes (`.scratch/resource-kind-modules/kind-sites.md`). The Shape Edit and intake refusal for another kind become that plugin's schema answering, so this step removes the Map entry's `shape`, the core's `takesResourceShape` and the `shape-not-taken` refusal: a Map content commit no plugin keeps is refused `map-content-not-kept`, and one a plugin's schema rejects `map-content-invalid`, at intake and at `complete` alike. `open`, `canOpen`, `takesOpen` and `open-requires-content` stay until `10`.

**Acceptance:**

- An Ur Resource keeps every Shape, per Map, through a reload, an Export and an Import, with the ring on its outline.
- Ur imports no `@project/*` package but `@project/resource-api`, and a lint rule fails any other.
- A plugin with a wrong `apiVersion` fails the build.
- A plugin that throws loses its Resource and not the canvas.
- On the Stage it gets no commit and the value `withoutMap` gives.
- A commit settles once its Edit has been applied, including one `queued` behind another, and answers refused from a replaced working Space and from a withdrawn surface.
- A Claim held by one chain answers `undefined` to another, an inner release returns to the outer, and an outer Claim is not released while an inner one runs.
- `exclusively` is one at a time and answers `busy` before any work starts; while it runs, every retained commit, the surrounding Claims' included, answers refused, and only the work's own commits land.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
