# Maps and Graphs

**Purpose:** what Maps, Map entries, Graphs and Edges hold, and what each Edit does to them.

Open conflicts are listed in [conflicts/maps-and-graphs.md](conflicts/maps-and-graphs.md). Sources are traced in [trace/maps-and-graphs.md](trace/maps-and-graphs.md).

| Not here | See |
|---|---|
| Resources, kinds, Titles, Spaces, creating a Space, Space Resource selection | [space-and-resources.md](space-and-resources.md) |
| How any Edit is derived, committed, coordinated across Spaces and undone | [editing.md](editing.md) |
| File format, schema strictness, intake, import and export, where the loader runs | [storage.md](storage.md) |
| Drawing: Shapes, Edges, lanes, markers, colour and receding, camera | [rendering.md](rendering.md) |
| Controls, menus, keys: when a command is offered, the resize control, the connection modifier, the Connect list | [ui.md](ui.md) |
| Choosing a Map, selection, traversal, URLs, presenting | [navigation.md](navigation.md) |

**Terms** (definitions are in `CONTEXT.md`):
- **Working Space**: a Space opened for authoring. A **working read** loads one.
- **Intake**: the validation every stored or imported Space passes before it loads.
- **Unchanged** and **refused**: an attempt that produces no Edit. An unchanged attempt is silent. A refused attempt carries a refusal code.
- **Canvas Map**: the Map a Space's own canvas draws. For example, renaming the selected Map from the Dock is an Edit through the canvas Map.
- **Drawn Map**: a Map drawn inside an Open Space Resource and edited in its own (target) Space. For example, moving a Resource inside the Map an Open Space Resource shows is an Edit through a drawn Map.
- **Space Resource**: a Resource that shows another Space's Map and Graph (its selection), optionally with a **framing** (a saved camera).
- **Saved Active Graph**: the Map's stored `activeGraph`.
- **Starting Map**: a Map with no entries that owns one empty Graph, which is its Active Graph. At a first working read the Map is titled `Map 1` and its Graph `Graph 1`. From Add Map the Map is titled `Map N`; its Graph's title is in C6.
- **Closed Size**: 260×146.

**Status:** **built** means code and a named test match the rule. **built (untested)** means code matches and no test covers it. **not built** means the rule is decided and no code implements it. **bug: code differs** means the code does what the note says instead. **undecided (Cn)** means the rule waits on conflict Cn; the note says what the code does meanwhile. A test is named as `file` › "test name". Paths that start with `test/` are at the repo root; all others are under `packages/`.

## Data model

| Field | Optional | Default | Written by | Refusal codes |
|---|---|---|---|---|
| Space `maps` | yes | none until the first working read | Add Map, Delete Map, first working read (MG-74) | — |
| Space `defaultMap` | stored: yes. Working Space: no | first Map (MG-76) | Add Map, Delete Map, Map Edits (MG-79), first working read (MG-74, MG-76) | `unresolved-default-map` |
| Map `id` | no | — | Add Map, first working read | `duplicate-map-id` |
| Map `title` | no | — | Add Map, Rename Map, first working read | `map-title-required`, `map-not-found` |
| Map entries (keyed by Resource id) | no, may be empty | — | Add to Map, Remove from Map, Delete from Space | `map-member-missing-resource`, `resource-already-in-map`, `resource-not-in-map` |
| entry `x`, `y` | no | — | Add to Map, Move, Resize (displacement) | — |
| entry `open` | yes | Closed | Open, Close | `open-requires-content` |
| entry `size` | yes | Closed Size | Resize | (intake: below the Closed Size) |
| entry `shape` | yes | rectangle | Choose Shape | `shape-not-taken` |
| Map `graphs` | no, at least one | — | Add Map, Add Graph, Delete Graph, first working read | `duplicate-graph-id`, `graph-not-owned` |
| Map `activeGraph` | yes | first Graph | Add Map, Add Graph, Switch Graph, Delete Graph, Map Edits (MG-79), first working read | `map-active-graph-missing`, `map-active-graph-outside-map` |
| Graph `title` | no | — | Add Graph, Rename Graph | `graph-title-required` |
| Graph `color` | yes | fallback by order (MG-48) | every creation, Recolour | — |
| Graph `headShape` | yes | `arrow` | every creation, Choose head shape | — |
| Graph `edges` | no, may be empty | — | Draw Edge, Delete Edge, Remove from Map, Delete from Space | `graph-edge-resource-outside-map`, `graph-edge-missing-resource`, `duplicate-graph-edge` |
| Edge `from`, `to` | no | — | Draw Edge | `edge-resource-outside-map`, `map-active-graph-required` |
| Edge `title` | yes | none | Title Edge | `edge-title-one-line`, `edge-not-found` |
| Edge `titleHidden` | yes (only `true`) | shown | Hide or Show Title | `edge-title-required` |

Records reject unknown keys at intake: see storage.md.

## Operations index

