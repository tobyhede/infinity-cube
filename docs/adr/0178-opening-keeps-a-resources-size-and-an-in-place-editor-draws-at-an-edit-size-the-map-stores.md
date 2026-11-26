# Opening keeps a Resource's size, and an in-place editor draws at an Edit size the Map stores

Status: accepted
Date: 2026-11-26
Refines: 0064, 0084, 0122, 0142, 0158

Today an author uses one control to show a Resource's content and another to edit it, and both can change the Map. On an entry that stores no size, Opening a Markdown or Mermaid Resource sends a size hint, which grows the Resource and displaces its neighbours (ADR 0142, ADR 0158). Edit on a Closed Markdown or Mermaid Resource commits Open first and leaves the Resource Open after the edit (ADR 0064). Neither gives the author room to write without changing what the Map shows. The interaction below was chosen in a Ladle prototype and settled in `.scratch/plugin-open-and-edit/spec.md`.

**Opening never changes a size.** Markdown and Mermaid stop sending a size hint when they Open, so Opening and Closing change only what is drawn inside the rect, as ADR 0122 first said, and move no Resource. With nothing to measure, an Open commits at once and its content loads after it is drawn. Open and Closed keep those names and their stored `{ open }` Map content; the rail control gets its own glyph, so it no longer reads as Resize.

**Editing in place draws the Resource at its Edit size.** The **Edit size** is a size the canvas owns, stored on the Map entry beside `x`, `y` and `size` as an optional `editSize`, so it is per Map, survives reload and Export, and is checked once by each intake with the same floor as `size`, on an entry of any kind. A plugin opts in when it takes its Claim. While that Claim is held the canvas draws the Resource at its Edit size from the entry's top-left, and a resize then writes `editSize`, by the Resize control's rules (Closed Size floor, Shift keeps proportions, ADR 0173), as its own Edit; `size` is untouched. When the Claim is released the Resource is drawn at `size` again. A Claim that does not opt in, such as a Space Resource's, draws nothing differently. The Edit size applies wherever the Map is drawn and the Resource is edited (ADR 0112); the Stage ignores it.

**With no Edit size stored, the size hint is the default.** When a plugin opts in on an entry with no `editSize`, it may send a size hint, measured as Opening measured it before. The canvas draws the editor at the larger of the hint and `size` on each axis. Nothing is stored until the author resizes the editor, so beginning an edit makes no Edit, and each later edit measures again until an Edit size is stored. The size hint keeps its place in the Resource API; its caller moves from Open to the beginning of an edit.

**The canvas keeps the editor in view without storing anything.** It caps the drawn editor at the visible canvas at the current zoom, less a margin, as it capped a hint, and never changes the stored `editSize` to fit. If the capped editor reaches past the visible canvas, the camera pans the least distance that shows it.

**Neighbours make room only while the editor is drawn.** The canvas applies the displacement rule a Resize uses (ADR 0084) to the editor's rect and draws the Resources it passes at their displaced positions, with their Edges, but stores none of those positions. When the edit ends they are drawn where the Map stores them. This is the one displacement that is not written by the Edit that causes it, because beginning an edit is not an Edit.

**Edit no longer composes Open.** A plugin that edits in place begins editing a Closed Resource without committing Open, reading its content for that edit only, and the Resource is drawn Closed again when the edit ends, by any exit. If the content cannot be read, no edit begins and nothing is committed. The Open and Close control stays in place and unavailable while editing. A Closed Resource still reads and mounts nothing.

**Editing is not stored.** An edit is a Claim and its draft stays local (ADR 0042). A reload ends it, and the Resource comes back Open or Closed as the Map stores it; only the Edit size carries over to the next edit.

## Rejected

- **The Edit size as plugin Map content.** It would be written twice, in Markdown's and Mermaid's schemas and again in the Rust intake's mirror of each, and the plugin would need a way to make the canvas draw a rect, though ADR 0142 gives every rect to the canvas.
- **Letting the editor cover its neighbours.** The prototype did this; it hides the content around the Resource while the author writes, and the Map already has a rule for making room.
- **Storing the displacement when an edit begins.** It is the rule a Resize follows, but every edit would then leave the Map rearranged, which is what this decision exists to stop.
- **Title and Full as the names of the two states.** Title is a Resource's authored name and Full View names a presenting mode; both would be overloaded.
- **Retiring the size hint.** It has a caller again, as the default Edit size.
- **Keeping an edit open across a reload.** It needs stored drafts, which ADR 0042 rules out.
