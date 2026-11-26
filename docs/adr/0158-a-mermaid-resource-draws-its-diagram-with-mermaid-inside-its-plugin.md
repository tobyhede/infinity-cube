# A Mermaid Resource draws its diagram with Mermaid inside its plugin

Status: accepted
Date: 2026-11-17
Refines: 0142
Refined by: 0178
Related: 0063, 0064, 0067, 0101, 0118

A **Mermaid Resource** is a bundled kind, `mermaid`, whose content is Mermaid source that its plugin draws as a diagram. It is the Markdown Resource in every way but what it draws: its content is `{ url }` naming its source, an asset (ADR 0142); its Map content is `{ open }`, Closed where a Map stores nothing and Open where there is no Map; it is created empty from the Command Dock; Opening carries a size hint measured at the reading width, or none where Mermaid has not drawn the diagram within the load wait that bounds Opening, so a slow or stalled fetch of Mermaid never holds Open back; and Edit is the same mode, under a Claim, in the host's source editor, with Save storing the source with `\n` line endings as a new asset and committing its URL. It may be a Target.

**The Mermaid plugin draws with the Mermaid library itself.** The Resource API offers no diagram renderer, and none is added: the plugin depends on `mermaid` as a view-half dependency of its own, which ADR 0142's import rule allows ("React and its own third-party dependencies are its business"), and fetches it the first time it draws a diagram, so the application does not carry it until a Mermaid Resource is Open.

**The SVG Mermaid answers is inserted into the plugin's rect.** Mermaid answers markup, not React elements, so this is the one place a plugin inserts markup it did not build. It rests on two things Mermaid does: it passes the SVG it answers through its DOMPurify sanitiser, and at its `strict` security level, its default, which the plugin sets explicitly, it encodes the HTML tags a source writes in its text and turns off the click handlers a source names. Its labels may still be HTML that Mermaid built, inside `<foreignObject>`. Mermaid is also run with its error drawing suppressed, so a source it cannot draw leaves nothing in the document and is said as a note in Mermaid's own words. An empty source, or one of whitespace alone, is drawn as a note saying the diagram is empty rather than as a failure, naming Edit where Edit is offered. Mermaid lays a diagram out in an unseen element inside the plugin's rect, never in the document body.

**"Diagram" names what Mermaid draws, inside the plugin only.** ADR 0101 retired Diagram as a name for a Map, and that stands everywhere: Diagram is never a synonym for Map, in the plugin or out of it. Inside the Mermaid plugin's package the word names what the Mermaid library draws inside one Resource's rect, which is no Map, because that is the library's own word for it. The vocabulary guard exempts that package from its retired-Map arms only, and a test holds the exemption earned; the retired Resource name is still scanned there.

**A diagram is drawn in the canvas's colour scheme.** The plugin reads the computed `color-scheme` of its own rect, which the canvas's theme sets, and draws in Mermaid's `neutral` theme where that is light and its `dark` theme where it is dark, straight onto the rect with no card of its own; a change of theme draws the diagram again. A source that chooses a theme of its own, in its frontmatter or an init directive, keeps it in either scheme: an author may theme a diagram as they like, and the canvas's theme is the default for one that does not. The source is drawn as written: the plugin adds nothing to it, so a line Mermaid names in a message is the author's line. Mermaid's settings are the page's rather than a diagram's, so the plugin sets the canvas's theme in them before each draw, and Mermaid reads a source's own configuration over them. The plugin reads no attribute of the host's: it reads its rect's `color-scheme` again when the document root's attributes or the browser's preference change, which is how the canvas changes theme, so a surface that changes `color-scheme` on another element is not followed until one of those changes.

**Its source is stored as `text/vnd.mermaid`, and Export writes a new file of it as `assets/<hash>.mmd`.** The host's table between extensions and media types gains that one row, so the source keeps its media type through Export and Import rather than travelling as `application/octet-stream` in a `.bin` file. As for every asset, the media type stored first stands and Export keeps the name of a file already there, so the same bytes first stored under another type keep that type's name.

## Considered options

- **A diagram renderer in the Resource API, filled by the host as `RenderedMarkdown` is.** Rejected. The Markdown renderer is the host's because the same parser and sanitiser serve every surface and the source editor already lives there (ADR 0063, ADR 0067). A Mermaid renderer has one caller, so it would grow the public API, which every plugin is built against, for one plugin; ADR 0142 makes everything inside the rect the plugin's.
- **Mermaid fenced blocks inside a Markdown Resource.** Rejected for now. It changes the host's one Markdown renderer for every Markdown Resource, and a diagram that is its own Resource can be placed, connected and Opened on its own.
- **Mermaid loaded with the application.** Rejected. It is large, and most Spaces hold no diagram.
- **Mermaid's `loose` security level.** Rejected. It admits click handlers and HTML tags written in a source's text, so an Aggregate's source could run in the application's origin.

## Cost accepted

The Mermaid plugin duplicates the Markdown plugin's edit, Open and measuring code rather than sharing it, because a plugin imports no other plugin (ADR 0142); a fix to one is made to both. Mermaid's two themes are close to the canvas's but are not its tokens, so a diagram's colours are Mermaid's own in either scheme. The host's source editor highlights the source as Markdown, which is harmless but not Mermaid-aware. Mermaid needs a browser's layout, so the plugin's tests draw with a stand-in and only a browser draws a real diagram.

## Negative

- **Do not add a diagram renderer to the Resource API for one plugin.**
- **Do not lower Mermaid's security level below `strict`.**