| Edit | Effect | Unchanged when | Refusal codes | Rules |
|---|---|---|---|---|
| Add Map | appends a starting Map, makes it `defaultMap`, selects it | — | — | MG-9–MG-11 |
| Delete Map | removes the Map and its Graphs, repoints Space Resources | it is the last Map | — | MG-12–MG-15 |
| Rename Map | writes the title | same trimmed title | `map-title-required`, `map-not-found` | MG-8 |
| Rename Graph | writes the title | same trimmed title | `graph-title-required`, `graph-not-owned` | MG-8 |
| Add to Map | writes a position | — | `resource-not-found`, `resource-already-in-map`, `map-not-found` | MG-16–MG-18 |
| Remove from Map | removes the entry and incident Edges | — | `resource-not-in-map`, `map-not-found` | MG-19 |
| Delete from Space | Remove from Map in every Map | — | see space-and-resources.md | MG-20 |
| Move | writes drop points | C7 | — | MG-21 |
| Resize | writes size and displaces | same drawn size | `resource-not-in-map` | MG-23–MG-26, MG-82 |
| Open | writes `open: true` | already Open | `resource-not-in-map`, `resource-not-found`, `open-requires-content` | MG-27–MG-28 |
| Close | writes `open: false` | already Closed | `resource-not-in-map` | MG-27 |
| Choose Shape | writes `shape` | same drawn Shape | `resource-not-in-map`, `resource-not-found`, `shape-not-taken` | MG-30–MG-31 |
| Add Graph | appends an empty Graph and activates it | — | — | MG-41–MG-42 |
| Switch Graph | writes `activeGraph` (bug: MG-45) | — | — | MG-45–MG-47 |
| Recolour | writes `color` | C6 | `graph-not-owned` | MG-49 |
| Choose head shape | writes `headShape` | same drawn head shape | `graph-not-owned` | MG-51 |
| Delete Graph | removes the Graph, repoints Space Resources | it is the last Graph | — | MG-52–MG-56 |
| Draw Edge | appends an Edge | C3 | `edge-resource-outside-map`, `map-active-graph-required`, `graph-not-owned` | MG-58–MG-63 |
| Delete Edge | removes an Edge | — | `edge-not-found` | MG-67 |
| Title Edge | writes or clears `title` | same trimmed Title | `edge-title-one-line`, `edge-not-found` | MG-64 |
| Hide or Show Title | writes `titleHidden` | already in that state | `edge-title-required` | MG-65 |
| Reorder Graphs | moves a Graph in the list | — | — | MG-39 (not built) |
| Auto-arrange | rewrites a Map's positions | — | — | MG-71 (not built) |
| First working read | writes a starting Map or `defaultMap` | Space already has both | — | MG-74–MG-77 |

## Maps and membership

- **MG-1** A Space owns its Maps. Each Map has an id, a title, one entry per member Resource, and its Graphs. *Why:* a Map is an authored diagram and part of what the Space is. **built**: `graph/test/space-intake.test.ts` › "accepts two maps owning distinct graphs over the same resources".
- **MG-2** A Map id is unique within its Space. Intake refuses a repeat (`duplicate-map-id`). *Why:* lookup would otherwise collapse two Maps into one. **built**: `graph/test/space-intake.test.ts` › "refuses duplicate map ids, which the lookup would silently collapse".
- **MG-3** A Map's members are exactly its entry keys. A Resource with no entry is not in the Map and is not drawn there, and a missing entry never means the origin. *Why:* membership and position are one fact. **built**: `graph/test/space-intake.test.ts` › "accepts a map that omits resources — a resource it leaves out is not in it"; `graph/test/positioned.test.ts` › "omits resources the authored placement omits".
- **MG-4** An entry may not name a Resource the Space lacks (`map-member-missing-resource`). *Why:* a position must belong to something. **built**: `graph/test/space-intake.test.ts` › "says only that a position names a missing resource, not that edges into it dangle".
- **MG-5** A Resource has at most one entry per Map and no placement stored on itself. It may be absent from one Map and have a different position, Open state, size and Shape in each Map that contains it. *Why:* placement is the diagram's notation. Content shown twice is a Reference Resource (see space-and-resources.md). **built**: `graph/test/snapshot-edits.property.test.ts` › "removes a Resource from the one Map only, with every Edge incident to it there".
- **MG-6** The canvas draws one Map and only the Graphs that Map owns. *Why:* nothing is drawn that no Map authored. **built**: `app/test/canvas-projection.test.ts` › "draws every Graph a selected Map owns", "draws no Edge of a Graph a sibling Map owns".
- **MG-7** A working Space always has a `defaultMap` naming one of its Maps. Intake refuses one that names no Map (`unresolved-default-map`). *Why:* a Space must always have a durable place to open. **built**: `graph/test/space-intake.test.ts` › "refuses a defaultMap naming no declared Map".
- **MG-8** A Map title and a Graph title are each one non-empty, trimmed line. A blank rename is refused (`map-title-required`, `graph-title-required`). Renaming to the same trimmed title is unchanged. *Why:* these titles are single-line names. **bug: code differs**: authoring trims and refuses a blank title, but neither authoring nor intake refuses a line break, and intake accepts an untrimmed title or one made only of spaces (`z.string().min(1)`): `app/test/space-authoring-operations.test.ts` › "refuses a blank title and treats the stored title with padding as unchanged".

