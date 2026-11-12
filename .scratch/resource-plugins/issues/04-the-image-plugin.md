# 04 — The Image plugin

Status: ready-for-agent

**Blocked by:** 03 — The asset store.

**What to build:** Image as a plugin package. It draws its picture into the size it is given, with no drawn Title, and has no Open or Close. The Title stays its text alternative, and Rename is on the rail. Replace is a rail command, a drop on the picture and a URL entered, as today (`image-replacement.ts`, ADR 0106): for a file, a Claim, the picker in the press, then `exclusively`, then the `store` and content commit it hands the work (ADR 0126); a URL the plugin accepts (`https:`, `http:` or a stored asset) takes the same path with no picker and no `store`. The plugin refuses a file that is not a picture format it draws, and SVG, as the host did (ADR 0106). `replaced-image` goes if an ordinary commit covers it. Open and expand is not offered.

**Roll forward:** stored `open` on Image entries is removed, and the Image sites in `.scratch/resource-kind-modules/kind-sites.md` go. Stories and e2e that look for the frame around an image follow.

**Acceptance:**

- An image on a Map is its picture at any dragged size, uncropped, with the Graph-colour border and ring drawn by the canvas.
- A Replace keeps identity, Title, placement and Edges, and withdraws authoring and navigation as ADR 0126 requires.
- Replacing by an entered URL keeps the same, and a URL the plugin does not accept is refused with copy and changes nothing.
- On the Stage it fits the frame and offers no Replace.
- The image's accessible name is its Title.
- `CI passed` is green.
