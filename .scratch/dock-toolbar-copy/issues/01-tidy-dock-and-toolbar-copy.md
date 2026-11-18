# 01: Tidy the Command Dock and canvas toolbar copy

**What to build:** an author reads one consistent voice across the Command Dock, the persistence report beside it, the Resource rail and actions menu, the Edge toolbar, the Resources list and the delete confirmation. Every icon-only canvas command shows a tooltip on hover and focus, as every Dock control already does. Making something says Create, placing an existing Resource on a Map says Add, and menu rows say New. Status and dialogs use plain words rather than the code's ("Persisted", "local", "build", "slot"). Menu rows are sentence case with domain nouns (Space, Map, Graph, Resource, Edge, Title, Full View) capitalised, and Space is capitalised in prose too.

The source is the copy review of 2026-11-17 (Claude Doc "UX copy review: Command Dock and canvas toolbars"). The recommended strings are restated below so this ticket stands alone.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Tooltips and names on the canvas toolbars

- [ ] Every Resource rail command and every Edge toolbar command shows a tooltip on hover and keyboard focus. The tooltip carries the command's words without the Resource or Edge name: Open, Close, Edit, Save, Cancel, Done editing, Replace image, More actions (the actions trigger); Rename, Show title / Hide title, Delete Edge on an Edge.
- [ ] A Space Resource's Done is named "Finish editing Resource <name>", not "Done Resource <name>".
- [ ] The Edge toolbar's title command is named "Rename Edge <name>", not "Edit Edge <name>", matching Image's "Rename Resource <name>".
- [ ] The Edge title toggle is a pressed/unpressed toggle named "Show Title <name>" whose icon draws its state, or a plain button whose icon draws the action its name says. Icon and name no longer disagree.
- [ ] Each accessible name still contains its visible label (UI-37).

## One verb per act

- [ ] The shortcut sheet's `C` row reads "Create a Markdown Resource" (naming the default kind, as the Dock's Create tooltip does), not "Add a Resource".
- [ ] "Add <name> to Map" in the Resources list, "New Map" and "New Graph" are unchanged.

## Persistence report

- [ ] Resting cue "Persisted" becomes "Up to date". No resting control's name matches `/save/i` (ADR 0030 still holds).
- [ ] "Persistence rejected" becomes "Changes rejected".
- [ ] The conflict dialog's title is "Your changes conflict with a newer version"; its buttons are "Discard mine and reload" and "Keep mine and save"; "Unable to keep local" becomes "Couldn’t keep your changes".
- [ ] "Changes not saved", "Saving changes", "Changes saved" and the Spaces menu's "Save conflict / Save failed / Save rejected" are unchanged.

## Delete confirmation

- [ ] The title quotes free-text names and lowercases "from": “Delete “Map fixture” from this Space?”, “Delete “Long” from “Map fixture”?”, and the same shape for a Resource and an Edge.
- [ ] Descriptions read: Map, "Deletes this Map and all its Graphs. Its Resources stay in the Space. This can’t be undone."; Graph, "Deletes this Graph and all its Edges. This can’t be undone."; Resource, "Deletes this Resource from the Space and removes it from every Map and Graph. This can’t be undone." (with the existing sentence about an owned Space kept after it); Edge or Edges, the same pattern. Undo is not built (ED-74), so "can’t be undone" is true; revisit when it is.
- [ ] The confirm button names what it deletes: Delete Map, Delete Graph, Delete Resource, Delete Edge (Delete Edges for several). Cancel is unchanged.

## Casing and wording

- [ ] Actions menu: "Present from here", "Open in new tab". "Read in Full View" is unchanged.
- [ ] "space" is capitalised where it means a Space in the Exit Space report sentences and the save-size refusal.
- [ ] Graph menu: "Colour" and "Arrowhead" (no ellipsis; "Arrowhead" so it no longer collides with the Ur plugin's Shape). The submenu's accessible name follows ("Graph arrowhead").
- [ ] Grip tooltip: "Drag to move the Dock, or click to pick a position". Map and Graph name tooltips: "Switch or edit Map", "Switch or edit Graph".
- [ ] Resources list: filters "Resources this app can’t show" and "Space Resources"; empty states "This Space has no Resources yet. Create one from the Dock.", "Every Resource is already on this Map.", "No Resources match your search or filters."

## Keeping the rest honest

- [ ] Every requirement in `docs/requirements/` that quotes a changed string is updated in the same change, and the UI snapshot marker is left alone (this is copy, not a decision).
- [ ] Unit, Ladle and e2e tests that address controls by a changed name are updated, `test/e2e/` restart proofs included (they run only in CI's database jobs).
- [ ] The British spelling already in use (Colour, Centre) is kept.
- [ ] `CI passed` is green on the PR, including `e2e:ladle`, `postgres` and `sqlite`.

## Out of scope

- Moving concatenated strings to whole-sentence templates for translation.
- The keyboard shortcut sheet beyond its `C` row.