## Add Map

- **MG-9** Add Map is one Edit on a Space's own canvas. It appends a starting Map, makes it that Space's `defaultMap` and selects it there. A drawn Map cannot make this Edit. *Why:* an empty Map is the way into manual authoring, and creating a Map decides where the canvas continues. **built**: `app/test/space-authoring-operations.test.ts` › "creates and selects an empty Map with one empty Active Graph"; `app/test/edit-target.test.ts` › "takes a Map lifecycle Edit from the canvas alone".
- **MG-10** A new Map is titled `Map N`. *Why:* a neutral name the author can change. **built**: `app/test/titles.test.ts` › "numbers Maps and Graphs on their own titles". How N is chosen ("one above the highest") is in C6.
- **MG-11** Add Map invoked from an Open Space Resource. **undecided (C4)**: the code runs it on the target Space's canvas, so it sets the target's `defaultMap`, then points the Space Resource at the new Map: `app/test/map-authoring-commands.test.ts` › "points the embedding Space Resource at the created Map once both Spaces have saved".

## Delete Map

- **MG-12** Delete Map removes the Map and every Graph it owns. The Resources it placed stay in the Space. *Why:* Resources belong to the Space, not to a Map. **built**: `app/test/map-authoring-commands.test.ts` › "deletes the Map, repoints every Space Resource that selected it and continues on the survivor".
- **MG-13** The last Map cannot be deleted: a deletion of it answers unchanged, with no refusal code. Whether the command is offered is in ui.md. *Why:* MG-7. **built**: `persistence/test/space-resource-lifecycle.test.ts` › "update: deleting the only Map is unchanged before any read or commit".
- **MG-14** Which Map a Delete Map leaves the Space on, and where `defaultMap` goes. **undecided (C4)**: the code takes the Map the deleting canvas shows, else `defaultMap`, else the first survivor, and moves `defaultMap` only when the deleted Map holds it: `app/test/map-authoring-commands.test.ts` › "continues on the Space’s opening Map, where the Resources that selected the deleted Map go too".
- **MG-15** Every Space Resource, in any Space, that selects the deleted Map moves in the same Edit to the surviving Map (MG-14) and that Map's Active Graph, and loses its framing. Selection itself is in space-and-resources.md. *Why:* no selection may dangle. **built**: `persistence/test/space-resource-planning.test.ts` › "moves every Space Resource selecting a deleted Map to the successor, and the default with it"; `core/test/space-kind.test.ts` › "drops the framing when the Map changes, since it was the old Map's".

## Add to Map, Remove, Delete, Move

- **MG-16** Add to Map gives a Resource the Space holds an entry in one Map, holding a position only: Closed, with no size, no Shape and no Edges. Re-adding a removed Resource restores none of its old size, Shape, Open state or Edges. A Resource already in the Map is refused (`resource-already-in-map`). *Why:* a fresh entry is the simplest thing to explain. **built**: `graph/test/placement.test.ts` › "writes an entry as given, storing no state, size or Shape it was not given"; `graph/test/snapshot-edits.property.test.ts` › "refuses a Map, a Resource or a membership it cannot add, changing nothing".
- **MG-17** A position aimed at a dropped point is kept exactly, even when another Resource occupies it. *Why:* the author chose the point. **built**: `graph/test/snapshot-edits.property.test.ts` › "keeps an exact point as aimed, even one another Resource occupies".
- **MG-18** A position from a menu, which has no aimed point, steps off any point another Resource occupies. **undecided (C6)**: the code does this: `graph/test/snapshot-edits.property.test.ts` › "never lands avoidingOverlap on a point another Resource already occupies".
- **MG-19** Remove from Map is one Edit. It removes the entry and every Edge touching the Resource in that Map's Graphs. Graphs left empty remain, and the Resource stays in the Space and in every other Map. *Why:* an Edge joins members only (MG-58). **built**: `graph/test/snapshot-edits.property.test.ts` › "removes a Resource from the one Map only, with every Edge incident to it there".
- **MG-20** Deleting a Resource from the Space applies Remove from Map in every Map. When a deletion is refused is in space-and-resources.md. *Why:* a deleted Resource can be no Map's member. **built**: `graph/test/snapshot-edits.property.test.ts` › "names exactly the Maps and Graphs Delete from Space changes".
- **MG-21** Move writes each drop point exactly as the Resource's position and keeps its Open state, size and Shape. Between Edits, the drawn position is the stored one. *Why:* positions are authored, and a conversion at render misplaces drops. **built**: `graph/test/placement.test.ts` › "preserves a Resource state, size and Shape when the renderer reports only its moved position", "authors a drop on top of a resized Resource exactly where it was released".

## Size and displacement

