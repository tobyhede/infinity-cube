# 09 — The default plugin

Status: ready-for-agent

**Blocked by:** 03 — The asset store; 07 — The Space plugin.

**What to build:** the default plugin, an ordinary plugin the host selects when a stored Resource's `kind` names no plugin in this build, in place of ADR 0120's refusal (`KIND_UNREGISTERED`). It draws the Title and says the kind is not available, in a rectangle. The Resource keeps every canvas capability and offers no authoring of its content or a Create.

Such a Resource is the same `Resource` value as any other, so the host carries it without reading it. A rename changes `title`, `content` and Map content stay unread JSON, and its assets travel by the walk from `03`. Delete removes the Resource, and an asset leaves the Export once nothing references it, while the store keeps it (ADR 0106). A plugin that returns reads the Resource as it stands.

While any plugin is missing, an unrooted Space is held rather than refused. A Resource with no `kind`, and content a present plugin's schema rejects, stay refused.

**Roll forward:** `packages/core/src/schema.ts`'s `kindedContent`, `docs/schema/resource/resource.schema.json`, `packages/graph/src/resource-file.ts`, the unrooted-Space check in `space-aggregate.ts`, `docs/aggregate-directory.md`'s ownership rules, `docs/agents/editing-and-persistence.md`, the `infinity-cube-authoring` skill, and tests asserting the refusal.

**Acceptance:**

- An Aggregate holding an unknown kind opens, and that Resource moves, connects, renames, deletes and presents.
- Run, edit another Resource and Export leave its canonically written `<id>.json` and its assets byte-identical, and its Map content unchanged as JSON.
- Rename → Export → Import shows the new Title, with `content` unchanged as JSON and its assets byte-identical.
- Delete → Export → Import leaves no such Resource and no asset only it referenced, and an asset another Resource references stays.
- For each of PostgreSQL and SQLite: Import, discard the source directory, Export into an empty directory, restore the plugin and Import that directory. The Resource reads through its plugin, and an asset that is not valid UTF-8 is byte-identical.
- Deleting a Resource with no plugin that alone rooted a Space, then restoring the plugin, refuses the aggregate naming that Space.
- An asset's file name and media type survive the round trip.
- A build that gains the plugin over a store already holding the Resource reads it through the plugin, with no Export or Import.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
