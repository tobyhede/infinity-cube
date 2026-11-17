# A Mermaid Resource draws its diagram with Mermaid inside its plugin

Status: accepted
Date: 2026-11-17
Refines: 0142
Related: 0063, 0064, 0067, 0118

A **Mermaid Resource** is a bundled kind, `mermaid`, whose content is Mermaid source that its plugin draws as a diagram. It is the Markdown Resource in every way but what it draws: its content is `{ url }` naming its source, an asset (ADR 0142); its Map content is `{ open }`, Closed where a Map stores nothing and Open where there is no Map; it is created empty from the Command Dock; Opening carries a size hint measured at the reading width; and Edit is the same mode, under a Claim, in the host's source editor, with Save storing the source with `\n` line endings as a new asset and committing its URL. It may be a Target.

**The Mermaid plugin draws with the Mermaid library itself.** The Resource API offers no diagram renderer, and none is added: the plugin depends on `mermaid` as a view-half dependency of its own, which ADR 0142's import rule allows ("React and its own third-party dependencies are its business"), and fetches it the first time it draws a diagram, so the application does not carry it until a Mermaid Resource is Open.

**The SVG Mermaid answers is inserted into the plugin's rect.** Mermaid answers markup, not React elements, so this is the one place a plugin inserts markup it did not build. It is safe because Mermaid is run at its `strict` security level, which sanitises the SVG and runs nothing the source names (no click handlers, no HTML labels), and with its error drawing suppressed, so a source it cannot draw leaves nothing in the document and is said as a note in Mermaid's own words. An empty source is drawn as a note asking for one rather than as a failure.

**Its source is stored as `text/vnd.mermaid`, and written to an Aggregate directory as `assets/<hash>.mmd`.** The host's table between extensions and media types gains that one row, so the source keeps its media type through Export and Import rather than travelling as `application/octet-stream` in a `.bin` file.

## Considered options

- **A diagram renderer in the Resource API, filled by the host as `RenderedMarkdown` is.** Rejected. The Markdown renderer is the host's because the same parser and sanitiser serve every surface and the source editor already lives there (ADR 0063, ADR 0067). A Mermaid renderer has one caller, so it would grow the public API, which every plugin is built against, for one plugin; ADR 0142 makes everything inside the rect the plugin's.
- **Mermaid fenced blocks inside a Markdown Resource.** Rejected for now. It changes the host's one Markdown renderer for every Markdown Resource, and a diagram that is its own Resource can be placed, connected and Opened on its own.
- **Mermaid loaded with the application.** Rejected. It is large, and most Spaces hold no diagram.
- **Mermaid's default security level.** Rejected. It admits click handlers and HTML labels, so an Aggregate's source could run in the application's origin.

## Cost accepted

The Mermaid plugin duplicates the Markdown plugin's edit, Open and measuring code rather than sharing it, because a plugin imports no other plugin (ADR 0142); a fix to one is made to both. Mermaid draws in its own `neutral` theme on a light card of its own, so a diagram does not follow the canvas's dark theme. The host's source editor highlights the source as Markdown, which is harmless but not Mermaid-aware. Mermaid needs a browser's layout, so the plugin's tests draw with a stand-in and only a browser draws a real diagram.

## Negative

- **Do not add a diagram renderer to the Resource API for one plugin.**
- **Do not lower Mermaid's security level below `strict`.**
