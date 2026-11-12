# Hyper

Graph-native technical content: Resources live in spatial Maps and connect into curated directed Graphs. This glossary names the domain; [the requirements](docs/requirements/) define its behaviour.

## Spaces

**Space**:
An authored world of Resources, Maps and the Graphs each Map owns. Its name is independent of the Titles of Space Resources that refer to it.
_Avoid_: presentation, manifest, deck, document, canvas, board, file, subgraph, workspace.

**Meta Space**:
The one permanent Space, at the root of Space Resource ownership in an Aggregate.
_Avoid_: root Space, home Space, default Space, Entry Space.

**Aggregate**:
All Spaces together, rooted at the Meta Space through Space Resource references.
_Avoid_: catalog, tree, bundle, collection; aggregate for a single Space.

**Space snapshot**:
The complete, fully identified form of one Space.
_Avoid_: aggregate.

**Id**:
The durable identifier of a Space, Resource, Map or Graph. Space and Resource Ids are global; Map and Graph Ids are scoped to their owning Space.
_Avoid_: guid, key, slug, local id, authored id.

**Revision**:
The version counter of a stored Space; its exported revision identifies the revision last captured by Exporting.
_Avoid_: generation, timestamp, replacement epoch.

## Resources

**Resource**:
An addressable piece of a Space with a Title and a kind, and an endpoint for Graph Edges.
_Avoid_: Card, Thing, node, slide, page, tile, subgraph.

**Title**:
The authored name and qualifications of a Resource, expressed as one or more Title Lines. The first line is its name; subsequent lines qualify it.
_Avoid_: heading, label, caption, description, subtitle as separate fields.

**Short Title**:
The first Title Line, followed by “…” when more lines follow, used when a sentence quotes a Title, including questions, notices and Edge labels. Controls, list rows and chrome use the first line alone.

**Kind**:
What a Resource's content is and does: Markdown, Image, Space, Reference or Ur. A content kind adds content of its own: Markdown or Image.
_Avoid_: MIME type, content type, file type, format.

**Content action**:
An action offered by a Resource's own content, such as editing Markdown, replacing an image or authoring the Map inside a Space Resource.
_Avoid_: capability, edit mode.

**Markdown Resource**:
A Resource whose content is Markdown written by the author.

**Image Resource**:
A Resource whose content is a picture identified by its image URL. Its Title is also the picture's text alternative.
_Avoid_: picture, photo, media, asset, attachment, file, thumbnail as names for the Resource.

**Ur Resource**:
A Resource with a Title and no content, used to diagram a named thing that Edges can connect.
_Avoid_: node, vertex, atom, plain, bare, base, stub, placeholder, empty Resource, URN.

**Space Resource**:
A Resource referring to another Space and showing its selected Map and Graph. Space Resources referring to a Space jointly own its lifetime.
_Avoid_: subspace, portal, link, nested space.

**Space Resource Framing**:
The view of a target Map authored on a Space Resource: which part is visible and at what scale.

**Reference Resource**:
A Resource showing the content of another Resource, its immutable Target, read-only. It has its own Title; its Target is any Resource kind except Reference.
_Avoid_: alias, link, copy, transclusion, mirror; Reference as a family that includes Space Resource.

## Maps and Graphs

**Map**:
An authored entity within a Space holding a placement and an ordered collection of Graphs over the Resources in that placement. Capitalised Map names the entity; lowercase map is a verb.
_Avoid_: Diagram, Layout, View, placement as a synonym.

**Placement**:
The mapping of Resources to their positions, sizes, Open/Closed states and Shapes within a Map. A Resource absent from this mapping is absent from that Map.
_Avoid_: arrangement, layer.

**Shape**:
An Ur Resource's outline in a Map: rectangle, pill, ellipse or diamond.
_Avoid_: head shape, node shape, symbol, figure, border, frame; Shape as a Resource kind.

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

**Active Graph**:
The Graph selected in a drawn Map, emphasised there and receiving new Edges.
_Avoid_: selected Graph, current Graph as separate concepts; focus, mode.

## Authoring

**Authoring**:
Interacting with a Space in a way that may change its Resources, Maps or Graphs, including attempts that produce no change.

**Interaction draft**:
The transient value of an unfinished authoring interaction, such as changed text awaiting confirmation. It is separate from a completed Edit.
_Avoid_: Draft Space, pending Edit, unsaved Edit, working copy.