- **MG-22** An entry's size is optional, and with none stored the Resource is the Closed Size. No size is below the Closed Size on either axis for any kind, Open or Closed, and intake refuses one that is. No Edit writes a size on a Resource's behalf. *Why:* one floor, and content adapts to its rect (see rendering.md). **built**: `graph/test/space-intake.test.ts` › "loads an entry with neither open nor size stored"; `core/test/schema.test.ts` › "refuses a size below the Closed Size on either axis, Open or Closed".
- **MG-23** Resize writes a new size on a Resource of any kind, Open or Closed, and keeps Open/Closed and Shape. Resizing to the size it already draws at is unchanged, so resizing an entry that stores no size to the Closed Size is unchanged. *Why:* a bigger Resource is one gesture, and Closing is never a side effect of a size. **built**: `graph/test/snapshot-edits.property.test.ts` › "resizes Open or Closed, writing the size and keeping open, Shape and every Edge", "answers unchanged for a Resize to the Closed Size of an entry storing none".
- **MG-24** Let the subject sit at (sx, sy) with size (w, h) before the Resize, and change by (Δw, Δh). For every other Resource at (x, y):
  - if `x ≥ sx + w`, it moves by Δw on `x` only;
  - otherwise, if `y ≥ sy + h`, it moves by Δh on `y` only;
  - otherwise it does not move.

  The test on one axis ignores the other, so a Resource left of or above the subject never moves, and the subject itself never moves. This happens in the same Edit.

  *Example:* the subject at (0, 0), 260×146, grows to 400×200 (Δw = 140, Δh = 54). A at (300, 0) moves to (440, 0). B at (0, 200) moves to (0, 254). C at (300, 300) moves to (440, 300) (`x` wins). D at (100, 100) and E at (−300, 0) stay put.

  *Why:* one axis is enough to stay clear, and testing `x` first keeps a Resource beside the subject from moving vertically. **built**: `graph/test/placement.test.ts` › "moves each Resource on one axis, x first", "moves a Resource exactly on the bottom edge, and leaves one unit short of it", "never moves the subject, whatever the change".
- **MG-25** A Resize reads the Map as it is now and records nothing about what it pushed. A grow followed by the shrink back restores every position; a shrink followed by a grow need not. *Why:* per-Resize history goes stale, and two identical Maps would behave differently. **built**: `graph/test/placement.test.ts` › "restores every position on the shrink back", "is not an involution when the shrink comes first".
- **MG-26** Only Resize changes a size or moves another Resource, and one Resize may move many. *Why:* displacement written by the Edit that causes it keeps every position authored. **built**: `graph/test/snapshot-edits.property.test.ts` › "moves no other Resource when it removes or deletes an Open, resized one".
- **MG-82** A Resize below the Closed Size never reaches the domain: the resize control stops at the Closed Size (see ui.md). An Edit that asked for less would fail intake inside authoring and throw as a defect, not refuse. *Why:* MG-22 is a floor, not a request to check. **built (untested)**: `app/src/canvas-resource-decoration.ts` (`minWidth`); `graph/src/snapshot-edits.ts` `resize`; `app/src/space-authoring.ts` `assertValidAuthoredSnapshot`.

## Open and Close

- **MG-27** `open` is optional, and an entry with none is Closed. Open and Close write only `open`. Opening an Open Resource, or Closing a Closed one, is unchanged. *Why:* which Resources are Open is part of the diagram and survives reload and export. **built**: `graph/test/snapshot-edits.property.test.ts` › "Opens and Closes changing nothing but the subject’s open".
- **MG-28** Only a kind that declares it can Open may be Open: Markdown, Image, Space and Reference. An Open Edit on an Ur Resource is refused, and intake refuses one stored Open, both with `open-requires-content`. *Why:* an Ur Resource has no content to show. **built**: `graph/test/snapshot-edits.property.test.ts` › "refuses to Open an Ur Resource, which has no content to show"; `graph/test/space-intake.test.ts` › "refuses an Ur Resource stored Open, which has no content to show".

## Shape

- **MG-29** A Shape is one of rectangle, pill, ellipse or diamond, stored on the entry. It is optional, and an entry with none is the rectangle. Every Shape touches the midpoint of each side of its rect. *Why:* Shape is diagram notation, and Edges attach at the side midpoints. **built**: `graph/test/placement.test.ts` › "keeps the Shape of a whole entry it is given".
- **MG-30** Only an Ur Resource takes a Shape other than the rectangle. A Shape Edit on any other kind is refused (`shape-not-taken`), whatever Shape it names, and intake refuses a non-rectangle Shape on any other kind with the same code. A stored rectangle is valid on every kind. *Why:* a kind adds only what its content supports. **built**: `graph/test/space-intake.test.ts` › "refuses a %s Resource in any Shape but the rectangle"; `app/test/space-authoring-operations.test.ts` › "refuses any Shape on a %s Resource, Open or Closed, changing nothing".
- **MG-31** Choose Shape writes the chosen Shape, the rectangle included. Choosing the Shape a Resource already draws as is unchanged. Every other Edit keeps a stored Shape, and Remove from Map forgets it with the entry. *Why:* an optional field stays absent until someone chooses a value. **built**: `graph/test/snapshot-edits.property.test.ts` › "changes one Resource's Shape and nothing else, and the Shape it has is unchanged", "keeps every Shape through any number of Resizes, Open and Close".
- **MG-32** A Shape changes no rect, so size, displacement and Edge attachment are the same in every Shape. *Why:* otherwise each would depend on the Shape. **built**: `graph/test/snapshot-edits.property.test.ts` › "changes one Resource's Shape and nothing else, and the Shape it has is unchanged" (the same test as MG-31).

