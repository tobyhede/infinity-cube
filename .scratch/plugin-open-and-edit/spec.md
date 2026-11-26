# Open and Closed that keep their size, and in-place editing at a remembered edit size

Status: ready-for-agent

Answers [issue 01](issues/01-rethink-plugin-open-and-edit.md). The interaction was chosen in the Ladle prototype, **Review → Markdown prototype → Temporary Edit Size (`packages/app/stories/review/temporary-edit-size.stories.tsx`)**. The maintainer settled its open questions on 2026-11-26, and the rules are recorded in [ADR 0178](../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md). The implementation tickets are [issues 02–07](issues/).

## Problem Statement

An author uses one control to show a Resource's content and another to edit it, and both can change the Map. On an entry that stores no size, Opening a Markdown or Mermaid Resource grows it and displaces its neighbours (MG-88). Edit on a Closed Resource Opens it and leaves it Open after the edit ends (UI-54, UI-56). Authors need to control what the Map shows, and to have room to edit, without having to repair the Map's placements afterwards.

## Solution

A Resource whose plugin keeps Open and Closed keeps offering them on its Resource rail, through one control whose glyph says it changes what is shown, not the size. Opening or Closing never changes the Resource's size on that Map and never moves another Resource.

The rail's Edit command starts a Markdown or Mermaid Resource's source editor in the Resource, drawn at that Resource's **Edit size** on that Map, or, when none is stored, at the room its content asks for. Its neighbours move aside while it is drawn and return when it ends. Resizing during the edit changes the Edit size and remembers it. Ending the edit, by any of the four exits, draws the Resource at its canvas size again, Open or Closed as it was before the edit began. Mermaid follows the same model through the same host source editor.

## Behaviour today, by plugin

Checked against `main` (`ee471b6`) and the requirements named.

| Plugin | Open and Close | Edit | Resize |
| --- | --- | --- | --- |
| Markdown | Map content `{ open }`; Opens with a size hint, applied only on an entry storing no size (MG-27, MG-88); Closed reads no text | Offered Open or Closed; from Closed it Opens first; Close is unavailable while editing; four exits, each leaving it Open (UI-53–UI-56) | Any size at or above the Closed Size, Open or Closed (MG-23) |
| Mermaid | As Markdown, but Opens with no hint when Mermaid has not drawn in time (MG-27) | As Markdown, through the same host source editor (UI-53) | As Markdown |
| Reference | Map content `{ open }`, Opens with no size hint; Open draws its Target read-only (MG-27, UI-19) | None (UI-19, UI-28) | As Markdown |
| Space | Map content `{ open }`, Opens with no size hint; Closed holds no Space and mounts no Embed (MG-27) | Offered only while Open; takes a Claim to author the drawn Map, Done releases it, and Close stays available and releases it first (UI-61) | As Markdown |
| Image, Ur | None (MG-28) | None (UI-28) | As Markdown |

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

ADR 0178 is the binding statement; these are the decisions as the tickets use them.

