# InfinityCube

Graph-native technical content: Resources live in spatial Maps and connect into curated directed Graphs. This glossary names the domain. [Accepted ADRs](docs/adr/README.md) decide its behaviour, and [the requirements](docs/requirements/) restate them in current words as a snapshot.

## Spaces

**Space**:
An authored world of Resources, Maps and the Graphs each Map owns. Its name is independent of the Titles of Space Resources that refer to it.
_Avoid_: talk, presentation, manifest, deck, document, canvas, board, file, subgraph, workspace.

**Meta Space**:
The one permanent Space, at the root of Space Resource ownership in an Aggregate.
_Avoid_: root Space, home Space, default Space, Entry Space.

**Ordinary Space**:
Any Space other than the Meta Space.

**Aggregate**:
All Spaces together, rooted at the Meta Space through Space Resource references.
_Avoid_: talk, catalog, tree, bundle, collection; aggregate for a single Space; Aggregate in anything a person is shown, which says Space.

**Space window**:
A window the desktop application opens on an Aggregate directory, showing its Spaces.
_Avoid_: talk window, Aggregate window; Opening as the name of a folder's open, in code or a heading (Opening is a Resource's).

**Start window**:
The desktop application's window for creating a new Space, opening a folder, or reopening a recent Space, shown at launch when nothing else opens, and when a new Space is asked for. It is not a Space window.
_Avoid_: home window, launcher, welcome window.

**Recent**:
The desktop application's history of the Spaces opened by any route, which the Start window lists. It is distinct from the set to reopen, the Spaces open when the last quit began, which a launch naming no folder reopens.
_Avoid_: recent files, history, the set to reopen.

**Space snapshot**:
The complete, fully identified form of one Space.
_Avoid_: aggregate.

**Working Space**:
A Space opened for authoring, as the browser holds it.

**Working read**:
A read of one Space for authoring, which loads a Working Space.

**Working-space loader**:
What answers a Working read, running a Space's first working read when the Space needs one.

**Composed Space**:
A Space the browser holds live, because Open Spaces lists it or one of its Maps is drawn.

**Resource N**:
A neutral Title for a new Resource, numbered one past the highest already used.

**Space N**:
A neutral name for a new Space, numbered one past the highest already used.

**Id**:
The durable identifier of a Space, Resource, Map or Graph. Space and Resource Ids are global; Map and Graph Ids are scoped to their owning Space.
_Avoid_: guid, key, slug, local id, authored id.

**Revision**:
The version counter of a stored Space; its exported revision identifies the revision last captured by Exporting.
_Avoid_: generation, timestamp, replacement epoch.

**Door**:
Any place a Resource enters a Space: intake of a file or stored snapshot, an Edit, or Importing.

**Intake**:
The check every stored or imported Space, and every Aggregate, passes before it loads.

**Aggregate intake**:
The part of Intake that checks a set of Spaces together: the references between them, and that each is rooted at the Meta Space.

**Lifecycle door**:
One of a Repository's two operations on a whole Aggregate: initializing it, or replacing it.
_Avoid_: Door (where a Resource enters a Space).

## Resources

**Resource**:
An addressable piece of a Space with a Title and a Resource kind, and an endpoint for Graph Edges. The canvas owns its position, its size and the Edges connecting it; everything else is its Resource plugin's.
_Avoid_: Card, Thing, node, slide, page, tile, subgraph.

**Title**:
The authored name and qualifications of a Resource, expressed as one or more Title Lines. The first line is its name; subsequent lines qualify it.
_Avoid_: heading, label, caption, description, subtitle as separate fields.

**Short Title**:
The first Title Line, followed by “…” when more lines follow, used when a sentence quotes a Title, including questions, notices and Edge labels. Controls, list rows and chrome use the first line alone.

**Resource kind**:
What a Resource's content is and does, and the name that selects its Resource plugin. Six are bundled: Markdown, Mermaid, Image, Space, Reference and Ur. A content kind adds content of its own: Markdown, Mermaid or Image.
_Avoid_: MIME type, content type, file type, format; a bare "kind" where another sort of kind could be meant.

**Content kind**:
A Resource kind whose Resource content names bytes: Markdown, Mermaid or Image. Ur, Reference and Space are kinds but not content kinds.

**Missing kind**:
A well-formed Resource kind that no Resource plugin in this build draws. Its Resources are drawn by the Default plugin.

