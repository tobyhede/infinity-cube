# 09 — The default plugin

Status: ready-for-agent

**Blocked by:** 03 — The asset store.

**What to build:** the default plugin, an ordinary plugin the host selects when a stored Resource's `kind` names no plugin in this build, in place of ADR 0120's refusal (`KIND_UNREGISTERED`). It draws the Title and says the kind is not available, in a rectangle. The Resource keeps every canvas capability and offers no authoring of its content or a Create.

While any plugin is missing, the host deletes nothing it cannot prove is unreferenced: Resource content and Map content round-trip unread, `resources/<id>.*` files are left alone by Import and Export, `images/` is not pruned, and an unrooted Space is held rather than refused. A Resource with no `kind`, and content a present plugin's schema rejects, stay refused.

**Roll forward:** `packages/graph/src/resource-file.ts`, the unrooted-Space check in `space-aggregate.ts`, `docs/aggregate-directory.md`'s ownership rules, `docs/agents/editing-and-persistence.md`, the `infinity-cube-authoring` skill, and tests asserting the refusal.

**Acceptance:**

- An Aggregate holding an unknown kind opens, and that Resource moves, connects, renames and presents.
- Run, edit and Export leave its file, sidecars, content and Map content byte-identical.
- A picture only it could reference survives Export.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
