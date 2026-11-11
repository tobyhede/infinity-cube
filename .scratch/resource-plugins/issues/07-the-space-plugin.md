# 07 — The Space plugin

Status: ready-for-agent

**Blocked by:** 06 — The Reference plugin.

**What to build:** the Space target of the one `Embed` in the Resource API, and Space as a plugin on it. The embedded-read machinery and `createMapSurface` sit behind the embedding, the `portal` is replaced by a Claim passed to it, and Space's own commands come from `<Rail>`; the shown Space's commands (the view chooser, and its Map and Graph authoring under the passed Claim) come from the embedding, never from a kind check. Nested Claims follow [`spec.md`](../spec.md): the deepest shows its commands, and authoring stops at today's depth (`mapSurfacePolicy`). A Space Resource Closed still requests nothing. On the Stage it draws its Map (ADR 0140). Aggregate rules (cycles, lifetime, rooting) stay in the core (ADR 0128). A Reference to a Space moves to the embedding here.

**Roll forward:** stored `open` on Space entries moves to Map content, and the Space sites in `.scratch/resource-kind-modules/kind-sites.md` go, including those in `CanvasResource`, `ResourceNode` and `SpaceCanvas`.

**Acceptance:**

- Authoring a Map in place, choosing a Map and a Graph, Entering, and lifecycle on delete behave as they do today.
- Replace on an Image inside the embedding withdraws every composed Space, and the outer Claim holds until it ends.
- While it runs, a commit the Space plugin retained for changing its selected Map or closing it answers refused and changes nothing, and the replacement still lands.
- A Reference to a Space shows the Map with no authoring.
- The plugin imports no `@project/*` package but the Resource API.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