**Resource plugin**:
The module that makes a Resource kind what it is: its content and how it is kept, what it draws inside the rect it is given, and every way its content is authored. Plugins are compiled into the application and listed once.
_Avoid_: kind for the module, extension, add-on; plugin for code loaded at runtime.

**Plugin list**:
The build's list of Resource plugins, naming each once, in the order every choice among Resource kinds is offered in. The Default plugin is kept apart from it.

**Resource API**:
Everything the application offers a Resource plugin, and all a plugin may reach. Every plugin uses the same one.
_Avoid_: SDK, hooks as the name of the whole.

**Default plugin**:
The Resource plugin that draws a Resource whose Resource kind names no plugin in this build. What the missing plugin kept is carried unread.
_Avoid_: default kind, fallback kind, placeholder as the plugin's name.

**Resource content**:
What a Resource plugin keeps for a Resource, the same on every Map.

**Map content**:
What a Resource plugin keeps for one Resource on one Map, beside the position and size the canvas owns, such as an Ur Resource's Shape or a Markdown Resource's Open or Closed state.
_Avoid_: view state, placement.

**Plugin commit**:
An Edit a Resource plugin asks for on its own Resource: its Title, its Resource content or its Map content.

**Resource surface**:
What hosts a Resource plugin's drawing: a Map, the Stage, or another Resource embedding it. It offers capabilities that are each present or absent.
_Avoid_: read-only as a mode of a plugin, Resource canvas.

**Host**:
The application around a Resource plugin: it draws the Resource's rect, border, selection ring and toolbar.
_Avoid_: Host for a server that serves the application; Storage calls that an HTTP host, or names it (the Rust host, the desktop sidecar).

**Map embedding**:
A Map drawn inside a Resource's rect because its plugin embeds a Space, on a canvas or the Stage. On a canvas it can be authored in place under a Claim lent to it.
_Avoid_: portal, nested canvas, subspace.

**Claim**:
A Resource plugin's hold on the interaction while an author works in it. Claims nest through what a plugin embeds, and the deepest holds the keyboard and shows its commands. A Claim may run work exclusively.
_Avoid_: lock, focus, edit mode.

**Exclusive work**:
Work a Resource plugin runs under a Claim that withholds authoring and navigation everywhere until it settles, such as replacing an image.

**Asset**:
Bytes with a media type, named by their content, that a Resource reaches by a URL in its Resource content or Map content. Every file a Resource uses is one, a picture or Markdown text alike.
_Avoid_: sidecar, attachment; asset as a name for an Image Resource. "Sidecar" names only the production Node host, `src/desktop/` (Storage ST-113), never an Asset.

**Asset store**:
Where an Aggregate's Assets are kept.

**Content action**:
What a Resource plugin lets an author do to its Resource's content, such as editing Markdown, replacing an image or authoring the Map inside a Space Resource.
_Avoid_: capability (what a Resource surface offers a plugin), edit mode.

**Markdown Resource**:
A Resource whose content is Markdown written by the author.

**Mermaid Resource**:
A Resource whose content is Mermaid source written by the author, drawn as a diagram. Diagram here is Mermaid's word for what it draws, used inside the Mermaid plugin only; it is never a synonym for Map (ADR 0101, ADR 0158).

**Image Resource**:
A Resource whose content is a picture identified by its image URL. Its Title is also the picture's text alternative. It is always its picture, with no Closed state.
_Avoid_: picture, photo, media, asset, attachment, file, thumbnail as names for the Resource.

**Ur Resource**:
A Resource with a Title and no content, used to diagram a named thing that Edges can connect.
_Avoid_: node, vertex, atom, plain, bare, base, stub, placeholder, empty Resource, URN.

**Space Resource**:
A Resource referring to another Space and showing its selected Map and Graph. Space Resources referring to a Space jointly own its lifetime.
_Avoid_: subspace, portal, link, nested space.

**Target Space**:
The Space a Space Resource references.

**Space Resource Selection**:
The Map and Graph of its Target Space that a Space Resource shows.
_Avoid_: Selection alone, which means the canvas selection: the Selected Resources or Selected Edge an authoring gesture acts on.

**Space Resource Framing**:
The view of a target Map authored on a Space Resource: which part is visible and at what scale.

