# Open and Closed that keep their size, and in-place editing at a remembered edit size

Status: needs-triage

Answers [issue 01](issues/01-rethink-plugin-open-and-edit.md). The interaction was chosen in the Ladle prototype, **Review → Markdown prototype → Temporary Edit Size**. Before implementation, the maintainer agrees the open questions below, and the rules are recorded in a refining ADR from which implementation tickets are cut.

## Problem Statement

An author uses one control to show a Resource's content and another to edit it, and both can change the Map. On an entry that stores no size, Opening a Markdown or Mermaid Resource grows it and displaces its neighbours (MG-88). Edit on a Closed Resource Opens it and leaves it Open after the edit ends (UI-54, UI-56). Authors need to control what the Map shows, and to have room to edit, without having to repair the Map's placements afterwards.

## Solution

A Resource whose plugin keeps Open and Closed keeps offering them on its Resource rail, through one control whose glyph says it changes what is shown, not the size. Opening or Closing never changes the Resource's size on that Map and never moves another Resource.

The rail's Edit command starts a Markdown or Mermaid Resource's source editor in the Resource, drawn at that Resource's remembered **edit size** on that Map. Resizing during the edit changes the edit size and remembers it. Ending the edit, by any of the four exits, draws the Resource at its canvas size again, Open or Closed as it was before the edit began. Mermaid follows the same model through the same host source editor.

## User Stories

1. As an author, I want to show only a Resource's Title, so that I can keep the Map easy to scan.
2. As an author, I want to show a Resource's content, so that I can read or inspect it on the Map.
3. As an author, I want a labelled Open and Close control on the rail with its own glyph, so that I can tell it apart from Resize.
4. As an author, I want Open and Closed to share one canvas size, so that switching between them keeps the Resource's placement and its neighbours'.
5. As an author, I want to resize a Resource whether it is Open or Closed, so that a wide Title or a small content preview is possible.
6. As an author, I want each Map to remember its own Open or Closed state and size for a Resource, so that the same Resource suits different Maps.
7. As an author, I want to start editing directly whether the Resource is Open or Closed, so that I can change content in one step.
8. As an author, I want Edit to draw the editor at the last edit size, so that I have the room I chose for writing.
9. As an author, I want Resize during an edit to remember the new edit size, so that I get it on my next edit.
10. As an author, I want to Save and return to my previous Open or Closed state and canvas size, so that updating content keeps every placement on the Map.
11. As an author, I want to Cancel and have the Resource drawn as it was, so that I can discard a draft and go back to placing Resources.
12. As an author, I want the edit size to survive switching Maps and reopening the Space, so that each Map keeps its own editing setup.
13. As an author, I want the same temporary sizing for Mermaid, so that I can work on diagrams without changing any placement.
14. As an author, I want controls to reflect what the Resource's plugin offers, so that an Ur or Image Resource offers no Open or Close.
15. As a presenter, I want the Stage to draw every Resource the same way, so that Open state and edit sizes on the Map leave my presentation as it was (NV-62).

## Implementation Decisions

- **Open and Closed stay as stored.** Markdown and Mermaid keep `{ open }` in their Map content, so no tracked file rolls forward for the display choice. Opening and Closing remain Change Map content Edits (MG-27). The rail control keeps the Open and Close labels and gets a new glyph, chosen during implementation (see open question 1 for the names).
- **Opening never resizes.** Markdown and Mermaid stop sending a size hint when they Open, so an Open preserves the entry's size and displaces nothing. Open content keeps being clipped at the rect (RD-5, ADR 0149). This replaces the Markdown and Mermaid half of MG-27 and MG-88's motivating case, and leaves no plugin that sends a size hint (open question 2).
- **The plugin decides how its edit works and holds its Claim.** Markdown and Mermaid reuse the host's source editor and their Save and Cancel commands, keep the four exits (UI-56), the keyboard hints (UI-57) and the caret behaviour (UI-58, UI-59), and return focus as today. Save commits the Resource content; Cancel and Escape discard the draft.
- **Edit no longer composes Open.** Edit on a Closed Resource begins editing without committing Open: the plugin reads its text and draws the editor, and when the edit ends the Resource is drawn Closed again. This replaces UI-54's "Opens it, then begins editing" and UI-56's "every exit leaves the Resource Open". If the text cannot be read, no edit begins and nothing is committed.
- **The Open and Close control is unavailable while editing**, in its place on the rail, as Close is today (UI-55): the editor is drawn whatever the stored state, so the control would change nothing visible.
- **The edit size is Map content.** Markdown and Mermaid add an optional `editSize` (`{ width, height }`) to their Map content schemas, in both the TypeScript plugin and its Rust intake mirror (`crates/intake/src/plugins/`), with its key order and corpus cases. Intake refuses an `editSize` below the Closed Size on either axis, as it does a size (MG-22). An entry with no `editSize` draws the editor at its canvas size.
- **Resizing during an edit writes the edit size, not the size.** It is a Change Map content Edit of `editSize`, one revision per completed resize gesture, independent of the draft: Save and Cancel both keep it, and Undo reverses it like any other Edit. The entry's `size` keeps governing the canvas outside an edit, and normal Resize keeps its displacement rules (MG-23–MG-26).
- **The editor's rect displaces nothing.** Beginning or ending an edit, and resizing the editor, move no other Resource; the editor may draw over its neighbours. This is consistent with MG-26, since no stored size changes.
- **Reference and Space keep their behaviour.** Their Open, Close and (for Space) Edit are unchanged, and changes to them are separate decisions.
- **Record the rules in a refining ADR** that names what it refines: ADR 0064 (Edit from Closed), ADR 0142 and ADR 0158 (the Open size hint), and ADR 0122 (restoring that Open never changes a size). The owning requirements (maps-and-graphs.md, rendering.md, ui.md) are refreshed from it through the snapshot (ADR 0175), not edited by the ADR's change.