## Graphs

- **MG-33** A Resource is in a Graph when it is an endpoint of one of that Graph's Edges. Membership of the Map alone puts it in no Graph. *Why:* emphasis and presenting need one meaning (drawing is in rendering.md). **built**: `app/test/resource-graph-emphasis.test.ts` › "draws a Resource in no Graph in ink, receding".
- **MG-34** A Map owns a non-empty, ordered list of Graphs. Each Graph belongs to one Map, is authored only through it (`graph-not-owned`), and is never shared, so two Maps telling one narrative hold two Graphs. *Why:* a shared Graph would dangle or change when one Map loses a Resource. **built**: `app/test/space-authoring-operations.test.ts` › "refuses a Graph another Map owns, although the Space plainly holds it".
- **MG-35** A Graph id is unique across its Space (`duplicate-graph-id`, with one error per repeated id naming every occurrence). *Why:* lookup, the Graph URL and render keys find a Graph without its Map. **built**: `graph/test/space-intake.test.ts` › "reports one error per repeated graph id, naming every occurrence in order".
- **MG-36** A Graph is a set of directed Edges. It may be empty or disconnected and may contain forks, merges, cycles and self-Edges, so a revisit is an Edge back, never a second entry. Graphs on one Map are independent and may order the same Resources oppositely. Authoring never refuses an Edge for the sake of presenting or a strategy. *Why:* the Graph records what the author drew. **built**: `app/test/space-authoring-operations.test.ts` › "offers a self-Edge and a cycle, which are legal authored structure".
- **MG-37** Graphs are a Map's only connection structure. There is no other stored connection and no kind of Edge. *Why:* a second structure would compete for meaning. **built (untested)**: `core/src/schema.ts` `graphEdgeSchema`, `spaceFileObjectSchema`.
- **MG-38** Graph order is authored. A new Graph is appended, and a deletion keeps the survivors' order. *Why:* the author arranges their narratives. **built**: `app/test/space-authoring-operations.test.ts` › "appends, colours and activates one empty Graph without touching the others". The order kept on deletion is untested (`planContextDeletion`).
- **MG-39** Reorder Graphs moves one Graph within its Map's list, as one Edit. *Why:* order is authored. **not built**: tracked in `.scratch/graph-reordering/issues/01-reorder-a-maps-graphs.md` (repo root).
- **MG-40** An empty Graph is valid and may be active. Whether it can be presented is in navigation.md. *Why:* a new narrative starts empty. **built**: `app/test/space-authoring-operations.test.ts` › "creates and selects an empty Map with one empty Active Graph".
- **MG-41** Add Graph is one Edit. It appends an empty Graph with head shape `arrow` and a colour (MG-48), and makes it the Map's Active Graph, wherever the Map is drawn. *Why:* the author draws the new narrative straight away. **built**: `app/test/space-authoring-operations.test.ts` › "appends, colours and activates one empty Graph without touching the others"; `app/test/edit-target.test.ts` › "continues Navigation on the Graph its Edit made active".
- **MG-42** A Graph from Add Graph is titled `Graph N`. *Why:* a neutral name the author can change. **built**: `app/test/titles.test.ts` › "numbers Maps and Graphs on their own titles". The numbering scope (every Graph in the Space) and the starting Map's `Graph 1` are in C6.

## Active Graph

- **MG-43** Each Map has one Active Graph, and selected and active are the same thing. It changes only by Switch Graph, Add Graph, Delete Graph, or navigation that opens a Map or Graph (choosing a Map, following a product URL, presenting: see navigation.md). It never changes as a side effect of drawing, clicking, opening a Resource or panning. *Why:* because switching writes (MG-45), a switch must never happen as a side effect. **built**: `app/test/navigation.test.ts` › "selects a Map and its active Graph without changing the Space", "opens a Graph destination in its named Map with one navigation publication", "answers the activated Graph, and no presented Resource, after activateGraph". The "never a side effect" clause is untested.
- **MG-44** A Map's `activeGraph` names the Graph it opens on. With none stored the first Graph opens, and that fallback is a read that is never written on its own. Intake refuses an `activeGraph` naming no Graph (`map-active-graph-missing`) or another Map's (`map-active-graph-outside-map`). *Why:* a hand-written Space needs none, and the app names it outright. **built**: `graph/test/space-intake.test.ts` › "refuses one no map in the space owns, and says only that", "refuses one a second map owns — ownership, not existence". The "never written on its own" clause is untested.
- **MG-45** Switching Graphs on the canvas is an Edit that writes the Map's `activeGraph`. *Why:* the Graph the author is working in is durable state of the Map. **bug: code differs**: switching only changes navigation state, and it is saved only when a later canvas Edit writes it (MG-79): `app/test/navigation.test.ts` › "activating a Graph ends the current Traversal history without changing the Space".
- **MG-46** Whether switching Graphs also records the Map as `defaultMap`. **undecided (C1)**: in the code, switching writes nothing (MG-45).
- **MG-47** What switching Graphs inside an Open Space Resource writes. **undecided (C2)**: the code writes the Space Resource's selection, not the target Map: `app/src/space-resource-context-commands.ts` (`select`).