**Reference Resource**:
A Resource showing the content of another Resource, its immutable Target, read-only. It has its own Title; its Target is any Resource kind except Reference.
_Avoid_: alias, link, copy, transclusion, mirror; Reference as a family that includes Space Resource.

**Target**:
The Resource a Reference Resource shows.

## Maps and Graphs

**Map**:
An authored entity within a Space holding a placement and an ordered collection of Graphs over the Resources in that placement. Capitalised Map names the entity; lowercase map is a verb.
_Avoid_: Diagram, Layout, View, placement as a synonym.

**Canvas Map**:
The Map a Space's own canvas draws, and the Map an Edit made there changes.

**Drawn Map**:
A Map drawn inside an Open Space Resource. An Edit made through it changes that Map in its own Space, the Space Resource's target Space.

**Occurrence**:
One drawing of a Map, named by the chain of Open Space Resources that draws it, starting from the Canvas Map.

**Canvas**:
The surface that draws a Space's Canvas Map.

**Camera command**:
A command that moves the canvas's view: centring on a point, fitting a set of Resources or bounds in view, or zooming.

**Starting Map**:
A Map with no Resources that owns one empty Graph, which is its Active Graph: what a Space's first working read and Add Map create.

**Placement**:
The mapping of Resources to their positions, sizes and Map content within a Map. A Resource absent from this mapping is absent from that Map.
_Avoid_: arrangement, layer.

**Rect**:
A Resource’s drawn position and size on a Map.

**Closed Size**:
The default Display size of a Resource on a Map and the minimum for either size stored on a Map entry.

**Display size**:
The size at which a Map draws a Resource outside its editor.

**Edit size**:
The size an author chooses for a Resource’s editor on a particular Map.
_Avoid_: edit mode.

**Size hint**:
The size a plugin suggests for its editor when the Map entry has no Edit size.

**Shape**:
An Ur Resource's outline in a Map, kept as its Map content: rectangle, pill, ellipse or diamond.
_Avoid_: head shape, node shape, symbol, figure, border, frame; Shape as a Resource kind.

**Outline**:
The shape a Resource plugin declares its Resource has inside its rect; the rectangle unless the plugin says otherwise. An Ur Resource's Shape is its outline.

**Layout strategy**:
A way to arrange Resources: an automatic strategy computes placement, while a positioned strategy reads a Map's authored placement.
_Avoid_: arrangement, algorithm, engine.

**Auto-arrange**:
Applying an automatic layout strategy to a Map as an Edit.

**Resources View**:
The collection of a Space's Resources absent from the selected Map.
_Avoid_: Resource palette, Resource panel, drawer, popover, Dock as the collection's name.

**Graph**:
A curated directed structure of Edges between Resources in one Map. A fork has several outgoing Edges; a merge has several incoming Edges.
_Avoid_: route, path, track, tour, journey, sequence, rail, step.

**Head shape**:
The directional shape a Graph's Edges draw at their heads: arrow, vee, dot or diamond.
_Avoid_: marker, end marker, arrowhead.

**Edge**:
A directed connection in one Graph from a tail Resource to a head Resource, optionally bearing a one-line Title. Its identity is the pair of endpoints within that Graph.
_Avoid_: link, connection, transition, arrow, step, relationship; label for its Title.

**Anchor**:
One of a Resource's four Edge attachment points, at the midpoint of each side of its rect.

**Handle**:
An Anchor offered as a place to start or end drawing an Edge.

**Lane**:
The path one of several Edges joining the same two Resources takes beside the others.

**Active Graph**:
The Graph selected in a drawn Map, emphasised there and receiving new Edges.
_Avoid_: selected Graph, current Graph as separate concepts; focus, mode.

**Saved Active Graph**:
The Active Graph a Map stores, which it opens on.

**Recede**:
To be drawn at reduced strength while staying fully interactive.

## Authoring

**Authoring**:
Interacting with a Space in a way that may change its Resources, Maps or Graphs, including attempts that produce no change.

**Space Authoring**:
The one module that derives, validates and installs every Edit to a single Space.

**Space session**:
One Space's Working Space, the Revision last acknowledged, and its persistence status. A Replacement epoch, the Traversal history and Running are not one.
_Avoid_: session alone where a page's lifetime could be meant.

**Interaction draft**:
The transient value of an unfinished authoring interaction, such as changed text awaiting confirmation. It is separate from a completed Edit.
_Avoid_: Draft Space, pending Edit, unsaved Edit, working copy.

