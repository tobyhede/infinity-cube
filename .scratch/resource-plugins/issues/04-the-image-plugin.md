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

## Decisions

- **The plugin is `packages/plugin-image`**, its domain half (`imagePlugin`, the content schema, picture admission and `pictureSize`) importing only `@project/resource-api/domain` and its view half only `@project/resource-api/view`, as `packages/plugin-ur` is. Core reads it through `kindFromPlugin`; `kinds/image.ts` keeps an Image kind module only to override its facts so a Reference Resource to an image still draws its content area until issue 06.
- **"Stored `open` is removed" is read as "never `true`".** Every Map entry still stores `open` until Open moves into Map content, so Image entries store `open: false`, and intake refuses one stored Open, as it does an Ur Resource (`open-requires-content`). The tracked fixture's Harbour entry was rolled forward.
- **`replaced-image` is gone.** An ordinary content commit covers it: the new `changed-content` completion parses the content through the kind's schema (`resource-content-invalid` when it refuses) and then takes `edited-resource`'s checks. `image-replacement.ts`, `ImageReplaceTarget`, `ResourceImage` and the upload target are deleted, and so is the now unused shadcn `Skeleton`.
- **Replace by URL entry is dropped.** The issue names the picker and a drop; a URL is still a way to *create* an Image Resource (paste), which stays on today's path until issue 08.
- **The natural size is read from the header bytes** (`pictureSize`: PNG, GIF, JPEG, WebP), so a Replace records it deterministically with no browser load, and records none when the header does not say.
- **ADR 0126's hold is the plugin gate's exclusive work.** `OpenSpaces` owns one `PluginGate`, `OpenSpacesApplication` provides it, and `replacingImage` is published from `gate.exclusiveRunning()`, so a Replace in any composed Space withdraws authoring and navigation everywhere. The gate is reached only through `claim()?.exclusively(work)`, `own.store` and `own.content`.
- **`store` and `pick` reach a plugin only through the host's operations**, gated as its commits are: the plain `store` is refused and `pick` answers nothing while exclusive work runs, and the work's own `store` is live only while it runs. The application's `PluginAssetsProvider` supplies them; a surface reads only `url` and `read` from it directly.
- **Bare at rest is a plugin flag**, `bareAtRest`, which the host turns into `data-bare` while the Resource is unselected and in no Graph colour; the canvas still strokes the ring, and the border when selected or coloured.
- **The picture is fitted by `object-fit: contain`**, filling the rect at any size. The Stage draws it the same way through `EmbeddedPluginContent`, read-only, so it offers no Replace there.
- **`titleName` is published by `@project/resource-api/domain`** and re-exported by core, so the plugin names its picture as every surface does without reading a Title apart itself.
- **The e2e tests of a held Replace across entered Spaces, fragment links, conflicts and Reload were removed with the upload target** they drove. The hold they proved is now one mechanism, the gate, held by `open-spaces.test.tsx`, `dock-navigation-hold.test.tsx`, `space-resource-enter-hold.test.tsx`, `browser-location.test.ts`, `held-traversal.spec.ts` and the Replace-in-flight e2e test.
- **A plugin may declare it draws no Title (`drawsTitle: false`).** The Image plugin draws only its picture, but naming a new Resource and Rename from outside the plugin still open the Title editor. For a plugin that draws no Title, the host draws that editor over the plugin's rect while the Title is being renamed. The plugin's own rail Rename uses its own editor.
- **Rebased onto issue 03's review fixes.** The gate refuses every Edit at `complete` that is not the running exclusive work's own (`exclusive-work-running`), so a Markdown body Save during a Replace is refused while its editor keeps the draft (`canvas-resource-authoring.test.tsx`). `store` and `pick` are 03's `PluginHost.assets` wiring; this issue adds the Title and content commits beside them. The open set publishes the gate's exclusive work as `replacingImage`, which is ADR 0126's hold.
- **A Replace takes its Claim in the press, then opens the picker in it**, so a refused Claim opens no picker; a cancelled picker releases the Claim.
- **A refused rail Rename keeps the editor open with the draft** and shows the refusal; only a settled Title closes it. The editor is a recorded deviation in `design-system-inventory.ts`: the Resource API gives a plugin no way to open the host's Title editor from its own rail.
- **An asset reference is one rule on both sides of the API**: `@project/resource-api`'s `isAssetRef` takes only a canonical SHA-256 spelling, as core's asset hash does, and a property test in `packages/core/test/assets.test.ts` holds the two to one answer.
- **A picture is sized one way, from its bytes.** `pictureSize` turns a JPEG's frame as its Exif orientation says, as a browser draws it, and creation from files records the size `storePicture` reads with it; only a web URL, or a picture whose header says nothing, is measured by loading it.
- **A plugin package is a kind module to the import ban**: `@project/plugin-*` may be imported only under `kinds/` or by a listed one-kind feature. `picture-admission.ts` is listed, as Image creation's admission, until creation moves onto the Resource API (issue 08).
- **The held-Replace e2e coverage is restored through the plugin itself**: an entered Space's opener crumb, a fragment link's Back and Forward, Keep local and a retried failed save each with the Replace landing after, Reload withheld, and a Replace in an only-drawn Space editing that Space and not the canvas's.
