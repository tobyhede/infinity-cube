# 05 — The Reference plugin

Status: ready-for-agent

**Blocked by:** 03 — The Image plugin; 04 — The Markdown plugin.

**What to build:** the Resource embed, and Reference as an ordinary plugin on it. It keeps `{ open }` in its Map content. Closed, it draws its own Title. Open, it embeds its Target on a surface offering no authoring of the Target, handing the Target's plugin the Reference's Title and rename, so one Title draws and renaming it renames the Reference (ADR 0070). A Reference to a Space keeps today's path until `06`.

**Roll forward:** stored `open` on Reference entries moves to Map content, and the Reference sites in `.scratch/resource-kind-modules/kind-sites.md` go.

**Acceptance:**

- A Reference to Markdown, Image or Ur draws its Target's content with no Target commands, and its own Title once.
- Renaming it leaves the Target's Title alone.
- Referencing stays one hop.
- `CI passed` is green.