**Edit**:
A validated change to the authored Space, potentially changing several parts together as one operation.

**Canvas Edit**:
An Edit made through the Canvas Map.

**Drawn Edit**:
An Edit made through a Drawn Map, changing that Map in its own Space.

**Coordinated Edit**:
One atomic Edit over several Spaces' Sessions, made by the Space Resource lifecycle.

**Participant**:
A Space a Coordinated Edit changes.

**Coordination turn**:
One Coordinated Edit's run from its start to the repository's answer. Only one runs at a time, behind the Barrier.

**Barrier**:
What pauses every Session's commits while a Coordination turn runs.

**Recovery replay**:
Retry or Keep local on a failed Coordinated Edit, which sends it again as a new Coordination turn. Accept stored is not a replay: it installs the stored Spaces in every Participant at once and sends nothing.

**Completion outcome**:
The result of an authoring attempt: completed (an Edit), unchanged (no change) or refused (an anticipated refusal with no Edit). Queued means waiting rather than completed; any refusal arrives when the queue drains.
_Avoid_: error, failure, exception, validation error for these outcomes.

**Completion**:
The completed fact a Surface reports to Space Authoring, such as a Resource settling at a point. It carries identities and settled values, never a Space or a plan.
_Avoid_: Completion outcome (the result of an authoring attempt).