## Colour and head shape

- **MG-48** Which colour a new Graph stores, and how a Graph with none is drawn. **undecided (C6)**: the code stores the palette slot farthest from the Map's other Graphs, dark slots first, and draws a Graph with no colour in a fallback by order: `app/test/space-authoring-operations.test.ts` › "chooses its colour against the owning Map’s Graphs and no other Map’s".
- **MG-49** When Recolour is unchanged. **undecided (C6)**: the code compares with the stored colour, so a Graph that stores none is written even when the choice equals its drawn fallback. Head shape, Shape and size compare with what is drawn: `app/test/graph-authoring-commands.test.ts` › "answers a recolour to the stored colour as unchanged".
- **MG-50** Each Graph has one head shape: `arrow`, `vee`, `dot` or `diamond`. There is no `none`, no tail shape and no override per Edge. It is optional, a Graph with none is `arrow`, and every creation writes `arrow`. *Why:* the head shape tells Graphs apart where colour cannot, and always shows direction. **built**: `app/test/space-authoring-operations.test.ts` › "treats arrow as the head shape of a Graph that stores none".
- **MG-51** Choose head shape writes it. Choosing the head shape a Graph already draws is unchanged. *Why:* unchanged compares with what is drawn. **built**: `app/test/space-authoring-operations.test.ts` › "stores a chosen head shape and treats the current one as unchanged".

## Delete Graph

- **MG-52** Delete Graph removes the Graph and all its Edges from its Map. *Why:* a Graph is its Edges. **built**: `app/test/graph-authoring-commands.test.ts` › "deletes the Graph, repoints every Space Resource that selected it and answers the survivor".
- **MG-53** The last Graph of a Map cannot be deleted: a deletion of it answers unchanged, with no refusal code. Whether the command is offered is in ui.md. *Why:* a Map always has a Graph to draw. **built**: `app/test/graph-authoring-commands.test.ts` › "withholds the last Graph of a Map, and rechecks that when invoked".
- **MG-54** After Delete Graph, the saved Active Graph stays if it survives. Otherwise the first survivor in list order becomes the Active Graph and is saved, in every context, embedded included. *Why:* the result depends on the stored Map, not on any canvas. **bug: code differs**. What the code does:
  - When the saved Active Graph is the one deleted, it saves the Graph the target Space's own canvas has active on that Map, if that survives, and only otherwise the first survivor: `persistence/test/space-resource-planning.test.ts` › "prefers the named Graph and moves the Active Graph off the deleted one".
  - A Map that stores no `activeGraph` is left storing none (untested; `planContextDeletion`).
- **MG-55** Every Space Resource, in any Space, that selects the deleted Graph is repointed in the same Edit and keeps its framing. Selection itself is in space-and-resources.md. *Why:* no selection may dangle. **built**: `persistence/test/space-resource-planning.test.ts` › "prefers the named Graph and moves the Active Graph off the deleted one"; `core/test/space-kind.test.ts` › "keeps the framing when only the Graph changes, since it frames the same Map".
- **MG-56** Those Space Resources move to the Graph the Map is left on (MG-54). *Why:* a selection follows the Graph the deletion results in. **bug: code differs**: the code moves them to the Graph the target Space's own canvas has active on that Map, if it survives, else the saved Active Graph, else the first survivor, so they can land on a Graph other than the Map's: `app/test/graph-authoring-commands.test.ts` › "prefers the Active Graph an embedded target shows when it is not the one going".

## Edges

