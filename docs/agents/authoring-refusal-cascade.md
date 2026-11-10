# Authoring refusal cascade

Traced from `deriveCompletedEdit` in `packages/app/src/space-authoring.ts`. Read
this before adding a completion action, adding or reordering a check inside
one, or adding a refusal code — it is the one place the full cascade is drawn
out end to end instead of scattered across a 1300-line function.

Scoped to completions, and that scope is the point. `StoredSpaceRefusal`
(`acceptStoredSpace`) is the other refusal family in the tree and is
deliberately absent below: it refuses an operation on the session, reaches no
completion outcome, and no surface presents both. Adding a code there is not a
change to this table.

Every `complete(completion)` call answers exactly one **completion outcome** —
`completed`, `unchanged` or `refused` (`CONTEXT.md`, ADR 0042/0057;
architecture and rationale live in `docs/agents/editing-and-persistence.md`'s
"Space Authoring's completed-edit lifecycle" section, not here). It gets there
by running an ordered cascade: one guard common to every action but two, then
that action's own ordered checks. First failure wins; nothing past it runs.
`edgeEligibility`/`connectRefusal` ask the identical checks before commit,
while a drag or connect gesture is still live in the author's hand, so the
preview and the committed Edit can never disagree.

This table is a cache of the code's control flow, not a second source of
truth for it — update it in the same commit as any change to
`deriveCompletedEdit`'s cascade, or delete the stale row rather than leave it
disagreeing with the function.

## Exclusive work

Before anything else, every `complete` — every action, `created-map` and
`renamed-space` included, and whichever Space it is made in — asks the
application's exclusive gate (ADR 0142): while a plugin's exclusive work runs,
an Edit that is not that work's own is refused `exclusive-work-running`. The
work's own commits are admitted (`PluginGate.admit`), and an Edit queued from
inside an admitted one is admitted with it.

## Universal guard

Every action but the two below asks this guard before its own checks:

1. Does the selected Map still exist? → `map-not-found`

Two actions are derived **above** it and so ask nothing universal:
`created-map` and `renamed-space` write keys of `document` rather than
anything inside a Map, read the working snapshot direct, and answer their own
placement. `renamed-space` still resolves a Map — for the placement the
completion carries, not for permission — so `map-not-found` appears in its row
as an ordinary check, asked *after* the title checks: a blank name is a blank
name whether or not the canvas has moved on.

Map and Graph deletion are not completions. They run through the coordinated
Space Resource lifecycle (`spaceResources.deleteMap` / `deleteGraph`, ADR 0076,
ADR 0091), which answers `unchanged` when no successor survives, so neither
appears in the tables below.

## Per-action checks

Guards above are omitted below.

### Resource edits