## Open questions for the ADR

1. **Names.** The first draft called the two states **Title** and **Full**. Both collide with the glossary: **Title** is a Resource's authored name (CONTEXT.md) and **Full View** is UI-105 and UI-106. Recommendation: keep **Open** and **Closed**, which are the stored value and what the prototype labels, and change only the glyph.
2. **The size-hint seam.** With Open no longer sending one, no plugin uses `MapCommit`'s `sizeHint` (MG-88). Recommendation: leave the seam in the Resource API for now and record in the ADR that it has no caller, rather than retire it in this change.
3. **How the canvas learns the edit rect.** The canvas owns every rect (ADR 0142), and the Resource API gives a plugin no way to have the canvas draw its Resource at another size or to route the resize handle to a Map content commit. The prototype faked both in its story harness. The ADR has to add one capability, for example a size the plugin's Claim carries while it is held, which the canvas draws and whose resize it hands back to the plugin. This is the one Resource API change the design needs, and it decides how Edges attach to the editor's rect while it is drawn (recommendation: to the drawn rect) and whether the editor draws above its neighbours (recommendation: yes, while the Claim is held).
4. **Capping the editor.** A remembered edit size can exceed the visible canvas at the current zoom. Recommendation: cap the drawn editor at the visible canvas, less a margin, as MG-88 caps a hint, without changing the stored `editSize`.

## Testing Decisions

- Drive the Resource rail, the source editor and the resize handle through the existing application Playwright fixtures. Assert what the author sees and what the Map keeps after switching Maps or reloading. Use the existing Markdown source helpers and the Mermaid Resource tests as prior art.
- Cover Open to Closed and back at the Closed Size and at an authored size, checking the rect and a neighbouring Resource's position. Cover beginning an edit Open and Closed, resizing during an edit, Save and Cancel, and beginning again at the remembered edit size. Use the same Resource on two Maps to show they keep separate settings.
- Show that an entry with no `editSize` draws the editor at its canvas size and stays editable. Add intake corpus cases for `editSize` (accepted, below the Closed Size, and the wrong shape) so both intakes are held to it.
- Use the existing Resource Ladle stories as prior art for rail accessibility and resize behaviour, and keep the prototype story as the reference for the interaction until the implementation replaces it.

## Out of Scope

- Focus surfaces and a separate editor window.
- A shared rule for fixed-size editors, or plugin control over whether the canvas lets a Resource be resized.
- Editing changes for Image, Ur, Reference and Space. Any Open support for Image needs its own decision.
- **Use editor size on Map**, a proposed one-time copy of the edit size to the entry's size. If pursued, it runs as a normal Resize from the Resource's Actions menu, with its displacement; Undo reverses it and Cancel still discards the draft. Whether a plugin offers it depends on its having a resizable in-place editor.

## Further Notes

The interaction approved in Ladle was a temporary resize in place. Drawing the editor at the canvas size when no edit size is stored, and keeping the edit size independent of the draft, are defaults chosen for this spec.

The Stage keeps following NV-62. [Design ticket](issues/01-rethink-plugin-open-and-edit.md).