**Edit**:
A validated change to the authored Space, potentially changing several parts together as one operation.

**Completion outcome**:
The result of an authoring attempt: completed (an Edit), unchanged (no change) or refused (an anticipated refusal with no Edit). Queued means waiting rather than completed; any refusal arrives when the queue drains.
_Avoid_: error, failure, exception, validation error for these outcomes.

**Availability**:
Whether an authoring operation may start, given the interactions already in progress. A withheld operation has not been attempted and therefore has no refusal.
_Avoid_: eligibility, permission, enabled, disabled, refusal, mode.

**Replacement epoch**:
The identity of the working Space against which local drafts and pending work were made, invalidated by accepting the stored Space. A coordinated Accept stored replaces every Space the save covered, advancing each one's epoch and discarding its drafts and pending work.
_Avoid_: revision, version, generation, session, dirty flag, cancellation registry, opening.

**Selected Resource**:
The Resource an authoring gesture acts on, separate from Opening and Presenting. It shares one selection with Selected Edge: only one of them is selected at a time.
_Avoid_: focus, highlight, current Resource; Active Resource (Presenting's position).

**Selected Edge**:
The Edge in the Active Graph that an authoring gesture acts on, sharing one selection with Selected Resource.
_Avoid_: Active Edge (Active Graph names the Graph; Active Resource names Presenting's position), focused Edge, highlighted Edge.

## Opening and navigating

**Opening**:
Showing a Resource's content on the Resource itself, within its Map placement. Open and Closed are authored states of that placement, independent of its size.
_Avoid_: Expanded, expansion, Open Size, preview, popup, modal, dialog, drill-down, view mode, edit mode.

**Entering**:
Crossing into the Space a Space Resource references so that it takes the canvas; Opening instead shows it inside the Resource.
_Avoid_: drilling in, zooming in, descending, push, pop.

**Exit**:
The action that closes one open Space.

**Open Spaces**:
The Spaces open at once in a session, and the surface that lists them.
_Avoid_: rail, tab, stack, breadcrumb, switcher.

**Opener**:
The Space from which an open Space was Entered, or none when opened directly. It records navigation history rather than ownership.
_Avoid_: parent step, depth, step back.

**Graph navigation**:
Moving the selection on the canvas to the Active Graph neighbour in the arrow's direction, along an Edge either way. It keeps no traversal history.
_Avoid_: overview traversal, browsing, walking.

## Presenting

**Presenting**:
Traversing a Graph for an audience, one Resource at a time on the Stage.
_Avoid_: deck, slide, step, slideshow, playback, present mode.

**Stage**:
The surface showing the Active Resource's content while Presenting.
_Avoid_: slide, viewer, presenter view, canvas.

**Active Resource**:
The Resource currently reached while Presenting, whose outgoing Edges in the Active Graph are the available forward moves.
_Avoid_: current slide, cursor, position, step.

**Traversal history**:
The ordered Resources visited during a presentation, used to retrace the path actually taken.
_Avoid_: Walk, route, trail, session, playthrough.

**Presentation Notes Graph**:
A Graph connecting the Resources of a talk Graph to their notes, which are ordinary Resources.
_Avoid_: speaker notes, notes field, notes Resource as a distinct kind.

**Notes window**:
A second window following a presentation with the Active Resource's notes, available moves and elapsed time.
_Avoid_: presenter view, speaker view, speaker window, console.

## Moving an Aggregate

**Aggregate directory**:
The on-disk form of an Aggregate, suitable for review, version control and sharing.
_Avoid_: catalog, bundle, export root.

**Exporting**:
Writing a complete Aggregate into an Aggregate directory.
_Avoid_: saving, publishing, syncing; exporting a single Space.

**Importing**:
Taking a complete Aggregate from outside Hyper to establish or replace the stored Aggregate.
_Avoid_: loading, restoring, syncing, merging.

**Running**:
Working on an existing Aggregate directory with edits exported back to it as the durable copy.
_Avoid_: watching, syncing, live mode, session.

**Mounting**:
Working on an Aggregate read from a GitHub location, with edits kept in the browser rather than written back to GitHub.
_Avoid_: publishing, deploying, hosting, loading; mount in the React sense.