| Action | Its own checks, in order |
| --- | --- |
| `edited-resource` | `resource-not-found` → `resource-kind-immutable` → `reference-target-immutable` → `space-resource-target-immutable` → `resource-title-required` → (identical to current ⇒ `unchanged`) → `reference-target-missing` → `reference-target-not-targetable` → completed |
| `changed-content` | `resource-not-found` → `resource-content-invalid` (the kind's content schema refuses it) → then `edited-resource`'s checks from `resource-kind-immutable` on, over the document with that content |
| `created-resource` | none → completed |
| `created-reference` | `reference-targets-self` → `reference-target-missing` → `reference-target-not-targetable` → completed |
| `opened-resource` | `resource-not-in-map` → `resource-not-found` → `open-requires-content` → (already Open ⇒ `unchanged`) → completed |
| `closed-resource` | `resource-not-in-map` → (already Closed ⇒ `unchanged`) → completed |
| `resized-resource` | `resource-not-in-map` → (same size as `resourceSize` resolves it ⇒ `unchanged`) → completed |
| `opened-resource-to-fit` | `resource-not-in-map` → `resource-not-found` → `open-requires-content` → (already Open at the floored size ⇒ `unchanged`) → completed |
| `changed-map-content` | `resource-not-in-map` → `resource-not-found` → `map-content-not-kept` → `map-content-invalid` → (the same value as the entry's content resolves to, its plugin's default where it stores none ⇒ `unchanged`) → completed |
| `added-resource-to-map` | `resource-not-found` → `resource-already-in-map` → completed |
| `removed-resource-from-map` | `resource-not-in-map` → completed |
| `deleted-resource` | `resource-not-found` → `space-resource-deletion-unsupported` → `resource-has-references` → completed |

`open-requires-content` is the code `opened-resource` and `opened-resource-to-fit` raise for an Ur or an Image Resource,
which is never Open, for a Markdown Resource, whose plugin keeps its Open
as Map content (ADR 0142), and for a Reference Resource whose Target a plugin
draws or whose Target is missing, since its plugin keeps its Open as Map
content too (`takesOpen` in `packages/core/src/kinds/registry.ts`); intake
raises the same code for a Map entry storing one Open. A Reference Resource to
a Space Resource is the one Reference the application still Opens.
`map-content-not-kept` is raised for a kind no plugin draws and for a Resource
no plugin draws on this Map, which is a Reference Resource to a Space Resource
(`drawnByPlugin`); intake refuses Map content stored for one as
`map-content-invalid`. Every code string here is quoted exactly as `AuthoringRefusal['code']`
declares it. A refusal code is a stable identity across the seam (ADR 0057), so
renaming one is a change to the domain surface rather than a wording fix, made in
source and quoted here afterwards.

### Connections

| Action | Its own checks, in order |
| --- | --- |
| `create-and-connect` | `edge-resource-outside-map` → `map-active-graph-required` → completed |
| `connected-resources` | `graph-not-owned` → `edge-resource-outside-map` → `map-active-graph-required` → `edge-already-exists` → completed |
| `deleted-edge` | `graph-not-owned` → `edge-not-found` → completed |
| `titled-edge` | `graph-not-owned` → `edge-not-found` → `edge-title-one-line` → (trimmed draft is the stored Title, or empty on an untitled Edge ⇒ `unchanged`) → completed |
| `hid-edge-title` | `graph-not-owned` → `edge-not-found` → `edge-title-required` → (already hidden ⇒ `unchanged`) → completed |
| `showed-edge-title` | `graph-not-owned` → `edge-not-found` → (already shown, or no Title ⇒ `unchanged`) → completed |

The three Edge Title Edits find the Edge by its endpoints and read only the
stored Edge, never the `edge` the completion carries (ADR 0104).
`edge-title-one-line` is asked of the raw draft, before the trim, so a line
break at either end is refused rather than trimmed away. An empty draft clears
the Title and `titleHidden` with it.

### Graph edits

| Action | Its own checks, in order |
| --- | --- |
| `added-graph` | none → completed |
| `renamed-graph` | `graph-not-owned` → `graph-title-required` → (same title ⇒ `unchanged`) → completed |
| `recolored-graph` | `graph-not-owned` → (same color ⇒ `unchanged`) → completed |

### Map edits

| Action | Its own checks, in order |
| --- | --- |
| `renamed-map` | `map-not-found` → `map-title-required` → (same title ⇒ `unchanged`) → completed |

`map-not-found` here is not the universal gate 2 check: it is the action
naming a Map other than the one the Edit resolved, which is an author's stale
gesture rather than a broken invariant.

### Map creation

| Action | Its own checks, in order |
| --- | --- |
| `created-map` | none → completed |

### Space edits

| Action | Its own checks, in order |
| --- | --- |
| `renamed-space` | `space-title-required` → (same title ⇒ `unchanged`) → `map-not-found` → completed |

`renamed-space` writes `document.title` and nothing else, and it raises no
refusal of its own beyond the blank title: `map-not-found` is the code the
chosen shape already had, and a Map condition invented for it would make an
Edit that holds no Map say it needed one.

### Movement

| Action | Its own checks, in order |
| --- | --- |
| `settled-resource-movement` | none → completed |

## The 31 codes

1 contextual (`map-not-found`) plus 30 action-specific —
none is produced anywhere else. 25 of those 30 are tabulated above, and
`exclusive-work-running` is the gate's, asked of every action before its row;
`map-required` is declared and presented but currently raised nowhere, so it
appears in no row, and `image-url-unsupported`, raised by Image Resource
creation, has no row yet. `space-replaced` and `edit-abandoned` are no action's:
they are how a `queued` Edit settles when the drain discards it — a
replacement Space opened before it drained, or the Edit draining the queue
failed before reaching it — and reach only the `settle` callback its caller
passed to `complete` (ADR 0142). An Edit that is not queued never calls it.
Count the codes, not the cells: several serve more than one action —
`resource-not-found`, `resource-not-in-map`, `graph-not-owned`, `edge-not-found`,
`edge-resource-outside-map` and two of the `reference-target-*` codes each appear in more than
one row. `edge-title-one-line` is spelt from `@project/core`'s
`EDGE_TITLE_ONE_LINE`, as `resource-title-required` is from
`RESOURCE_TITLE_REQUIRED`: the Edge schema raises the same code.
`describeAuthoringRefusal` in `authoring-refusal.ts` is the one place every
code gets its copy: the domain names the code, the application owns the
sentence. Its switch is exhaustive, so a new code fails to compile until it has
one. An Edge's toolbar draws whichever of its three commands was refused in one
alert region, with no field of its own to mark — the placement record that used
to route an Edge endpoint refusal to its From or To field went with
reconnection (`.scratch/edge-toolbar/issues/05`).
