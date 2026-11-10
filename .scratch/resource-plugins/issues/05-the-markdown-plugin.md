# 05 — The Markdown plugin

Status: ready-for-agent

**Blocked by:** 02 — The Resource API and its hosts.

**What to build:** Markdown as a plugin package, proving a plugin-owned mode. `open` moves into its Map content, default Closed and `withoutMap` Open, still differing from Map to Map. Open commits with a size hint in place of `opensToFit`. Editing is the plugin's: the Claim, the source editor, its draft and its four exits (ADR 0064), through the content commit. Whatever renderer and `MarkdownSourceEditor` it needs reach it through the Resource API or its own package.

**Roll forward:** stored `open` on Markdown entries moves to Map content, and `completeResourceBody` leaves `canvas-resource-authoring.ts`.

**Acceptance:**

- A fresh Markdown Resource is Closed, on a read-only Map too. On the Stage it draws in full.
- Open on one Map and Closed on another survives a reload and an Export.
- An unresized Resource grows to its content on Open, displacing as a Resize does, and asks once.
- Save, `Mod-Enter`, Cancel and `Escape` behave as they do today, and a running edit holds the keyboard.
- Replacing the working Space discards a running draft.
- The host holds no `editing` state for a Markdown Resource.
- `CI passed` is green.