- **Open and Closed stay as stored.** Markdown and Mermaid keep `{ open }` in their Map content, so no tracked file rolls forward for the display choice. Opening and Closing remain Change Map content Edits (MG-27). The rail control keeps the Open and Close labels and gets its own glyph, chosen during implementation; Title and Full were rejected as names because both collide with the glossary.
- **Opening never resizes and commits at once.** Markdown and Mermaid stop sending a size hint when they Open, so an Open preserves the entry's size and displaces nothing, and with nothing to measure the Open commits without first reading its content. Open content keeps being clipped at the rect (RD-5, ADR 0149). The Open is still its own Edit and revision, so tests that wait for its revision (PR 490) keep working.
- **The Edit size belongs to the canvas and is stored on the Map entry.** The entry gains an optional `editSize` (`{ width, height }`) beside `x`, `y` and `size`, accepted on an entry of any kind and refused below the Closed Size on either axis, as `size` is (MG-22), by both intakes. Export writes it.
- **A plugin opts in on its Claim.** While a Claim that opted in is held, the canvas draws the Resource at its Edit size from the entry's top-left. A Claim that does not opt in, such as a Space Resource's, draws nothing differently. The Edit size applies wherever the Map is drawn and the Resource is edited (ADR 0112); the Stage ignores it (NV-62).
- **With no Edit size stored, the size hint is the default.** The plugin may send a size hint with its opt-in, measured as Opening measures today; the canvas draws the editor at the larger of the hint and `size` on each axis. Beginning an edit stores nothing, and each edit measures again until an Edit size is stored. The size hint stays in the Resource API with this as its caller.
- **The canvas keeps the editor in view.** It caps the drawn editor at the visible canvas at the current zoom, less a margin, as it caps a hint today, without changing the stored `editSize`. If the capped editor reaches past the visible canvas, the camera pans the least distance that shows it; a pan is not an Edit.
- **Neighbours are displaced only while the editor is drawn.** The canvas applies the Resize displacement rule (MG-24) to the editor's rect and draws the Resources it passes at their displaced positions, Edges following, without storing them. Edges attach to the drawn rects. When the edit ends, everything is drawn where the Map stores it.
- **Resizing during an edit writes the Edit size, not the size.** It uses the Resize control's rules (Closed Size floor, Shift keeps proportions, ADR 0173), and each completed gesture is one Edit that writes `editSize`, independent of the draft: Save and Cancel both keep it. `size` keeps governing the canvas outside an edit, and normal Resize keeps its displacement rules (MG-23–MG-26).
- **The plugin decides how its edit works and holds its Claim.** Markdown and Mermaid reuse the host's source editor and their Save and Cancel commands, keep the four exits (UI-56), the keyboard hints (UI-57) and the caret behaviour (UI-58, UI-59), and return focus as today. Save commits the Resource content; Cancel and Escape discard the draft.
- **Edit no longer composes Open.** Edit on a Closed Resource begins editing without committing Open: the plugin reads its text for that edit only and draws the editor, and when the edit ends the Resource is drawn Closed again. This replaces UI-54's "Opens it, then begins editing" and UI-56's "every exit leaves the Resource Open". If the text cannot be read, no edit begins and nothing is committed.
- **The Open and Close control is unavailable while editing**, in its place on the rail, as Close is today (UI-55).
- **Closed still avoids work.** A Closed Resource reads nothing and mounts nothing, as today.
- **Editing is not stored.** A reload ends an edit and its local draft (ADR 0042); the Resource comes back Open or Closed as stored, and only the Edit size carries over.
- **The rail's Edit stays each plugin's own Content action.** The Edit size belongs to plugins that edit in place (Markdown and Mermaid). Space keeps its Edit, a Claim for authoring its drawn Map while Open, without opting in; Reference keeps having none.
- **The requirements follow by refresh.** ADR 0178 edits no requirements document; the next snapshot refresh (ADR 0175) folds it into maps-and-graphs.md, rendering.md and ui.md. CONTEXT.md gains **Edit size** with the ADR.

## Testing Decisions

- Drive the Resource rail, the source editor and the resize handle through the existing application Playwright fixtures. Assert what the author sees and what the Map keeps after switching Maps or reloading. Use the existing Markdown source helpers and the Mermaid Resource tests as prior art.
- Cover Open to Closed and back at the Closed Size and at an authored size, checking the rect and a neighbouring Resource's position. Cover beginning an edit Open and Closed, resizing during an edit, Save and Cancel, and beginning again at the remembered edit size. Use the same Resource on two Maps to show they keep separate settings.
- Show that an entry with no `editSize` draws the editor at the larger of the size hint and its canvas size, and stores nothing until resized. Show neighbours drawn aside during the edit and back after it, with nothing stored. Add intake corpus cases for `editSize` (accepted on several kinds, below the Closed Size, and the wrong shape) so both intakes are held to it.
- Use the existing Resource Ladle stories as prior art for rail accessibility and resize behaviour, and keep the prototype story as the reference for the interaction until the implementation replaces it.

## Out of Scope

- Focus surfaces and a separate editor window.
- A shared rule for fixed-size editors, or plugin control over whether the canvas lets a Resource be resized.
- Editing changes for Image, Ur, Reference and Space. Any Open support for Image needs its own decision.
- **Use editor size on Map**, a proposed one-time copy of the edit size to the entry's size. If pursued, it runs as a normal Resize from the Resource's Actions menu, with its displacement; Undo reverses it and Cancel still discards the draft. Whether a plugin offers it depends on its having a resizable in-place editor.

## Further Notes

The interaction approved in Ladle was a temporary resize in place. The prototype story does not model ADR 0178: it lets the editor cover its neighbours, it does not measure a default, and the real Markdown plugin still commits Open before an Edit from Closed, which the harness undoes with a second commit. Its doc comment says so; ticket 07 retires it.

The Stage keeps following NV-62. [Design ticket](issues/01-rethink-plugin-open-and-edit.md).
