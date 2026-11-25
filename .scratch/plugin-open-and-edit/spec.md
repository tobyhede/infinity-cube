# Title and Full display with temporary in-place editing

Status: ready-for-agent

## Problem Statement

Authors use one gesture to show a Resource's content and another to edit it. Showing Markdown can grow its placement today. Editing from Closed can leave it Open. Authors need to control what the Map shows and have room to edit without having to repair the Map layout afterward.

## Solution

A Resource that supports both views offers **Title** and **Full** through a visibility control on its Resource rail. The choice belongs to that Resource on that Map and preserves its canvas size.

Markdown Edit starts in the Resource and temporarily uses its remembered edit size on that Map. Resizing during Edit remembers the new edit size. Ending Edit restores the canvas size and the previous Title or Full display. Mermaid follows the same model with its own plugin editor.

## User Stories

1. As an author, I want to show only the Title, so that I can keep the Map easy to scan.
2. As an author, I want to show content in Full, so that I can read or inspect it on the Map.
3. As an author, I want a labelled visibility icon on the rail, so that I can distinguish it from Resize.
4. As an author, I want Title and Full to share one canvas size, so that switching display preserves the placement and its neighbours.
5. As an author, I want to resize in either display, so that a wide Title or small content preview is possible.
6. As an author, I want each Map to remember its own display and size for a Resource, so that the same Resource suits different Maps.
7. As an author, I want to start editing directly from Title or Full, so that I can change content in one step.
8. As an author, I want Edit to open at the last edit size, so that I have the room I chose for writing.
9. As an author, I want Resize during Edit to remember my new edit size, so that I can use it on my next Edit.
10. As an author, I want to Save and return to my previous display and canvas size, so that updating content preserves the Map arrangement.
11. As an author, I want to Cancel and restore the card, so that I can discard a draft and resume arranging the Map.
12. As an author, I want the edit size to survive switching Maps and reopening the Space, so that each Map keeps its own editing setup.
13. As an author, I want the same temporary sizing for Mermaid, so that I can work on diagrams without changing the layout.
14. As an author, I want controls to reflect the Resource's capabilities, so that Ur offers no Title/Full switch.
15. As a presenter, I want the Stage to draw the Resource independently, so that Map display and edit settings leave my presentation intact.

## Implementation Decisions

- Title and Full are user-facing names for the two display choices. Keep the choice in plugin Map content and retain existing stored Open and Closed values where compatible. Use the existing Resource rail and a new visibility icon. Choose the glyph during implementation.
- A Title/Full change preserves the authored placement rectangle and causes no displacement. Keep normal clipping in Full. Remove the automatic size hint from the display switch. The general plugin size-hint contract is outside this change.
- The plugin decides how its Edit works and holds the existing Claim for the interaction. Reuse the built-in source editor and Save and Cancel commands. Preserve the existing keyboard exits and focus return. Save commits the Resource content. Cancel discards the draft.
- Store the remembered edit size in plugin Map content. Give plugins a common way to declare and update settings through the existing Map content seam. The Map entry's placement size continues to govern the canvas outside Edit. Markdown and Mermaid use the same size rules.
- As an implementation default, use the current canvas size when no edit size has been recorded. Resize during a Claim persists the edit size separately from the draft. Save and Cancel both retain that setting.
- The temporary editor rectangle may cover nearby content. Entering or ending Edit and resizing the editor preserve neighbouring placements. Normal canvas Resize continues to apply its existing displacement rules.
- An Edit begun in Title may draw the editor and load the content it needs. Preserve the stored display choice throughout the session, including if starting Edit fails.
- Keep existing display support for Reference and Space. Leave editing changes for those plugins to separate decisions. Record the new rules in a refining ADR and update the owning requirements and snapshot markers with the implementation.

## Testing Decisions

- Drive the Resource rail, source editor, and resize handle through the existing application Playwright fixtures. Assert what the author sees and what the Map retains after switching Maps or reloading. Use the existing Markdown source helpers and Mermaid Resource tests as prior art.
- Cover Title to Full and back at the default and an authored size. Check the rectangle and the placement of a neighbouring Resource. Cover opening Edit from both modes, resizing during Edit, saving and cancelling, and reopening at the remembered edit size. Use the same Resource on two Maps to verify separate settings.
- Verify that an older entry without an edit size uses the fallback and stays editable. Exercise persistence through the application's existing Map content and Resize flow. Add lower-level tests only where an intake or write rule needs coverage the application test cannot provide.
- Use the existing Resource Ladle stories as prior art for rail accessibility and resize behaviour. Keep the temporary resize prototype as a reference for the interaction.

## Out of Scope

- Focus surfaces and a separate editor window.
- A shared rule for fixed-size editors or plugin control over canvas resizability.
- Editing changes for Image, Ur, Reference, and Space. Any new Title/Full support for Image requires its own decision.
- **Use editor size on Map**, a proposed one-time copy from the active editor to the canvas placement. If pursued, it should run as a normal Map Resize from the Resource's Actions menu. Undo would reverse the placement change. Cancel would discard the draft. Eligibility depends on whether the plugin has a resizable in-place editor.

## Further Notes

The approved Ladle interaction was temporary resize in place. The first-edit fallback and persistence independent of the draft are defaults chosen for this spec.

The implementation should reconcile ADR 0064's Edit-from-Closed behaviour and ADR 0142's size hint on Opening. Retain ADR 0122's independent Map size and ADR 0149's clipping rules. The Stage continues to follow Navigation NV-62. [Design ticket in PR #497](https://github.com/tobyhede/infinity-cube/pull/497) · [Prototype branch and draft PR #501](https://github.com/tobyhede/infinity-cube/pull/501)
