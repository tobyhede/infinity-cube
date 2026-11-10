# 06 — The Space plugin

Status: ready-for-agent

**Blocked by:** 05 — The Reference plugin.

**What to build:** the Map embed in the Resource API, and Space as a plugin on it. The embedded-read machinery and `createMapSurface` sit behind the embed, the `portal` is replaced by the claim, and Space's rail comes from declared commands. A Space Resource Closed still requests nothing. Aggregate rules (cycles, lifetime, rooting) stay in the core, read from what the plugin declares (ADR 0128). A Reference to a Space moves to the embed here.

**Roll forward:** stored `open` on Space entries moves to Map content, and the Space sites in `.scratch/resource-kind-modules/kind-sites.md` go, including those in `CanvasResource`, `ResourceNode` and `SpaceCanvas`.

**Acceptance:**

- Authoring a Map in place, choosing a Map and a Graph, Entering, and lifecycle on delete behave as they do today.
- A Reference to a Space shows the Map with no authoring.
- The plugin imports nothing but the Resource API.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