- **MG-57** An Edge is `{ from, to }` in one Graph, with an optional Title and `titleHidden`. Its identity is `(from, to)` within its Graph, and the Title is no part of it. The same pair in two Graphs is two Edges. Edits find an Edge by its endpoints. *Why:* the Title is content, not identity. **built**: `app/test/space-authoring-operations.test.ts` › "finds its Edge by endpoints, so a stale Title on the completion still lands".
- **MG-58** Both endpoints of an Edge are members of its Graph's Map. Intake refuses an endpoint outside the Map (`graph-edge-resource-outside-map`) or missing from the Space (`graph-edge-missing-resource`). Drawing one is refused (`edge-resource-outside-map`). *Why:* a Graph is closed over its Map. **built**: `graph/test/space-intake.test.ts` › "refuses an endpoint naming a space resource outside its map, and says only that".
- **MG-59** A connection cannot join Resources of two different drawings, so releasing on a Resource of another drawn Map completes nothing. *Why:* an Edge joins Resources in one Space. **built (untested)**: `app/src/edge-authoring-react.tsx` `isValidConnection` (each drawing resolves only its own Resources).
- **MG-60** Intake refuses a Graph that holds the same Edge twice, by MG-57's identity (`duplicate-graph-edge`). *Why:* one Edge, one entry. **built**: `graph/test/space-intake.test.ts` › "keys an Edge on its endpoints, so two with different Titles are still a duplicate".
- **MG-61** What drawing an Edge the Graph already holds produces. **undecided (C3)**: the code refuses it with `edge-already-exists`: `app/test/edge-authoring.test.ts` › "answers a refusal to the list that asked, and leaves nothing on the canvas".
- **MG-62** Drawing an Edge is one Edit that appends it to the Active Graph, or, in a drawn Map, to the Graph that drawing shows. With no Graph to join, the Edit is refused (`map-active-graph-required`). *Why:* new Edges join the Graph the author is working in. **built**: `app/test/space-authoring-operations.test.ts` › "offers a connection the completion accepts", "writes the Edge into the Graph the Space Resource is showing, not the canvas Active Graph". The refusal is untested.
- **MG-63** A connection may end in a new Markdown Resource, created with its entry and the Edge in one Edit. Dropped on empty canvas, the Resource is centred on the drop point. With no drop point, it goes beside the source. The gestures are in ui.md. *Why:* drawing onward is one gesture. **built**: `app/test/edge-authoring.test.ts` › "authors a Resource centred on the drop point", "authors a Markdown Resource beside the source and continues at the Edge to it".
- **MG-64** An Edge Title is optional, one line, trimmed and uncapped, and nothing mints one. A line break is refused (`edge-title-one-line`). An empty draft clears the Title and `titleHidden` with it. Setting the same Title is unchanged. *Why:* a Title is the author's words or nothing. **built**: `app/test/space-authoring-operations.test.ts` › "sets a Title on an untitled Edge", "is unchanged when the trimmed draft is the stored Title".
- **MG-65** Whether an Edge's Title shows is stored per Edge, only as `titleHidden: true` and only beside a Title. Hiding the Title of an Edge that has none is refused (`edge-title-required`). *Why:* visibility is authored like the Title. **built**: `app/test/space-authoring-operations.test.ts` › "hides a titled Edge’s Title", "refuses hiding the Title of an Edge that has none".
- **MG-66** An Edge stores no appearance. Its colour and head are its Graph's. *Why:* a style per Edge would be a second way to say which Graph it is in. **built**: `core/test/schema.test.ts` › "refuses an Edge carrying an undeclared key inside a space file".
- **MG-67** Delete Edge removes one Edge and leaves its Graph, even when empty. An Edge's end cannot be moved: the author deletes the Edge and draws a new one, which is untitled and goes last (MG-62). *Why:* a moved end is a different Edge. **built**: `app/test/space-authoring-operations.test.ts` › "deletes one Edge and leaves the Graph standing, empty".

## Layout strategies

- **MG-68** Only the positioned strategy runs while a Map is drawn. It reads the Map's entries and computes nothing. No arrangement is computed at render, on opening a Space, or when a Resource is added or dropped. *Why:* a computed arrangement is one nobody authored. **built**: `graph/test/positioned.test.ts` › "puts every resource exactly where the map says".
- **MG-69** `gridStrategy` is the one automatic strategy. It is pure and only tests use it. *Why:* a second implementation keeps the `LayoutStrategy` seam honest; the grid is not what Auto-arrange will be. **built**: `graph/test/layout.test.ts` › "places resources in reading order, wrapping at the column count".
- **MG-70** A strategy takes a `LayoutStrategyGraph` and returns one: Resources with sizes and optional `x`/`y`, and Edges with endpoints. *Why:* a Map stores positions only. **built**: `graph/test/layout.test.ts` › "carries each resource’s size and nothing positioned".
- **MG-71** Auto-arrange is an explicit, destructive Edit on an existing Map. It rewrites that Map's positions with an automatic strategy in one Edit, and the result is authored like any other position. It creates no Map, never runs at render, and is never seeded to honour a drop point. *Why:* global rearrangement is what the author asked for; an optimiser held to one drop point reshuffles the rest. **not built**: tracked in `.scratch/auto-arrange/issues/01-auto-arrange-a-map.md` (repo root).

## The first working read

