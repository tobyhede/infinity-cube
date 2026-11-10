# Sites outside `kinds/` that name a Resource kind

Read on 2026-10-12, when ticket 10 was filed, refreshed on 2026-10-13 after candidates B, C, D and F, and checked row by row on 2026-10-14 after issues 12 and 13; line numbers are the last's. Issue 11 removed the Command Dock's Create sites (`CommandDockResources.tsx`, `command-dock-chrome.ts`, `dock-chrome.ts`'s Create routing and availability, and `InputFreeResourceKind`): each kind's app half now declares its Create.

Categories: **one-kind** = a feature that exists for that kind alone; **registry** = a dispatch among kinds that belongs in a registry; **C** = content command (Edit/Replace/author-space-view); **E** = creation; **F** = Space Resource selection; **display** = display state or glyph.

"G19 exemption" names the `KIND_FEATURE_FILES` entry in `eslint.config.js` that admits the site's import. "ESLint-blind" means the site names a kind without importing a kind module's export (a string literal of a `ContentAction` or display state), so neither the ESLint rule nor `kind-ids-in-modules.test.ts` sees it; it is only reached because its file is exempt for another import, or not at all.

## Kind module ids (`<kind>Kind.id`), counted by `ONE_KIND_FEATURES`

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/app/src/components/CommandDockSpaces.tsx:459 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/components/CommandDockSpaces.tsx:564 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/resource-rail-actions.tsx:93 | `referenceKind.id`: Create Reference glyph | reference | E (display of a creation) | resource-rail-actions.tsx |
| packages/app/src/resource-rail-actions.tsx:143 | `spaceKind.id`: Space Resource menu | space | one-kind | resource-rail-actions.tsx |
| packages/app/src/resource-rail-actions.tsx:254 | `spaceKind.id`: Space Resource Enter | space | one-kind | resource-rail-actions.tsx |
| packages/app/src/space-authoring.ts:116 | `imageKind.id`: new Image Resource document | image | E | space-authoring.ts |
| packages/app/src/space-authoring.ts:1364 | `referenceKind.id`: new Reference Resource | reference | E | space-authoring.ts |
| packages/persistence/src/space-resource-planning.ts:328 | `spaceKind.id`: new Space Resource document | space | E (lifecycle) | space-resource-planning.ts |

`packages/app/src/canvas-resource-authoring.ts` no longer reaches a module id: a Markdown Resource's body is its plugin's (ADR 0142, resource-plugins issue 05), so the canvas keeps no Markdown completion.

`packages/app/src/resource-deletion.ts` no longer reaches a module id: Delete routes by `kindFlags(kind).ownsReferencedSpaces` (G02).

## Kind module types and values other than the id

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/core/src/index.ts:11-15 | `export *` of each kind module | all | package surface | core/src/index.ts |
| packages/ui/src/index.ts:17-19 | re-exports `beginEditing`, `isSpaceOperations`, `spaceViewOf` | markdown, space | package surface | ui/src/index.ts |
| packages/ui/src/icons.tsx:263 | `ResourceBaseKind = Exclude<Resource['kind'], ReferenceKindId>` | reference | display (kinds a Reference badge sits on) | icons.tsx |
| packages/ui/src/CanvasResource.tsx:301 | `isSpaceOperations`: the Space rail and portal | space | one-kind (portal) | CanvasResource.tsx |
| packages/react-flow-adapter/src/ResourceNode.tsx:334 | `isSpaceOperations(...).portal.editing` keeps the toolbar | space | one-kind | ResourceNode.tsx |
| packages/app/src/components/SpaceCanvas.tsx:1015,1660 | `spaceViewOf(...).view.framing` | space | one-kind (the Space kind's embedded Map) | SpaceCanvas.tsx |
| packages/app/src/components/SpaceCanvas.tsx:1704 | `isAcceptedImageUrl`: paste creates an Image Resource | image | E (image-URL rule) | SpaceCanvas.tsx |
| packages/app/src/embedded-open-space-resource.ts:214 | `spaceViewOf` | space | one-kind (the Space kind's embedded Map) | embedded-open-space-resource.ts |
| packages/app/src/space-authoring.ts:114 | `Extract<ResourceDocument, { kind: ImageKindId }>` | image | E | space-authoring.ts |
| packages/app/src/space-authoring.ts:373,1336 | refusal `IMAGE_URL_UNSUPPORTED`, the Image plugin's code read through core | image | E (image-URL rule) | space-authoring.ts |
| packages/app/src/space-authoring.ts:1335 | `isAcceptedImageUrl` on Create | image | E (image-URL rule) | space-authoring.ts |
| packages/app/src/picture-admission.ts:10-25 | `admitImage`, `pictureSize` and its refusals from `@project/plugin-image/domain`: creation admits a picture by the plugin's rule | image | one-kind (Image creation, until issue 08) | picture-admission.ts |

## Sites now off the list

- `packages/app/src/canvas-resource-decoration.ts`: the Space-only context fields, `SpaceResourceDocument` among them, moved into `packages/app/src/kinds/space.ts` (G20), so the file imports no kind module's export.
- `packages/app/src/resource-deletion.ts`: routes by the lifetime flag (G02).
- Candidate C (2026-10-13): `ContentAction` and its literals, the `replacing` display state, `CanvasResource`'s Replace label and glyph, and the literal checks in `canvas-resource-authoring.ts`, `SpaceCanvas.tsx`, `embedded-open-space-resource.ts` and `ResourceNode.tsx`. `resource-display.ts` left the exemptions.
- Issue 12 (2026-10-14): content provenance is `'self' | 'target'`, said by the registry and no kind module, and unresolved content is the registry's, so `resource-content.ts` names no kind and `PresentedResource.tsx` and `CanvasResource.tsx` read `UNRESOLVED_CONTENT` from it. `resource-content.ts` and `PresentedResource.tsx` left the exemptions.
- Resource plugins issue 02 (ADR 0142): an Ur Resource is drawn by its plugin, `packages/plugin-ur`, through the plugin hosts, and its Shape is its Map content. `CanvasResource.tsx`'s Ur branch and `isUrOperations` are gone, and `CanvasResource.tsx`'s exemption is the Space portal's alone. The plugin list and its adapters (`kinds/plugins.ts`, `kinds/plugin-kind.ts`, `kinds/plugin-views.tsx`) read every plugin alike and are kind-neutral; a plugin package counts as a kind module in `kind-ids-in-modules.test.ts`.

- Resource plugins issue 04 (ADR 0142): an Image Resource is drawn by its plugin, `packages/plugin-image`, which owns its content schema, picture admission and Replace. `image-replacement.ts` and the `replaced-image` completion are gone: Replace is the plugin's exclusive work, landing an ordinary `changed-content` Edit, so `space-authoring.ts` no longer names `imageKind.id` for it. `ImageNaturalSize` is the plugin's, so `core/src/types.ts` left the exemptions. Image creation keeps its sites until issue 08.

## What is not covered by any mechanism

Candidate C removed the ESLint-blind literal sites (`ContentAction` literals and the per-kind display states). A new string literal that stands for one kind, in an exempt file or a non-exempt one, still passes both mechanisms.
