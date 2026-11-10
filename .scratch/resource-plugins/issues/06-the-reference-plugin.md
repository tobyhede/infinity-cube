# 06 — The Reference plugin

Status: ready-for-agent

**Blocked by:** 04 — The Image plugin; 05 — The Markdown plugin.

**What to build:** the Resource embedding, and Reference as an ordinary plugin on it. It keeps `{ open }` in its Map content. Closed, it draws its own Title. Open, it embeds its Target on a surface offering no authoring of the Target, passing the Reference's Title and rename, so the Target's plugin draws that Title as it draws any (ADR 0070). The embedding guards recursion and a deleted Target. A Reference to a Space keeps today's path until `07`.

**Roll forward:** stored `open` on Reference entries moves to Map content, the Reference sites in `.scratch/resource-kind-modules/kind-sites.md` go, and ADR 0123's "own name over the Target's content" gives way for a Target that draws no Title.

**Acceptance:**

- An Open Reference to Markdown or Ur draws its own Title once, with no Target commands.
- An Open Reference to an Image is a picture with the Reference's Title as its text alternative, renamed from the rail.
- Renaming it leaves the Target's Title alone.
- Referencing stays one hop, and a deleted Target draws a note.
- `CI passed` is green.