- **MG-72** Removed. A new Space's contents are in space-and-resources.md (trace §1).
- **MG-73** A stored or imported Space may have no Map, and so no Graph. *Why:* the first working read supplies one (MG-74), so a hand-written or imported Space need not author one. **built**: `persistence/test/working-space.test.ts` › "persists an empty default Map before returning a mapless stored Space".
- **MG-74** The first working read of a Space with no Map persists a starting Map titled `Map 1`, as one Edit, before the Space becomes working. Its Resources are not placed and no strategy places them. *Why:* a Map makes a Space usable, and nothing authored says where its Resources go. **built**: `persistence/test/working-space.test.ts` › "persists an empty default Map before returning a mapless stored Space".
- **MG-75** Which reads run the first working read. *Why:* only a Space about to be worked in needs a Map, so exporting a mapless Space keeps it mapless. Where the loader runs is in storage.md.
  - **Initializes:** opening a Space directly, by its product URL or by Entering it (`app/src/open-spaces.ts` `compose`); drawing an Open Space Resource's target (`compose`, through `hold`); reading a Space Resource's target selection (`persistence/src/session-registry.ts` `workingTargetSelection`); and the single-Space HTTP route (`http/src/index.ts`).
  - **Never initializes:** listing Spaces; reading the whole aggregate (Export, the mount reader, the aggregate HTTP route); import completion; and intake's reference checks.

  **built**: `test/unit/aggregate-round-trip.test.ts` › "round-trips unchanged, initialized by neither export nor import"; `test/unit/app-http-startup.test.ts` › "initializes a mapless Space through an injected memory backend before opening it"; `persistence/test/space-resource-lifecycle.test.ts` › "durably initializes a stored mapless target before the Resource that selects it exists". Listing and reference checks are untested.
- **MG-76** At the first working read, a Space that has Maps but no `defaultMap` records its first Map in authored order and creates nothing. *Why:* MG-7 with the least change. **built**: `persistence/test/working-space.test.ts` › "adopts the first existing Map without creating another Map or Graph".
- **MG-77** When initialization meets a conflict, the read reloads and accepts a competing initialization, or else tries again. Any other failure stops the Space opening. *Why:* two readers must not create two Maps. **built**: `persistence/test/working-space.test.ts` › "accepts a concurrently initialized winner as ordinary working state", "retries initialization after an unrelated mapless edit wins the conflict".
- **MG-78** Whether a Space is new is never inferred from its content, and no creation marker is stored. *Why:* a one-Resource import is still an import, and the creating path knows it creates. **built (untested)**: `persistence/src/working-space.ts` `initializedSnapshot` reads only `maps` and `defaultMap`.

## What Edits write to `defaultMap` and `activeGraph`

- **MG-79** Every Edit made on the canvas records the canvas Map as `defaultMap` and writes the Graph the canvas shows as its `activeGraph`, except as the table below says. This includes Edits that change only a Resource, such as Edit Resource and Replace Image. Rename Space is the one canvas Edit that writes neither. *Why:* a Space opens where its author last worked on its own canvas. **built**: `app/test/edit-target.test.ts` › "makes the Map it edits the opening one, so a reload opens where the author was"; `app/test/snapshot.test.ts` › "writes a Map's identity and opening selection, preserving its positions and Graphs". The `activeGraph` write is tested only at `updatePositionedMap`.
- **MG-80** An Edit through a drawn Map writes that Map in its target Space and leaves the target's `defaultMap` and the Map's stored `activeGraph` alone, except as the table below says. *Why:* editing a preview is not working in that Space. **built**: `app/test/edit-target.test.ts` › "keeps the Map’s stored Active Graph when it edits on the Graph it shows".
- **MG-81** Whether Delete Map and Delete Graph on the canvas record the canvas Map as `defaultMap`. **undecided (C4)**: neither does, except that Delete Map moves a deleted `defaultMap`: `persistence/src/space-resource-planning.ts` `planContextDeletion`.

Each cell gives `defaultMap` / `activeGraph`. ✓ means it writes the canvas or drawn Map (and for `activeGraph`, the Graph shown). ✗ means it leaves the field. — means the field has nothing to write (the Map is gone). A rule id or conflict id means that rule or conflict decides it.

| Edit | Canvas Edit writes | Drawn Edit writes |
|---|---|---|
| Any other Edit (Move, Resize, Open, Shape, Add to Map, Remove, Delete from Space, Edit Resource, Replace Image, Map and Graph renames, Recolour, head shape, Edges) | ✓ / ✓ | ✗ / ✗ |
| Move to the same positions | C7 | ✗ / ✗ |
| Add Map | ✓ (the new Map) / ✓ (its Graph) | C4 (MG-11) |
| Add Graph | ✓ / ✓ (the new Graph) | ✗ / ✓ (the new Graph) |
| Switch Graph | C1 / ✓ (bug: MG-45) | C2 |
| Delete Map | C4 (MG-14) / — | C4 (MG-14) / — |
| Delete Graph | C4 (MG-81) / MG-54 | ✗ / MG-54 |
| Rename Space | ✗ / ✗ | ✗ / ✗ |

## Open questions

- **Edges between Spaces.** Should an Edge ever join Resources of two Spaces? MG-59 is the current rule.
- **Auto-arrange: recording the strategy.** Does its Edit record which strategy produced the positions?
- **Auto-arrange: confirmation.** Does it ask first while Undo is not built?
- **Auto-arrange: engine and command.** Which automatic strategy, and where the author invokes it.
- **Fork order after a redraw.** A redrawn Edge goes last (MG-67), and Graph order is the order a fork's choices are offered in. Should it keep its place?
