# A plugin chooses the size it suggests for its editor

Status: proposed
Date: 2026-11-28
Related: 0173, 0178

[ADR 0178](0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md) uses the size of rendered content to make room for editing. A Mermaid diagram and its source can have very different dimensions. This proposal replaces the rule for choosing the default and clarifies how the canvas draws and resizes an editor.

**The plugin owns its suggestion.** A plugin can tell the canvas that it is showing an editor and supply a width and height for it. The plugin chooses how to obtain them. Holding a Claim alone has no effect on the Resource’s rect. A Space Resource can therefore use its Claim to author a Map and an Image Resource can use its Claim for Replace at their usual sizes.

**Markdown and Mermaid measure the source editor they show.** When a Map entry has no Edit size, each plugin lays out its real source editor hidden, reads its width and height, and shows that same editor. This happens once per edit. The source can be read before editing starts. Sizing needs no rendered Markdown, diagram, image load or timer. With a stored Edit size these plugins show the editor directly.

**The Map entry has two sizes.** Its Display size is `size`, with the Closed Size as its default. Its Edit size is `editSize`. The canvas draws an editor from the entry’s top-left at its stored Edit size, then falls back to the suggestion, then to the Display size. A suggestion can be smaller than the Display size on either axis. The visible canvas at the current zoom, less its margins, caps each drawn dimension. The drawing can be smaller than the Closed Size. When the edit begins or the cap changes, the camera pans the least distance that shows the editor.

**A completed resize while editing stores the Edit size on that Map.** The gesture starts from the drawn rect and uses the Resize control’s Closed Size floor and Shift rule. Its preview changes only the subject. On release the Map stores the chosen Edit size as one Edit. Opening the editor, fitting it to the viewport, typing and ending the edit make no size writes. Outside the editor the control writes the Display size.

The canvas uses the Resize displacement rule from the Display rect to the drawn editor rect, including a negative change on an axis that shrinks. Neighbours and Edges follow the settled rect while editing. A drag of a displaced neighbour adds the author’s drag delta to its stored position. Ending the edit removes the drawn displacement. These rules apply wherever the Map is drawn and edited.
