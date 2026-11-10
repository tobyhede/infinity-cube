# 01 — The Resource API and its hosts, with Ur on it

Status: ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** `@project/resource-api` with its `/domain` and `/view` entries, as [`spec.md`](../spec.md) sets out, and the build-time plugin list. A Map host in `ResourceNode` draws the rect, handles, selection and rail around a plugin's render, and the Stage hosts the same render. Both fall back to today's `CanvasResource` and `presented` for a kind not yet moved. Map entries gain optional `content`, parsed by the plugin's Map content schema, committed through `commitMapContent` as an Edit, and carried through Import and Export.

Ur moves first because it is the smallest: its package holds its domain and view halves, it draws its own Shape, and `shape` moves into its Map content. The Title component, `ResourceFrame` and the pointer wrapper are built here. Ur uses the Title component and the pointer wrapper, and draws selection and Graph colour on its outline.

**Roll forward:** every stored Ur `shape` moves to Map content, `docs/schema/space.schema.json` follows, and `CanvasResource`'s Ur branch goes (`.scratch/resource-kind-modules/kind-sites.md`). The Shape Edit and intake refusal for another kind become that plugin's schema answering.

**Acceptance:**

- An Ur Resource keeps every Shape, per Map, through a reload, an Export and an Import.
- Ur imports nothing but `@project/resource-api`, and a lint rule fails any other import.
- A plugin with a wrong `apiVersion` fails the build.
- Ur's rendering takes the size it is given, and on the Stage it gets no commit and no Map content.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