**Surface**:
The control conducting an interaction, such as a Title field, an Open Markdown body, a menu or a list. It decides commit and Escape.
_Avoid_: Resource surface (what hosts a Resource plugin's drawing).

**Editing**:
An authoring interaction in progress: a Title being written, or work a Resource plugin holds a Claim for. It ends in an Edit or in nothing.
_Avoid_: edit mode.

**Continue at**:
Where the caret and selection land after an Edit completes.

**Availability**:
Whether an authoring operation may start, given the interactions already in progress. A withheld operation has not been attempted and therefore has no refusal.
_Avoid_: eligibility, permission, enabled, disabled, refusal, mode.

**Absent**:
Of a command: not offered for a target at all, and so not drawn. An absent command differs from an unavailable one, which is drawn in place and refuses to run.

**Unavailable**:
Of a command: drawn in place, focusable, and refusing to run because Availability withholds it. Nothing was attempted, so it is not a refusal.

**Replacement epoch**:
The identity of the working Space against which local drafts and pending work were made, invalidated by accepting the stored Space. A coordinated Accept stored replaces every Space the save covered, advancing each one's epoch and discarding its drafts and pending work.
_Avoid_: revision, version, generation, session, dirty flag, cancellation registry, opening.

**Selected Resource**:
The Resource an authoring gesture acts on, separate from Opening and Presenting. Other Resources may be selected together with it. An Edge is never selected together with anything.
_Avoid_: focus, highlight, current Resource; Active Resource (Presenting's position).

**Selected Edge**:
The Edge in the Active Graph that an authoring gesture acts on. Selecting it clears every Selected Resource.
_Avoid_: Active Edge (Active Graph names the Graph; Active Resource names Presenting's position), focused Edge, highlighted Edge.

**Canvas command**:
A named action on the canvas, reached by a key, by an item on a Resource's toolbar or menu, or by both, which can be available, unavailable with a reason, or absent for a target.
_Avoid_: shortcut (the key bound to it), action (the toolbar's word for its items), Command Dock, handler, hotkey.

**Toolbar**:
A Selected Resource's commands, floated beside it. The host draws it; the commands in its kind group are the Resource plugin's.
_Avoid_: rail, except as the code's name for it.

**Command Dock**:
A Space's one command surface, floating over its canvas.

**Notice**:
A standing report in the canvas's one notice area, dismissible, and cleared by the next press of the command it reports.

## Opening and navigating

**Opening**:
Showing a Resource's content on the Resource itself, within its Map placement. A Resource plugin may give its Resources an Open and a Closed state, kept in its Map content and independent of the Resource's size: a Markdown, Mermaid, Space or Reference Resource has one.
_Avoid_: Expanded, expansion, Open Size, preview, popup, modal, dialog, drill-down, view mode, edit mode.

**Entering**:
Crossing into the Space a Space Resource references so that it takes the canvas; Opening instead shows it inside the Resource.
_Avoid_: drilling in, zooming in, descending, push, pop.

**Exit**:
The action that closes one open Space.

**Open Spaces**:
The Spaces open at once in one page, until it reloads, and the surface that lists them.
_Avoid_: rail, tab, stack, breadcrumb, switcher.

**Open Space**:
A Space listed in Open Spaces.

**Opener**:
The Space from which an open Space was Entered, or none when opened directly. It records navigation history rather than ownership.
_Avoid_: parent step, depth, step back.

**Graph navigation**:
Moving the selection on the canvas to the Active Graph neighbour in the arrow's direction, along an Edge either way. It keeps no traversal history.
_Avoid_: overview traversal, browsing, walking.

**Navigation**:
A Space's state saying what is shown: the selected Map, the Active Graph and, while Presenting, the Traversal history.
_Avoid_: Graph navigation (moving along Edges).

**Address**:
Navigation's position as one value: the selected Map, the Active Graph and the presented Resource, none outside Presenting. It is derived from Navigation, never stored.
_Avoid_: URL, Location.

**Location**:
The browser's current URL.
_Avoid_: Address (Navigation's value).

**Product URL**:
A Location under the application's Space paths, which opens what it names.

## Presenting

**Presenting**:
Traversing a Graph for an audience, one Resource at a time on the Stage.
_Avoid_: deck, slide, step, slideshow, playback, present mode.

**Presentation**:
One run through a presented Graph, from a start to the next start or the end of Presenting. A Notes window follows it.
_Avoid_: Space (a Presentation is a run, never what is presented).

**Stage**:
The Resource surface showing the Active Resource's content while Presenting, with no Map and no authoring.
_Avoid_: slide, viewer, presenter view, canvas.

**Full View**:
Reading one Resource on the Stage over the canvas, without Presenting.

**Active Resource**:
The Resource currently reached while Presenting, whose outgoing Edges in the Active Graph are the available forward moves.
_Avoid_: current slide, cursor, position, step.

**Traversal history**:
The ordered Resources visited during a presentation, used to retrace the path actually taken.
_Avoid_: Walk, route, trail, session, playthrough.

**Presentation Notes Graph**:
A Graph connecting the Resources of a presented Graph to their notes, which are ordinary Resources.
_Avoid_: speaker notes, notes field, notes Resource as a distinct kind.

**Notes window**:
A second window following a presentation with the Active Resource's notes, available moves and elapsed time.
_Avoid_: presenter view, speaker view, speaker window, console.

## Moving an Aggregate

**Aggregate directory**:
The on-disk form of an Aggregate, suitable for review, version control and sharing.
_Avoid_: catalog, bundle, export root.

**Repository**:
Where the live Aggregate is kept: PostgreSQL, SQLite or memory. Also called a store.

**Invariant failure**:
A Repository holding something InfinityCube cannot read an Aggregate from: stored state that contradicts itself, such as Meta naming a Space the Repository does not hold, or a Repository missing what an Aggregate is kept in. It is not expected to clear on its own, so a failure the next read does not repeat was not one.
_Avoid_: corruption, unavailable.

**Unreachable**:
Of a Repository: unable to answer for now, so asking again may succeed.
_Avoid_: unavailable (a command state), down, offline.

**Unclassified failure**:
A Repository failure known to be neither an Invariant failure nor Unreachable. Nothing is known about whether asking again would clear it.
_Avoid_: internal error, unknown error.

**Default Content**:
The generated Aggregate a new Repository, or a new Aggregate directory, starts from.

**Source**:
What the directory reader reads an Aggregate directory's files from: the filesystem, files held in memory, or GitHub. A source names itself, lists one directory and reads one file.

**Exporting**:
Writing a complete Aggregate into an Aggregate directory.
_Avoid_: saving, publishing, syncing; exporting a single Space.

**Importing**:
Taking a complete Aggregate from outside InfinityCube to establish or replace the stored Aggregate.
_Avoid_: loading, restoring, syncing, merging.

**Running**:
Working on an existing Aggregate directory with edits exported back to it as the durable copy.
_Avoid_: watching, syncing, live mode, session.

**Mounting**:
Working on an Aggregate read from a GitHub location, with edits kept in the browser rather than written back to GitHub.
_Avoid_: publishing, deploying, hosting, loading; mount in the React sense.

## Distribution

**Preview build**:
A published, downloadable build of InfinityCube that makes no compatibility promise: an Aggregate directory is read with the preview build that wrote it.
_Avoid_: release, version, stable build, distribution.
