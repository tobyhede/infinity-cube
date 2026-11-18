# 01: Tidy the Command Dock and canvas toolbar copy

**What to build:** an author reads one consistent voice across the Command Dock, the Resource rail and actions menu, the Edge toolbar, the Resources list and the delete confirmation. Every icon-only canvas command shows a tooltip on hover and on keyboard focus. Making something says Create, placing an existing Resource on a Map says Add, and menu rows say New. Menu rows are sentence case, with domain nouns (Space, Map, Graph, Resource, Edge, Title, Full View) capitalised, and Space is capitalised in the refusal and report sentences named below.

The source is the copy review of 2026-11-17 (Claude Doc "UX copy review: Command Dock and canvas toolbars"). The strings are restated here so this ticket stands alone. Where this ticket and the review differ, this ticket wins: the review proposed changes to wording that accepted ADRs decide, and those are listed under Out of scope.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Tooltips and names on the canvas toolbars

Today the Resource rail and Edge toolbar commands are icon-only and carry an accessible name and nothing else. The Dock's controls carry a native `title`, which shows on hover only, so that pattern is not the one to copy.

- [ ] Every Resource rail command and every Edge toolbar command shows a tooltip from `@project/ui`'s `Tooltip`, which opens on hover and on keyboard focus.
- [ ] Each tooltip's text is contained in that command's accessible name (the rule UI-37 states for Dock controls, applied here to icon-only commands). The tooltips, with the name each sits inside:

  | Command | Tooltip | Accessible name |
  | --- | --- | --- |
  | Rail: Open | Open | Open Resource \<name\> (unchanged) |
  | Rail: Close | Close | Close Resource \<name\> (unchanged) |
  | Rail: Edit (Markdown, Space) | Edit | Edit Resource \<name\> (unchanged) |
  | Rail: Save (Markdown) | Save | Save Resource \<name\> (unchanged) |
  | Rail: Cancel (Markdown) | Cancel editing | Cancel editing Resource \<name\> (unchanged) |
  | Rail: Done (Space) | Finish editing | Finish editing Resource \<name\> (today "Done Resource \<name\>") |
  | Rail: Replace (Image) | Replace image | Replace image of Resource \<name\> (unchanged) |
  | Rail: Rename (Image) | Rename | Rename Resource \<name\> (unchanged) |
  | Rail: actions trigger | Actions | Actions for Resource \<name\> (unchanged) |
  | Edge: title command | Rename | Rename Edge \<name\> (today "Edit Edge \<name\>"; it edits only the Edge's Title) |
  | Edge: Title toggle | Show Title, or Hide Title | Show Title \<name\>, or Hide Title \<name\> (unchanged) |
  | Edge: Delete | Delete Edge | Delete Edge \<name\> (unchanged) |

  A plugin rail command not in this table gets a tooltip built the same way: its accessible name without the Resource name.
- [ ] The Edge Title toggle stays an action button whose name says the action, and its icon now draws that action too: the open eye on "Show Title", the crossed eye on "Hide Title". Today it draws the opposite (the state), so icon and name disagree.
- [ ] `docs/requirements/ui.md` gains a requirement for these tooltips (open on hover and focus, text contained in the name), with its tests, in the same change.

## One verb per act

- [ ] The shortcut sheet's `C` row reads "Create a Markdown Resource" (naming the default kind, as the Dock's Create tooltip does), not "Add a Resource".
- [ ] "Add \<name\> to Map" in the Resources list, "New Map" and "New Graph" are unchanged.

## Delete confirmation

UI-83 says the question never says whether a deletion can be undone, so it stays true once Undo is built. These descriptions say nothing about undoing, and they drop today's "Permanently", which makes that same claim.

- [ ] The title quotes free-text names and lowercases "from":

  | Subject | Today | New |
  | --- | --- | --- |
  | Map | Delete Map fixture From Space? | Delete “Map fixture” from this Space? |
  | Graph | Delete Long From Map fixture? | Delete “Long” from “Map fixture”? |
  | Resource | Delete A From Space? | Delete “A” from this Space? |
  | One Edge | Delete Edge A → B? | unchanged (an Edge question names no "from", and its subject already says Edge) |
  | Several Edges | Delete 3 Edges? | unchanged |

