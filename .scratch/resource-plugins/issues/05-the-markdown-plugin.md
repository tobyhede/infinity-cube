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
