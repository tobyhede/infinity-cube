# Prior art: block and rich-text editors

Read 2026-11-10, in source or first-party docs: Gutenberg `v24.3.1`, Editor.js `v2.31.7`, prosemirror-view `1.41.7`, TipTap `v3.33.0`, Lexical `v0.53.0`, Slate at `fd42a80`, BlockNote `v0.57.0`, obsidian-api at `879c936`. ProseMirror's model, its footnote example and Obsidian's developer docs were read at their default branches, unpinned. Logseq was not read. Issue text is maintainer statements, dated.

## Bottom line

One render plus capabilities matches where most of this family ended, and JSON content avoids Gutenberg's worst cost. But every system read tells a block it is read-only by flag or mode, and none withdraws by absent callback. No system offers a typed commit answer or a canvas-wide claim, so those two parts of our API have no precedent to borrow. The family's hardest-won knowledge is event arbitration, which our "wrapper plus claim" underspecifies.

## 1. Edit and read rendering

- **Gutenberg separates them.** [`save` must be pure](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-edit-save.md); it is re-run on load and compared with stored markup, and [context is unavailable to it](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-context.md). Its maintainer called the failure prompt ["the already infamous dialog"](https://github.com/WordPress/gutenberg/issues/7604) (2018, still open).
- **BlockNote has one [`render`](https://github.com/TypeCellOS/BlockNote/blob/v0.57.0/docs/content/docs/features/custom-schemas/custom-blocks.mdx)**, plus optional `toExternalHTML`, in a separate React root where context hooks fail.
- **Obsidian splits by mode:** [post processors for Reading view, CM6 extensions for Live Preview](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Editor/Editor%20extensions.md).

My reading: stored derived markup caused Gutenberg's pain, more than the split itself.

## 2. Read-only

All flags or modes:

- Editor.js passes [`readOnly`](https://github.com/codex-team/editor.js/blob/v2.31.7/types/tools/block-tool.d.ts). A tool must declare `isReadOnlySupported`, or [the whole editor throws](https://github.com/codex-team/editor.js/blob/v2.31.7/src/components/modules/readonly.ts).
- [`editor.isEditable`](https://github.com/ueberdosis/tiptap/blob/v3.33.0/packages/core/src/NodeView.ts) (TipTap), [`useReadOnly`](https://github.com/ianstormtaylor/slate/blob/fd42a8046db8da329f4584dcf2a68ac7abd3137b/packages/slate-react/src/hooks/use-read-only.ts) (Slate), [`getMode()`](https://github.com/obsidianmd/obsidian-api/blob/879c936660fcc45c90ee28ea6b4ef7068006477c/obsidian.d.ts) (Obsidian).
- Gutenberg has [`useBlockEditingMode`](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-editor/README.md), inherited by inner blocks. Previews set [`isPreviewMode` and disable the DOM](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-editor/src/components/block-preview/index.jsx). A [private symbol](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-editor/src/components/block-edit/index.tsx) carries that to blocks, and [Navigation branches on the setting](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-library/src/navigation/edit/index.jsx).

Nearest to absence: [bindings' optional `setValues` and `canUserEditValue`](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-bindings.md), not editable by default.

## 3. Drafts and commit

- Gutenberg attributes live in the store; the docs give `setAttributes` no answer. TipTap's [`updateAttributes` returns `void`](https://github.com/ueberdosis/tiptap/blob/v3.33.0/packages/core/src/types.ts).
- Editor.js's draft is the tool's DOM, pulled by `save()`. On `validate` failure the block is [logged and dropped from output](https://github.com/codex-team/editor.js/blob/v2.31.7/src/components/modules/saver.ts).
- Obsidian's view holds `data` and calls `requestSave`, debounced two seconds.
- Refusal as a commit answer: no public example found.

## 4. Arbitration

- ProseMirror asks [`stopEvent` per event up the target's ancestors](https://github.com/ProseMirror/prosemirror-view/blob/1.41.7/src/input.ts); [by default the editor handles everything](https://github.com/ProseMirror/prosemirror-view/blob/1.41.7/src/viewdesc.ts).
- [TipTap's default](https://github.com/ueberdosis/tiptap/blob/v3.33.0/packages/core/src/NodeView.ts) shows the real policy: inputs stop; drag, drop, cut, copy, paste and mousedown on selectable nodes go to the host. Its comments record typed text lost when the caret sticks in non-editable DOM, Safari ending drags on detached images, and an iOS/Android Enter bug.
- Lexical uses [prioritised commands returning handled](https://github.com/facebook/lexical/blob/v0.53.0/packages/lexical-website/docs/concepts/commands.md), and carries a [Firefox 152 `beforeinput` retargeting workaround](https://github.com/facebook/lexical/blob/v0.53.0/packages/lexical/src/LexicalEvents.ts).
- Slate voids [need an empty text child and `contentEditable={false}` "for Firefox"](https://github.com/ianstormtaylor/slate/blob/fd42a8046db8da329f4584dcf2a68ac7abd3137b/docs/api/nodes/element.md).
- Gutenberg needs [`useBlockProps` on the wrapper](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-api-versions/README.md) since API v2.

## 5. Nesting

- Gutenberg allows [one `InnerBlocks` per block](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-editor/src/components/inner-blocks/README.md), in one store. Context is namespaced and consumed only by explicit `usesContext`.
- A [Lexical nested editor](https://github.com/facebook/lexical/blob/v0.53.0/packages/lexical-react/src/LexicalNestedComposer.tsx) inherits theme, nodes and editable state but no plugins or command listeners.
- [ProseMirror's footnote example](https://github.com/ProseMirror/website/blob/master/example/footnote/index.js) mounts an inner view only while selected, remaps its steps into the outer transaction, forwards undo outward, and comments a focus "Kludge".
- Scoped exclusive claims: no public answer. Focus is left to the DOM and each editor's selection.

## 6. Schema and migration

- Gutenberg: ["By design, blocks lack any sort of version tracking"](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/blocks/src/api/parser/apply-block-deprecated-versions.ts); deprecations are tried in turn. The docs warn they are [not a chain](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-deprecation.md), so a new migration may need adding to several, and imported helpers should be snapshotted.
- Lexical says [evolve additively or register a new type](https://github.com/facebook/lexical/blob/v0.53.0/packages/lexical-website/docs/serialization/serialization.md), and deprecated `version` because it [does not compose with subclasses](https://github.com/facebook/lexical/blob/v0.53.0/packages/lexical-website/docs/serialization/legacy.md).
- **Preserving camp:** Gutenberg's [`core/missing`](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-library/src/missing/edit.jsx) and [retained raw source](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/blocks/src/api/parser/index.ts) "to avoid corruption and data loss"; Editor.js's [Stub](https://github.com/codex-team/editor.js/blob/v2.31.7/src/tools/stub/index.ts), also used [when render throws](https://github.com/codex-team/editor.js/blob/v2.31.7/src/components/modules/renderer.ts).
- **Refusing camp:** [ProseMirror](https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.ts) (read at `master`), [Lexical](https://github.com/facebook/lexical/blob/v0.53.0/packages/lexical/src/LexicalUpdates.ts) and [BlockNote](https://github.com/TypeCellOS/BlockNote/blob/v0.57.0/packages/core/src/api/nodeConversions/nodeToBlock.ts) throw.

## 7. Stability

- Gutenberg has [written compatibility rules](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/contributors/code/backward-compatibility.md) covering function, prop and block markup; class names and DOM are excluded.
- Enforcement is [lock/unlock with a consent string and an allowlist](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/private-apis/src/implementation.ts). Entries are kept because old npm copies throw at load without them.
- [`apiVersion` 3](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-api-versions/README.md) stopped shielding: WordPress 7.1 always iframes.
- Slate is [beta, breaking in minors](https://github.com/ianstormtaylor/slate/blob/fd42a8046db8da329f4584dcf2a68ac7abd3137b/docs/general/changelog.md). Lexical's `initialNodes`, marked for removal in 0.32, remains in 0.53.
- Obsidian offers `@public`, `@since`, `minAppVersion`. No promise found for Obsidian, TipTap, Editor.js or BlockNote in the files read.

## 8. Creation

- Gutenberg declares [`transforms.from`](https://github.com/WordPress/gutenberg/blob/v24.3.1/docs/reference-guides/block-api/block-transforms.md) by type, with `isMatch` and `priority`.
- Editor.js declares [`toolbox` and `pasteConfig`](https://github.com/codex-team/editor.js/blob/v2.31.7/docs/tools.md) (tags, patterns, MIME types). One tag goes to the first tool only; patterns run only on the default block under 450 characters.
- BlockNote declares `fileBlockAccept`, but slash items are wired separately.

## 9. Commands

- Gutenberg's [`BlockControls`](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-editor/src/components/block-controls/README.md) is drawn by the block, with arbitrary children. Its [Command Palette](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/commands/README.md) is data.
- Editor.js's `renderSettings` returns `HTMLElement | MenuConfig`: data was added, the element kept.
- Obsidian's `checkCallback(checking)` answers availability per command.

## 10. References

Only Gutenberg has a primitive here. [`core/block`](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-library/src/block/edit.jsx) holds `ref`, draws the target's blocks with no-op `onChange`, keeps overrides on the instance, offers "Edit original", guards recursion, and warns when deleted. Its [label is the target's title](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-library/src/block/index.js). Obsidian publishes `EmbedCache`, but no embed-render API in `obsidian.d.ts`. None found in the others.

## Where this family disagrees with our design

1. **Withdrawal is not inertness.** Gutenberg previews needed DOM disabling as well as a mode, and Navigation still needed to know. An absent `commit` stops writes, not a plugin's pointer, focus or local mode.
2. **"Not told the surface" has lost here before.** Our Embed must own recursion, or plugins will want the surface name.
3. **"No private door" is what Gutenberg's own [pattern block](https://github.com/WordPress/gutenberg/blob/v24.3.1/packages/block-library/src/block/edit.jsx) violates**, via `unlock`. Expect the pressure at Space's Map embed.
4. **A canvas-wide claim conflicts with nesting.** Nested editors here own their own state. Which canvas does a claim inside an embedded Map belong to?
5. **Wrapper plus claim omits TipTap's table**: paste, drop, drag, IME and caret escape.
6. **Strict schemas fight Lexical's additive rule**, and no preserving path means an external plugin dropped from the build blocks loading its aggregate. Fine for fixtures; unproven for external plugins.
7. **`Promise<Answer>` is unprecedented.** Editor.js shows the failure mode: rejected data vanishing quietly.

## Worth copying

- Editor.js's fail-fast, moved to build: test every plugin with each capability absent.
- Host-level recursion guard and deleted-target warning.
- TipTap's event policy as the API's written default.
- `priority` and a stated conflict rule on `accepts`.
- A held-bytes `missing` plugin if external plugins become real.
- Gutenberg's fixtures per old format, for plugins handling old content.
