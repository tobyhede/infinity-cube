# 07 — The Space plugin

Status: ready-for-agent

**Blocked by:** 06 — The Reference plugin.

**What to build:** the Space target of the one `Embed` in the Resource API, and Space as a plugin on it. The embedded-read machinery and `createMapSurface` sit behind the embedding, the `portal` is replaced by a Claim passed to it, and Space's own commands come from `<Rail>`; the shown Space's commands (the view chooser and framing, Enter, and its Map and Graph authoring under the passed Claim) come from the embedding, never from a kind check. The plugin keeps its authored framing (ADR 0112) in the view it passes, so choosing another Map drops it and reframing commits it. Nested Claims follow [`spec.md`](../spec.md): the deepest shows its commands, and authoring stops at today's depth (`mapSurfacePolicy`). A Space Resource Closed still requests nothing. On the Stage it draws its Map (ADR 0140). Aggregate rules (cycles, lifetime, rooting) stay in the core (ADR 0128). A Reference to a Space moves to the embedding here.

**Roll forward:** stored `open` on Space entries moves to Map content, and the Space sites in `.scratch/resource-kind-modules/kind-sites.md` go, including those in `CanvasResource`, `ResourceNode` and `SpaceCanvas`.

**Acceptance:**

- Authoring a Map in place, choosing a Map and a Graph, framing, Entering, and lifecycle on delete behave as they do today.
- Replace on an Image inside the embedding withdraws every composed Space, and the outer Claim holds until it ends.
- While it runs, a commit the Space plugin retained for changing its selected Map or closing it answers refused and changes nothing, and the replacement still lands.
- A Reference to a Space shows the Map with no authoring.
- A Space with no view shows that Space's `defaultMap` (and the Graph the host opens it on).
- A view chooser is offered by passing a commit: the host's chooser writes only through that commit, so whatever withdraws it withdraws the choice. No commit, no chooser.
- Embed commands come from the `Embed`, never from a kind check. Authoring the shown Space (its Resources, Edges, Maps and Graphs, and their rename, create, delete, recolour) appears only under a Claim the plugin passes.
- The plugin imports no `@project/*` package but the Resource API.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
