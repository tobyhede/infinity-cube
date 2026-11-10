# 04 — The Markdown plugin

Status: ready-for-agent

**Blocked by:** 01 — The Resource API and its hosts.

**What to build:** Markdown as a plugin package, proving a plugin-owned mode. `open` moves into its Map content, still differing from Map to Map. Editing is the plugin's: the claim, the source editor, its draft and its four exits (ADR 0064), through `commitContent`. Whatever renderer and `MarkdownSourceEditor` it needs reach it through the Resource API or its own package. With no Map content, as on the Stage, it draws in full.

**Roll forward:** stored `open` on Markdown entries moves to Map content, and `completeResourceBody` leaves `canvas-resource-authoring.ts`.

**Acceptance:**

- Open on one Map and Closed on another survives a reload and an Export.
- Save, `Mod-Enter`, Cancel and `Escape` behave as they do today, and a running edit holds the keyboard canvas-wide.
- Replacing the working Space discards a running draft.
- The host holds no `editing` state for a Markdown Resource.
- `CI passed` is green.
