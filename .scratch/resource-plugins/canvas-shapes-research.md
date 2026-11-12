# Prior art: spatial canvases and custom object types

**A pre-ADR assessment.** Written on 2026-11-10 against the draft design, before ADR 0142 was accepted, and kept as written. Where it disagrees with the design it read, the ADR and [`spec.md`](spec.md) record what was decided.

Read 2026-11-10. Pins: tldraw `v5.6.0`; `@xyflow/react` 12.12.1 at `1bc405c`; Excalidraw 0.18.0 at `701b901`; BlockSuite in-tree at AFFiNE `63297bc` (0.27.5); Figma `plugin-typings` `dff4874`, `widget-typings` `8815555`; JSON Canvas 1.0 at `456f843`; `obsidian-api` `879c936`. Figma and Miro prose docs carry no version.

## Bottom line

Our commands-as-data, withdrawn commit and strict intake all have support here. Three things do not. Hosts with non-rectangular objects make the object **declare its outline** and draw selection themselves; our `Surface` has no geometry, so Edges cannot land on an Ur Shape's outline. tldraw, React Flow and BlockSuite all give the object **resize constraints**; we give none. And **no write path I read has an async refusable commit or an awaited exclusive operation** (Miro's write path not read).

## 1. Ownership

- **tldraw:** the plugin must supply [`getGeometry` and `getIndicatorPath`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/ShapeUtil.ts#L228-L250); the host [strokes selected, hovered and hinting outlines on an overlay](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/indicators.mdx). Flags such as [`hideResizeHandles`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/ShapeUtil.ts#L463) opt out of host chrome. [`getHandles` and `canBind`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/ShapeUtil.ts#L312) declare connection behaviour.
- **React Flow** is nearest to us, and further: the wrapper [gives only a `selected` class](https://github.com/xyflow/xyflow/blob/1bc405cd113618c17fd181b931a9fe573bec9fee/packages/react/src/components/NodeWrapper/index.tsx#L195) and the node [renders `NodeResizer` and `Handle` itself](https://reactflow.dev/api-reference/components/node-resizer). Even resize controls and connection points are the plugin's.
- **BlockSuite:** a host [selected-rect widget draws resize handles](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/widgets/edgeless-selected-rect/src/resize-handles.ts); the model answers [`getNearestPoint`, `includesPoint`](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/framework/std/src/gfx/model/gfx-block-model.ts#L218-L246).
- **JSON Canvas:** edges attach to [four sides only](https://github.com/obsidianmd/jsoncanvas/blob/456f843cb293df4f4ab1763e22ccb46a80b307c8/spec/1.0.md), so everything is a rectangle.

## 2. Two stores

No system here has a generic per-placement plugin store. A tldraw shape is one record on one page. Figma keeps [`widgetSyncedState` on the node](https://github.com/figma/plugin-typings/blob/dff4874ca083e18cd74835fd5afc5079d46866b7/plugin-api.d.ts#L12158), and `cloneWidget` copies it, so copies diverge. The real analogue is **a placement that is its own object**: a JSON Canvas `file` node holds geometry, colour and `subpath` beside a shared file; BlockSuite's synced-doc block holds [`scale`, `preFoldHeight`](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/blocks/embed-doc/src/embed-synced-doc-block/configs/edgeless-interaction.ts) beside a shared doc.

## 3. Withdrawal and surface

Nobody relies on absence alone.

- tldraw has reactive [`useReadonly`/`getIsReadonly`](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/readonly.mdx), and [`useSvgExportContext`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/types/SvgExportContext.tsx#L93) reveals an export. [`canEditInReadonly`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/ShapeUtil.ts#L348) lets a plugin stay interactive in a viewer; [Embed uses it](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/tldraw/src/lib/shapes/embed/EmbedShapeUtil.tsx#L204).
- Figma names the surface outright: [`figma.editorType`, `figma.mode`](https://github.com/figma/plugin-typings/blob/dff4874ca083e18cd74835fd5afc5079d46866b7/plugin-api.d.ts#L29-L65). Its view-only widget behaviour: no public answer found.
- React Flow passes [flags](https://github.com/xyflow/xyflow/blob/1bc405cd113618c17fd181b931a9fe573bec9fee/packages/system/src/types/nodes.ts) (`draggable`, `selectable`, `isConnectable`). Excalidraw hands [`appState`](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/types.ts#L1068) to the render.
- Writes on a read-only store fail **silently**: tldraw [returns](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/Editor.ts#L9089); BlockSuite [logs and returns](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/framework/store/src/model/store/store.ts#L947). Our absent `commit` is stricter.

## 4. Edit modes and arbitration

- **tldraw:** [`canEdit`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/Editor.ts#L2828) gates entry; one [`editingShapeId`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/Editor.ts#L2805) per page, set synchronously. [Shortcuts turn off while it is set](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/tldraw/src/lib/ui/hooks/useKeyboardShortcuts.ts#L199). Regions: the shape toggles [`pointerEvents` and calls `markEventAsHandled`](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/examples/src/examples/shapes/tools/editable-shape/EditableShapeUtil.tsx). Nesting is [focused groups](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/shapes.mdx).
- **React Flow:** class markers [`nodrag`, `nowheel`, `nopan`](https://github.com/xyflow/xyflow/blob/1bc405cd113618c17fd181b931a9fe573bec9fee/packages/react/src/container/ReactFlow/index.tsx#L121-L123). Modes are wholly the node's.
- **Excalidraw:** host state [`activeEmbeddable: {element, state: "hover"|"active"}`](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.tsx#L1639) decides when an iframe gets the pointer.
- **BlockSuite:** [`editing` is a flag on the selection](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/framework/std/src/gfx/selection.ts#L28).
- **Figma:** a [fixed component vocabulary](https://github.com/figma/widget-typings/blob/8815555bab1cf358ee9958fe2fa2cf46f77f3fb6/widget-api.d.ts#L618-L628); [`Input` commits on blur](https://developers.figma.com/docs/widgets/text-editing/).

Every mode here is a host-held synchronous marker. None has `exclusively(work)` or `'busy'`.

## 5. Commit path

All those read are synchronous or void: tldraw `updateShape` returns the editor; React Flow [`updateNodeData`](https://github.com/xyflow/xyflow/blob/1bc405cd113618c17fd181b931a9fe573bec9fee/packages/react/src/types/instance.ts#L154); Figma's setter is [`void`, and a value is last-writer-wins](https://developers.figma.com/docs/widgets/widget-state-and-multiplayer/), so concurrent clients clobber; BlockSuite writes to Yjs. A refusal surfaced to the object: none found. tldraw's nearest is [`onBeforeUpdate`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/ShapeUtil.ts#L733), which rewrites rather than refuses.

## 6. Titles

Not required anywhere. tldraw's [`getShapeName`](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/ShapeUtil.ts#L217) is optional, and it is announced rather than drawn. JSON Canvas has `label` on groups only.

## 7. Creation

Separate from the object type. tldraw has [tools](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/tools.mdx) plus [`registerExternalContentHandler('files'|'url'|'text')`](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/external-content.mdx): **one handler per content type**, keyed by what arrived. BlockSuite uses [slash-menu data](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/blocks/embed-doc/src/embed-linked-doc-block/configs/slash-menu.ts). Excalidraw only [validates embeddable URLs](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/types.ts#L1062).

## 8. Embedding

Only BlockSuite draws one object inside another with a full host: [a nested `BlockStdScope`](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/blocks/embed-doc/src/embed-synced-doc-block/embed-synced-doc-block.ts#L207) over a store [opened `readonly: true`](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/blocks/embed-doc/src/embed-synced-doc-block/embed-synced-doc-block.ts#L415), with [a cycle walk up ancestor hosts](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/blocks/embed-doc/src/embed-synced-doc-block/embed-synced-doc-block.ts#L423) written in the block, not the framework. tldraw offers parenting on the same page, not a render-another API; Excalidraw offers iframes.

## 9. Stability and migration

- **tldraw:** per-type [`up`/`down` sequences](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/persistence.mdx), with `down` serving older peers. A missing util: [`getShapeUtil` throws](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/Editor.ts#L1439), and the [per-type union validator](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/tlschema/src/records/TLShape.ts#L571) has no arm for it.
- **React Flow:** [error 003 and fallback to `default`](https://github.com/xyflow/xyflow/blob/1bc405cd113618c17fd181b931a9fe573bec9fee/packages/react/src/components/NodeWrapper/index.tsx#L59).
- **Excalidraw:** unsupported types are [filtered out of the restored array](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/data/restore.ts#L762), which loses them.
- **BlockSuite:** [stores `sys:version`](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/framework/store/src/model/store/crud.ts#L85); an unknown flavour [renders nothing with a warning](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/framework/std/src/view/element/lit-host.ts#L71) and [model creation throws](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/framework/store/src/model/block/sync-controller.ts#L133). I did not find a block migration runner in what I read.
- **Figma:** [inserted widgets stay on their version; defaults are all-or-nothing; do not rename keys; a safe update path is still "actively" being worked on](https://developers.figma.com/docs/widgets/stability-and-updates/). What an unpublished widget does: not stated.
- **JSON Canvas:** the spec is silent on unknown types; [Obsidian's typings keep arbitrary keys "for forward compatibility"](https://github.com/obsidianmd/obsidian-api/blob/879c936660fcc45c90ee28ea6b4ef7068006477c/canvas.d.ts#L14).

## 10. Commands

Mostly data, host-drawn. [Miro](https://developers.miro.com/docs/add-custom-actions-to-your-app): label, icon, `selection`, a query `predicate`, experimental, private apps. [Figma `usePropertyMenu`](https://developers.figma.com/docs/widgets/api/properties/widget-usepropertymenu/): typed items on selection (the page does not say who draws it; the JSX vocabulary has no menu, so I infer the host). [BlockSuite toolbar](https://github.com/toeverything/AFFiNE/blob/63297bca3457d8496eb19ccc0e5cd46941c4c1b1/blocksuite/affine/shared/src/services/toolbar-service/action.ts): `when`, `active`, `disabled`, `generate`, **plus a `content` template escape hatch**. tldraw: [host actions via `overrides`](https://github.com/tldraw/tldraw/blob/v5.6.0/apps/docs/content/sdk-features/actions.mdx); `ShapeUtil` declares none. Drawn by the plugin: React Flow `NodeToolbar`, Excalidraw `renderTopRightUI`.

## Where this family disagrees with our design

1. **No geometry.** The Ur plugin draws a Shape outline, but the canvas owns Edges and anchors. tldraw and BlockSuite answer this with a required geometry declaration. Without one, an Edge meets the rect, not the diamond.
2. **ADR 0142 rejected a strawman.** "Canvas draws the ring, a plugin opts out" is not tldraw's option: the plugin declares a path and the host strokes it. That needs no special path and makes the selection ring impossible for a plugin to skip.
3. **Resize has no plugin voice.** tldraw has `canResize`, `isAspectRatioLocked`, `onResize`; React Flow `shouldResize`; BlockSuite `resizeConstraint`, `handleResize`. "A plugin asks for no size" also rules out a minimum or an aspect lock.
4. **`Promise<Answer>` and `exclusively` have no precedent here.** Every comparable mode is a synchronous host marker. The family's async is CRDT merge, not refusal. Our shape may be right for a server-validated store, but nothing here validates it, and a claim held across an await has no stale-claim prior art.
5. **Claim conflates interacting with authoring.** The spec offers it only on a Map. tldraw's `canEditInReadonly` exists because viewers need interaction, such as an embedded iframe.
6. **Durability.** "Handles old content in its own schema" leans on ADR 0054 roll-forward, which an external plugin's Aggregate directory does not get. The one SDK here that solved this has per-type sequences. Figma shows the cost of not having them.
7. **`creates?` is keyed by plugin; paste and drop arrive keyed by content.** Two plugins claiming a PNG has no answer.

## Worth copying

- Declared outline, host-stroked (tldraw).
- Resize constraints as data (BlockSuite `resizeConstraint`).
- Host cycle check and read-only store for Embed (BlockSuite did it per block; ours can be in `Embed`).
- `markEventAsHandled` semantics for the pointer wrapper; `nowheel` as a separate marker (React Flow).
- Declared accessible name (`getShapeName`) for pictures with no drawn Title.
- Host-held "active" state for iframes (Excalidraw).
- Keep commands-as-data, but decide now whether a `content` escape hatch exists.
