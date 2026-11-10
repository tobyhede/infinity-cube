# 03 — The Image plugin

Status: ready-for-agent

**Blocked by:** 02 — The asset store.

**What to build:** Image as a plugin package. It draws its picture into the size it is given, with no frame and no drawn Title, and has no Open or Close. The Title stays its text alternative, and Rename is on the rail. Replace is a rail command and a drop on the picture. A replacement stores through the asset store and commits content, its exclusivity (ADR 0126) coming from the claim. `created-images` and `replaced-image` go if ordinary content commits cover them.

**Roll forward:** stored `open` on Image entries is removed, and the Image sites in `.scratch/resource-kind-modules/kind-sites.md` go. Stories and e2e that look for the frame around an image follow.

**Acceptance:**

- An image on a Map is its picture at any dragged size, uncropped.
- A Replace keeps identity, Title, placement and Edges, and withdraws authoring as ADR 0126 requires.
- On the Stage it fits the frame and offers no Replace, because no commit is offered.
- The image's accessible name is its Title.
- `CI passed` is green.
