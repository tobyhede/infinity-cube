# Resource plugins

Delivery for [ADR 0142](../../docs/adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md), which supersedes ADR 0137 and refines ADR 0051, 0064, 0120, 0121, 0123, 0125, 0128, 0135 and 0139. The decision and its rejected options are in the ADR, and the terms in `CONTEXT.md`. This file is the plan, and the treatment an ADR does not bind.

## Where it starts

Read on 2026-11-10.

- One shared frame draws every Resource on a Map: `CanvasResource` in `packages/ui`, inside `ResourceNode` in `packages/react-flow-adapter`. It owns the Title ladder, the rail, Open and Close, the `editing` display arm and Save and Cancel. A kind fills its content area through `KindView.canvas`.
- A kind is three halves: `packages/core/src/kinds/`, `packages/ui/src/kinds/`, `packages/app/src/kinds/`. Those halves import package internals. Logic for a kind also lives outside them, as `completeResourceBody`, `image-replacement.ts`, `embedded-map.ts`; `.scratch/resource-kind-modules/kind-sites.md` lists the sites that name a kind.
- The Stage already bypasses the frame and calls the kind's `presented`.
- A Map entry is strict, `{ x, y, open?, size?, shape? }`, with no room for a kind's data. `open` is stored in 5 tracked `space.json` files.
- Open and expand (ADR 0137) is an application Edit, `SnapshotEdit.openAndExpand`, measured through `CanvasResource`.
- Image bytes are image-specific: `POST /images`, the `images` table, `storeImage`, and `loadReferencedImages` naming the kind in Export.

## The target

**The Resource API** is one new package, `@project/resource-api`, with a `/domain` entry that imports no React and a `/view` entry. **Each plugin is its own package** with those two halves, imports only `@project/resource-api`, and is listed once in the build-time plugin list. A lint ban holds the import rule. Each plugin declares an `apiVersion`, checked at build.

The domain half keeps what `KindModule` declares today and adds a Map content schema and `assetReferences(content)`.

The view half has **one render**, given `{ title, content, mapContent?, size, selected, graphColor, receded, capabilities }`. A capability is present or absent, and the render is not told which surface it is on.

| Capability | Who offers it |
| --- | --- |
| `commitContent(next)`, `commitMapContent(next)`, each answering `completed`, `unchanged` or `refused` | A Map, for a Resource that may be authored there. `commitMapContent` needs a Map. |
| Exclusive interaction claim, one canvas-wide | A Map |
| Rename | A surface where the Title may be authored |
| Asset store | A Map |
| Embed a Map, embed a Resource | Any surface. An embedded Resource gets no commit and no Map content. |

The API also exports the Title component (Title Lines, the one-activation control, its accessible names), `ResourceFrame` (ADR 0135 and ADR 0139's border, ring and receding on a rectangle) and the wrapper marking a region as the plugin's for the pointer.

**The stored `kind` field stays.** A Map entry becomes `{ x, y, size?, content? }`, with `content` parsed by the plugin's Map content schema.

## Settled treatment

Not bound by the ADR, and free to change with a story and a test.

- Rail: the canvas draws it with `CommandToolbar`. A plugin declares commands as data (label, icon, action or menu), which may change with its state. In-rect controls are allowed too.
- Title: Ur, Markdown and Reference draw it inline with the Title component. Image draws none, keeping it as its text alternative, and is renamed from the rail.
- Pointer: the whole rect moves and selects unless a plugin wraps a region, and a claim gives the plugin the whole rect.
- Selection and Graph colour: Markdown and Reference draw them with `ResourceFrame`, and Ur draws them on its Shape's outline from the same inputs. Image draws a border only when selected or in a Graph. The anchor handles and resize control stay the canvas's.
- Image: fits the whole picture into the size it is given, without cropping.
- Markdown editing: an Edit command or a press on the body takes the claim and shows the source editor. Save and Cancel are rail commands, and `Mod-Enter` and `Escape` still work. A click elsewhere still leaves the draft up (ADR 0064).
- A replaced working Space remounts the plugin, which discards a running draft (Replacement epoch).

## Order

Each step is its own PR, leaves `main` green and rolls fixtures, seeds and tests forward with it (ADR 0054). The old frame hosts any kind not yet moved.

1. `01` — the Resource API and its hosts, with Ur on it. Open and expand is not offered on a moved plugin, and goes altogether in `07`.
2. `02` — the asset store; `03` — Image, the proof of a Resource with no frame.
3. `04` — Markdown, the proof of a plugin-owned mode.
4. `05` — Reference, on the Resource embed.
5. `06` — Space, on the Map embed, last because it is the riskiest.
6. `07` — retire the shared frame and the core fields.

## Out of scope

Runtime-loaded plugins, host versioning of content, and renaming "Closed Size" (a rename ships alone). The Notes window draws no Resource yet; when it does, it is one more surface.
