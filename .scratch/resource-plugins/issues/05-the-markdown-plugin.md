# 05 — The Markdown plugin

Status: ready-for-agent

**Blocked by:** 02 — The Resource API and its hosts; 03 — The asset store.

**What to build:** Markdown as a plugin package, proving a plugin-owned mode. `open` moves into its Map content, default Closed and `withoutMap` Open, still differing from Map to Map. Open commits with a size hint in place of `opensToFit`. Editing is the plugin's: the Claim, the source editor, its draft and its four exits (ADR 0064), through the content commit. Whatever renderer and `MarkdownSourceEditor` it needs reach it through the Resource API or its own package.

Its text becomes an asset, exactly as Image's picture is, and its `content` is `{ url }`. **The current Markdown setup is explicitly abandoned:** there is no `<id>.md` beside a Resource file, no `path` or `mediaType` in `content`, and no stored `source`. It reads its text through `assets.read`, and when that is refused it draws a note and offers no Edit. Save stores the new text and commits its URL, and a store that is refused keeps the draft. A new one names the asset of zero bytes, so every path that mints one stays synchronous and stores nothing. `KindFileCodec` goes, with `encodeFileContent`, `decodeFileContent` and `sidecarNames`. The `\n` line-ending rule stays Markdown's, applied before it stores.

**Roll forward:** stored `open` on Markdown entries moves to Map content, `completeResourceBody` leaves `canvas-resource-authoring.ts`, and every tracked Markdown Resource's text moves to `assets/<hash>.md`. `newContent` and `EMPTY_MARKDOWN`, `initializeSpace` in `new-space.ts`, `create-and-connect` in `space-authoring.ts`, `default-content.ts`, `cube init`, `scripts/roadmap.ts`, `scripts/persistence-cost/scenarios.ts`, `src/mcp/aggregate-mcp-server.ts` and its test, `packages/graph/src/resource-file.ts`, Import's scan of `.md` files and its refusal of an unnamed one, `write-space-directory.ts`, `docs/aggregate-directory.md`, `docs/agents/editing-and-persistence.md`, `docs/schema/resource/`, the ADR 0128 entry in `AGENTS.md`, and the `infinity-cube-authoring` skill follow, with its version bump in all three plugin manifests.

**Acceptance:**

- A fresh Markdown Resource is Closed, on a read-only Map too. On the Stage it draws in full.
- Open on one Map and Closed on another survives a reload and an Export.
- An unresized Resource grows to its content on Open, displacing as a Resize does, and asks once.
- Save, `Mod-Enter`, Cancel and `Escape` behave as they do today, and a running edit holds the keyboard.
- Replacing the working Space discards a running draft.
- The host holds no `editing` state for a Markdown Resource.
- A Resource read from a file, a store and the wire is the same value, by a property test.
- No `.md` is written beside a Resource file, and a Save produces one Edit that changes the Resource's URL.
- A fresh Space and a `cube init` directory Export and re-Import with the first Resource's text present.
- An MCP client adds a Markdown Resource with tools alone, `check` naming the file it needs.
- An unreadable text draws a note and offers no Edit.
- `CI passed` is green.

## Decisions

- **The plugin is `packages/plugin-markdown`**, shaped as `plugin-ur` and `plugin-image` are: its domain half (`{ url }` content, `{ open }` Map content, `markdownText`) imports only `@project/resource-api/domain`, and its view half only `@project/resource-api/view`. The renderer and the source editor reach it as `ResourceHost.RenderedMarkdown` and `ResourceHost.SourceEditor`, which every host fills from `packages/ui/src/ResourceTextHost.tsx`, so CodeMirror stays inside `MarkdownSourceEditor`.
- **Open is Map content alone.** The host refuses `opened-resource` and `opened-resource-to-fit` for a Markdown Resource with `open-requires-content`, as it does an Ur or Image Resource, and intake refuses a Map entry storing one. There is no host Open, no Open-and-Expand and no `Enter` Open for Markdown; in Full View `Enter` only leaves. Open commits `{ open: true }` with a size hint at least `READING_WIDTH`, which the canvas caps (`capSizeHint`) and applies in the same `changed-map-content` Edit, displacing as a Resize does.
- **Every edit ends by returning focus to the Resource**, unless the author already moved it, as a renamed Title does: `PluginSurface` counts held Claims and returns focus when the last one ends. Its rail stays drawn while a Claim is held, so the exits stay reachable on an unselected Resource.
- **A Resource drawn twice is edited by one surface.** While a surface holds a Claim on a Resource, every other surface of that Resource is offered commits but no Claim, so a second embedding cannot start a second edit; another Resource's surfaces are offered nothing while any Claim is held.
- **`changed-content` is issue 04's** (its shape, its kind-schema check and `resource-content-invalid`); this issue adds only a Markdown case to its tests.
- **The empty asset gets no file.** A new Resource names the SHA-256 of nothing, so Export lists it as kept and writes no `assets/` entry for it, and Import reads it without one.
- **Stray `.md` files are neither read, refused nor removed.** Import's scan reads only `resources/*.json`, so a `.md` beside `space.json` or in `resources/` is not Import's and Export keeps it.
- **`check` notes a missing asset rather than refusing.** Import accepts a Resource whose asset is absent (the text then reads as refused, drawing the note); `check` prints which file it needs, which is what the MCP acceptance reads, and the MCP server gains `write_asset`, which writes bytes under the hash it names.
- **With both Markdown and Image plugins, the shared frame's content edit is gone.** `ResourceDisplay`'s `editing` arm, `KindEditByKind`, `ResourceContentEdit`, `CanvasResourceBodyEditor`, `CanvasArea.onBeginEdit`/`setContentEdit` and the canvas's body caret (`beginBodyEditing`, `bodyEditorResourceId`) had no kind left to serve and were deleted, ahead of issue 10. `availability.editResourceBody` stays, unread by any kind, for issue 10 to retire with the rest.
- **A Reference to a plugin's Resource draws the plugin in the old frame through one component**, issue 04's `EmbeddedPluginContent`, which now hands the text components too and draws no Title of its own, since the frame draws the Reference's.
- **Tests that drew the old frame as a Markdown Resource draw a Reference or Space Resource instead**; the frame's body-editor tests went with the body editor. A story's text reference is a stable fake hash whose last character is one a SHA-256 can end in, so it passes the canonical `isAssetRef`.
- **The key-binding inventory reads `packages/plugin-markdown/src`**, where the editor's `Escape` and `Mod-Enter` now live.
