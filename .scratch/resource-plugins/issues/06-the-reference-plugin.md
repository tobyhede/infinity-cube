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

## Decisions

- **The plugin is `packages/plugin-reference`**, shaped as the other plugins are: its domain half (`{ target }` content, its one Resource reference and content Target, `{ open }` Map content, Closed by default and Open where there is no Map, no `newContent` since it is created from its Target) imports only `@project/resource-api/domain`, and its view half only `@project/resource-api/view`. Closed it draws its Title and its glyph (labelled with the plugin's name, at the face's top-right corner, as the canvas drew a kind glyph); Open it draws `surface.Embed` with its Target and its own `surface.title`; Open and Close are rail commands committing `{ open }` with no size hint, and a refusal is said in a status line.
- **The embedding is the host's, `HostEmbed` in `packages/ui/src/ResourceEmbedding.tsx`**, one component for every surface's lifetime that reads what it draws from context (`EmbeddingProvider`), so a render of the surface never remounts what it embeds. It mounts the Target's plugin entry on a surface with the plugin's `withoutMap` Map content, no content, Map content, Claim, store or pick, and one commit: the passed Title's. It shares the embedding Resource's rail and own region, so the Target's rail commands join the Reference's rail, which is where a picture's rename is.
- **The embedding offers only what the surface's own content references.** The Map projection and the Stage hand a plugin-drawn Resource `embeddable`, the Resources its content references (`referencedResources` in `@project/graph`), and a Resource embedded inside an embedding embeds nothing further. Notes, drawn in the rect with the shared `.resource-failure` class: recursion, a deleted Target, and a Target whose kind may not be one (not a plugin kind, or not `mayBeTarget`).
- **A Title commit the embedded plugin kept is refused once the embedded surface is gone** (`commitWhileDrawn`), whatever the surface around it still offers. Its test is a unit test of that function: the embedded plugin is resolved from the registry, so no test plugin can be dropped in to retain a commit, and adding a seam for one was more machinery than the rule.
- **On the Map, the passed Title is drawn with the Map's own rename** (the embedding Resource's: Edit Title, the inline editor), read-only where the passed Title carries no commit. Over a Target that draws no Title (an Image), the Map's Title editor is drawn over the plugin while a rename runs, which is where ADR 0123's "own name over the Target's content" gives way: the Reference's name is the picture's text alternative and is not drawn over it.
- **A Reference to a Space Resource keeps today's path until issue 07.** Whether a Resource is drawn by its plugin is `drawnByPlugin` (a plugin kind whose content Target, if any, is a plugin kind), and whether the application keeps its Open is `takesOpen(resource, resourceOf)`, both in `core/src/kinds/registry.ts` and naming no kind; intake, the Open Edit, the canvas and the projection read them. Such a Reference keeps `open` on its Map entry, gets no Map content from the projection, and is drawn by `CanvasResource`. `ResourceNodeData` carries `takesOpen`, so the canvas decoration needs no lookup of the Target.
- **Roll forward:** the fixtures' `"open": false` on Reference entries to Markdown Resources is dropped (the plugin's default is Closed). Tests that used a Reference as "a kind the host keeps Open for" now use a Space Resource or a Reference to one. The Ladle stories draw the Reference through the plugin with `mapContent`/`commitMap`/`commitTitle` on `CanvasResourceNodeSpecimen`; the application e2e and Ladle Reference proofs Open from the rail (Enter now leaves a plugin's Open alone, as for Markdown) and the Image Reference proof renames from the rail and reads both stored Titles.
- **The plugin views no longer carry a `canvas`/`presented` content view for Image and Markdown in `ui`'s `kinds/`**, since nothing draws an Image or Markdown Target in the old frame any more; `EmbeddedPluginContent` and `NoEmbed` are gone. `CanvasResource`'s content-area machinery stays for issue 10, and its tests now use unresolved content.
- **The Reference's dotted border is not drawn on the plugin path**: the plugin host draws one border for every plugin, and its glyph is what tells a Reference apart there. The `Kinds` story's dotted border is `CanvasResource`'s, which still draws a Reference to a Space Resource.
- **Reference creation is unchanged until issue 08**, so its two kind-sites rows stay (with refreshed line numbers), as does `icons.tsx`'s badge type.
- **The `infinity-cube-authoring` skill and `docs/aggregate-directory.md` say where a Reference keeps its Open**, and the plugin manifests are bumped to 0.1.4.