- [ ] The descriptions read:

  | Subject | Today | New |
  | --- | --- | --- |
  | Map | Permanently deletes the Map, and all Graphs from the Space.↵Resources are not deleted. | Deletes this Map and all its Graphs. Its Resources stay in the Space. |
  | Graph | Permanently deletes the Graph and all Edges from the Map. | Deletes this Graph and all its Edges. |
  | Resource | Permanently deletes the Resource from the Space and all Maps and Graphs. | Deletes this Resource from the Space and removes it from every Map and Graph. (The existing sentence about an owned Space follows unchanged.) |
  | One Edge | Permanently deletes the Edge from the Graph. | Deletes this Edge from its Graph. |
  | Several Edges | Permanently deletes the Edges from the Graph. | Deletes these Edges from their Graph. |

- [ ] The confirm button names what it deletes: Delete Map, Delete Graph, Delete Resource, Delete Edge, or Delete Edges for several. Cancel is unchanged.

## Casing and wording

- [ ] Actions menu: "Present from Here" becomes "Present from here", and "Open in New Tab" becomes "Open in new tab". "Read in Full View" is unchanged.
- [ ] In the sentences an author reads in refusal notices and in the Exit Space report, "space" becomes "Space" and "space resource" becomes "Space Resource" wherever they mean a Space or a Space Resource. That covers every such sentence in the authoring refusal messages (snapshot and reference refusals, the stored-Space refusal, the conflict recovery descriptions, permission and size-limit refusals) and in the Exit Space report. No other word in those sentences changes.
- [ ] Grip tooltip: "Drag to another slot, or press for the list" becomes "Drag to move the Dock, or click to pick a position". Map and Graph name tooltips: "Switch Map" becomes "Switch or edit Map", and "Switch Graph" becomes "Switch or edit Graph".
- [ ] Resources list: the filter "Resources of a kind not in this build" becomes "Resources this app can’t show". "Space Resources in this Space" and "Spaces in this Meta Space" are unchanged.
- [ ] Resources list empty states: "This Space has no Resources." becomes "This Space has no Resources yet. Create one from the Dock."; "All Resources are in this Map." becomes "Every Resource is already on this Map."; "No matching Resources." becomes "No Resources match your search or filters."

## Keeping the rest honest

- [ ] No string an accepted ADR names changes (see Out of scope). If an implementer finds one this ticket missed, they leave it and note it on the ticket.
- [ ] Every requirement in `docs/requirements/` that quotes a changed string is updated in the same change. Only the new tooltip requirement is a behaviour change. No ADR changes, so no snapshot marker moves.
- [ ] Unit, Ladle and e2e tests that address controls by a changed name or assert a changed sentence are updated, including the `test/e2e/` restart proofs, which run only in CI's database jobs.
- [ ] The British spelling already in use (Colour, Centre) is kept.
- [ ] `CI passed` is green on the PR, including `ladle`, `postgres` and `sqlite`.

## Out of scope

These were in the copy review but are fixed by accepted ADRs or are not drawn. Changing any of them needs a refining ADR first.

- **The Graph menu's "Colour…" and "Shape…"**: ADR 0105 puts Shape… directly under Colour…. The review's "Arrowhead" is also on CONTEXT.md's _Avoid_ list for Head shape.
- **The "Persistence rejected" cue**: ADR 0154 names it.
- **The conflict dialog's buttons and alerts** ("Changes conflict", Reload, "Keep local and retry", "Unable to reload", "Unable to keep local"): ADR 0042 and ADR 0076 name Keep local as the command, and ui.md restates the dialog. Capitalising Space in its descriptions (above) is in scope.
- **The resting "Persisted", "Saving changes" and "Changes saved" cues**: the Dock draws no saving cue (it shows only failed, rejected and conflicted), so authors never see these. The hidden `persistence-status` text that tests read is not author copy.
- **Saying a deletion cannot be undone**: UI-83 forbids it.
- **Moving concatenated strings to whole-sentence templates** for translation.
- **The keyboard shortcut sheet** beyond its `C` row.
