# 04 — The Image plugin

Status: ready-for-agent

**Blocked by:** 03 — The asset store.

**What to build:** Image as a plugin package. It draws its picture into the size it is given, with no drawn Title, and has no Open or Close. The Title stays its text alternative, and Rename is on the rail. Replace is a rail command and a drop on the picture: a Claim, then `exclusively`, then the asset store and a content commit (ADR 0126). `replaced-image` goes if an ordinary commit covers it. Open and expand is not offered.

**Roll forward:** stored `open` on Image entries is removed, and the Image sites in `.scratch/resource-kind-modules/kind-sites.md` go. Stories and e2e that look for the frame around an image follow.

**Acceptance:**

- An image on a Map is its picture at any dragged size, uncropped, with the Graph-colour border and ring drawn by the canvas.
- A Replace keeps identity, Title, placement and Edges, and withdraws authoring and navigation as ADR 0126 requires.
- On the Stage it fits the frame and offers no Replace.
- The image's accessible name is its Title.
- `CI passed` is green.
