# Sites outside `kinds/` that name a Resource kind

Read on 2026-10-12, when ticket 10 was filed, refreshed on 2026-10-13 after candidates B, C, D and F, and checked row by row on 2026-10-14 after issues 12 and 13; line numbers are the last's. Issue 11 removed the Command Dock's Create sites (`CommandDockResources.tsx`, `command-dock-chrome.ts`, `dock-chrome.ts`'s Create routing and availability, and `InputFreeResourceKind`): each kind's app half now declares its Create.

Categories: **one-kind** = a feature that exists for that kind alone; **registry** = a dispatch among kinds that belongs in a registry; **C** = content command (Edit/Replace/author-space-view); **E** = creation; **F** = Space Resource selection; **display** = display state or glyph.

"G19 exemption" names the `KIND_FEATURE_FILES` entry in `eslint.config.js` that admits the site's import. "ESLint-blind" means the site names a kind without importing a kind module's export (a string literal of a `ContentAction` or display state), so neither the ESLint rule nor `kind-ids-in-modules.test.ts` sees it; it is only reached because its file is exempt for another import, or not at all.

## Kind module ids (`<kind>Kind.id`), counted by `ONE_KIND_FEATURES`

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/app/src/components/CommandDockSpaces.tsx:459 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/components/CommandDockSpaces.tsx:564 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |

`packages/app/src/canvas-resource-authoring.ts` no longer reaches a module id: a Markdown Resource's body is its plugin's (ADR 0142, resource-plugins issue 05), so the canvas keeps no Markdown completion.

`packages/app/src/resource-deletion.ts` no longer reaches a module id: Delete routes by `kindFlags(kind).ownsReferencedSpaces` (G02).

## Kind module types and values other than the id

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/core/src/index.ts:11-15 | `export *` of each kind module | all | package surface | core/src/index.ts |
| packages/ui/src/icons.tsx:287 | `ResourceBaseKind = Exclude<Resource['kind'], ReferenceKindId>` | reference | display (kinds a Reference badge sits on) | icons.tsx |

## Sites now off the list

- `packages/app/src/canvas-resource-decoration.ts`: the Space-only context fields, `SpaceResourceDocument` among them, moved into `packages/app/src/kinds/space.ts` (G20), so the file imports no kind module's export.
- `packages/app/src/resource-deletion.ts`: routes by the lifetime flag (G02).
- Candidate C (2026-10-13): `ContentAction` and its literals, the `replacing` display state, `CanvasResource`'s Replace label and glyph, and the literal checks in `canvas-resource-authoring.ts`, `SpaceCanvas.tsx`, `embedded-open-space-resource.ts` and `ResourceNode.tsx`. `resource-display.ts` left the exemptions.
- Issue 12 (2026-10-14): content provenance is `'self' | 'target'`, said by the registry and no kind module, and unresolved content is the registry's, so `resource-content.ts` names no kind and `PresentedResource.tsx` and `CanvasResource.tsx` read `UNRESOLVED_CONTENT` from it. `resource-content.ts` and `PresentedResource.tsx` left the exemptions.
- Resource plugins issue 02 (ADR 0142): an Ur Resource is drawn by its plugin, `packages/plugin-ur`, through the plugin hosts, and its Shape is its Map content. `CanvasResource.tsx`'s Ur branch and `isUrOperations` are gone, and `CanvasResource.tsx`'s exemption is the Space portal's alone. The plugin list and its adapters (`kinds/plugins.ts`, `kinds/plugin-kind.ts`, `kinds/plugin-views.tsx`) read every plugin alike and are kind-neutral; a plugin package counts as a kind module in `kind-ids-in-modules.test.ts`.

- Resource plugins issue 04 (ADR 0142): an Image Resource is drawn by its plugin, `packages/plugin-image`, which owns its content schema, picture admission and Replace. `image-replacement.ts` and the `replaced-image` completion are gone: Replace is the plugin's exclusive work, landing an ordinary `changed-content` Edit, so `space-authoring.ts` no longer names `imageKind.id` for it. `ImageNaturalSize` is the plugin's, so `core/src/types.ts` left the exemptions. Image creation keeps its sites until issue 08.

- Resource plugins issue 06 (ADR 0142): a Reference Resource is drawn by its plugin, `packages/plugin-reference`, which embeds its Target through the host-owned embedding (`packages/ui/src/ResourceEmbedding.tsx`) and keeps whether it is Open as its Map content. Whether a Resource is drawn by a plugin, and whether the application keeps its Open, are the registry's (`drawnByPlugin`, `takesOpen` in `core/src/kinds/registry.ts`), read from content and the Target's kind with no kind named; a Reference to a Space keeps the frame and the Map entry's `open` until issue 07. Reference creation keeps its two sites until issue 08, and `icons.tsx`'s badge stays a display of the Reference kind.

- Resource plugins issue 07 (ADR 0142): a Space Resource is drawn by its plugin, `packages/plugin-space`, which embeds the Map it selects through the host-owned Map embedding (`<Embed map={view} select={…} claim={…} />`) and keeps whether it is Open as its Map content. The embedding publishes what the plugin asks for, by placement, into a store the canvas reads (`packages/app/src/map-embeddings.ts`), so `embedded-open-space-resource.ts` and `SpaceCanvas.tsx` read the request rather than `spaceViewOf`, and the portal is a Claim the plugin passes: `CanvasResource.tsx`'s Space branch, `ResourceNode.tsx`'s portal toolbar, `isSpaceOperations`, `spaceViewOf` and `ui/src/index.ts`'s re-exports of them are gone. The Space menu and Enter in `resource-rail-actions.tsx` route by the kind-neutral `spaceSelection`, which a plugin declaring `selection` answers. `ui/src/index.ts`, `CanvasResource.tsx`, `ResourceNode.tsx` and `embedded-open-space-resource.ts` left the exemptions; `SpaceCanvas.tsx` keeps one for Image paste and `resource-rail-actions.tsx` for Create Reference's glyph. The Space glyph rows in `CommandDockSpaces.tsx` and the Space lifecycle's create stay (display, and creation until issue 08).

- Resource plugins issue 08 (ADR 0142): each plugin view declares how its Resources are created (`creates`), and the host does the creating (`packages/app/src/plugin-host/creation.ts`): placement from the gesture, the Title continuation, single flight per kind, the availability re-check after a wait, and a new Space through the coordinated lifecycle. Space Authoring's one creation completion, `created-resources`, takes any kind's content, so `space-authoring.ts` names no kind; picture admission, its refusals and the image-URL rule run inside `packages/plugin-image` (`src/creation.ts`), so `picture-admission.ts` is gone and `SpaceCanvas.tsx` asks the host whether a pasted URL is any plugin's; and the rail's Create rows are drawn from the plugins that create from a Resource, each with its own glyph, so `resource-rail-actions.tsx` names no kind. All four left the exemptions. The lifecycle's create and link take the plugin's document and have no default of their own, so `space-resource-planning.ts` left the exemptions too.

- Resource plugins issue 10 (ADR 0142): the shared frame is retired. `CanvasResource.tsx`, `resource-display.ts`, `ResourceRail.tsx`, `open-and-expand.tsx` and the registry's `drawnByPlugin`, `takesOpen`, `keepsMapContent` and `drawsKind` are gone, and with them the Map entry's `open`, the `canOpen` flag and the Open Edits. Every kind is drawn by `PluginResource` and `PresentedPluginResource`, whose code names no kind; `PluginResource.tsx` imports the Reference kind's stylesheet, `kinds/reference-canvas.css`, kept in the table below. No exemption was added. The rows above, and the `kinds/` halves kept below, are what still names a kind outside a plugin package, each with its reason.

## The `kinds/` halves kept outside a plugin package

Issue 10 listed the `kinds/` halves for removal, and they stay (its `## Decisions`, "`kinds/` halves kept"). Each still holds a part of every Resource kind that the plugin packages do not, and the host reads it through the registry. `kind-ids-in-modules.test.ts` counts every `packages/*/src/kinds/` file as a kind module, so neither that scan nor the import ban lists these files. They are recorded here so that "nothing outside a plugin package names a Resource kind, bar what this file keeps with a reason" holds. Folding them into their plugin packages is a later change, not part of issue 10.

| files | what each kind's module holds | why it stays |
|---|---|---|
| `packages/core/src/kinds/{markdown,image,reference,space,ur,default}.ts`, `registry.ts` | the kind's `PluginModule`, built from its plugin's domain half (`kindFromPlugin`): its content schema, flags, Resource and Space references, content Target, `selection`, `resolveContent`, `canonicalContent` and Map content default | intake, content resolution, Export and Space Authoring read these through `core`'s registry |
| `packages/ui/src/kinds/{markdown,image,reference,space,ur,default}.ts`, `registry.ts` | the kind's `PluginListing`: its names, glyph and bare operations | the Resources list, the Command Dock and `ResourceKindIcon` name and draw a kind through `ui`'s registry |
| `packages/ui/src/kinds/reference-canvas.css` | the Reference kind's dotted border on a Map | the border is the host's, outside the plugin's rect (ADR 0142), and `kind-stylesheet-order.test.ts` holds where it loads |
| `packages/app/src/kinds/{markdown,image,reference,space,ur,default}.ts`, `registry.ts` | the kind's canvas decoration: the part of the decoration context it reads and the plugin surface it builds | the canvas decorates every node through `decorateKinds`, one loop over the app registry |

## What is not covered by any mechanism

Candidate C removed the ESLint-blind literal sites (`ContentAction` literals and the per-kind display states). A new string literal that stands for one kind, in an exempt file or a non-exempt one, still passes both mechanisms.
