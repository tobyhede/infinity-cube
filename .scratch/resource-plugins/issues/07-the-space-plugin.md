# 07 — The Space plugin

Status: ready-for-agent

**Blocked by:** 06 — The Reference plugin.

**What to build:** the Space target of the one `Embed` in the Resource API, and Space as a plugin on it. The embedded-read machinery and `createMapSurface` sit behind the embedding, the `portal` is replaced by a Claim passed to it, and Space's own commands come from `<Rail>`; the shown Space's commands (the view chooser and framing, Enter, and its Map and Graph authoring under the passed Claim) come from the embedding, never from a kind check. The plugin keeps its authored framing (ADR 0112) in the view it passes, so choosing another Map drops it and reframing commits it. Nested Claims follow [`spec.md`](../spec.md): the deepest shows its commands, and authoring stops at today's depth (`mapSurfacePolicy`). A Space Resource Closed still requests nothing. On the Stage it draws its Map (ADR 0140). Aggregate rules (cycles, lifetime, rooting) stay in the core (ADR 0128). A Reference to a Space moves to the embedding here.

**Roll forward:** stored `open` on Space entries moves to Map content, and the Space sites in `.scratch/resource-kind-modules/kind-sites.md` go, including those in `CanvasResource`, `ResourceNode` and `SpaceCanvas`.

**Acceptance:**

- Authoring a Map in place, choosing a Map and a Graph, framing, Entering, and lifecycle on delete behave as they do today.
- Replace on an Image inside the embedding withdraws every composed Space, and the outer Claim holds until it ends.
- While it runs, a commit the Space plugin retained for changing its selected Map or closing it answers refused and changes nothing, and the replacement still lands.
- A Reference to a Space shows the Map with no authoring.
- A Space with no view shows that Space's `defaultMap` (and the Graph the host opens it on).
- A view chooser is offered by passing a commit: the host's chooser writes only through that commit, so whatever withdraws it withdraws the choice. No commit, no chooser.
- Embed commands come from the `Embed`, never from a kind check. Authoring the shown Space (its Resources, Edges, Maps and Graphs, and their rename, create, delete, recolour) appears only under a Claim the plugin passes.
- The plugin imports no `@project/*` package but the Resource API.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.

## Decisions

- **The issue 01 correction is followed, not the ADR's first wording.** The Map and Graph chooser, the shown Space's own Map and Graph authoring and its copy links belong to the host-owned Map embedding: the app's Space decoration (`packages/app/src/kinds/space.ts`) builds them as the surface's `mapRail` while the plugin embeds a Map, and they join the plugin's rail beside its own commands. The map variant of `Embed` takes `select?: Kept<SpaceView>`, which the Space plugin builds over its own content commit (`selectView`), so whatever withdraws that commit withdraws a choice. The plugin's own rail is Edit or Done, Open and Close; its Title is its own.
- **Enter stays in the host's Actions menu**, routed by the Space selection the host reads, since the Resource API has no navigation. Open in New Tab and the three copy links stay there too.
- **Portal Edit is a Claim.** Edit takes the plugin's Claim and passes it to the embedding (`claim`), under which the Map is authored in place; Done releases it. The canvas lends the Claim to the embedding through the gate's `lend`, so it does not count as body editing and withdraws nothing a plugin's own edit would. The rail toggles one control (`id: 'edit'`) between Edit and Done, and one (`open-close`) between Open and Close, and a Closed face keeps the 30px rail band clear of controls (`RAIL_BAND`), as the Markdown and Reference plugins do.
- **One Claim at a time (ADR 0142), so two portal edits are no longer concurrent.** A sibling Space Resource offers no Edit or Close while another holds its Claim. The tests that edited two drawings at once now end the first portal Edit before beginning the second, and the e2e drag between two drawings asserts the drop lands on the second drawing, whose Resources take no pointer while the first holds the Claim, and that no Edge lands.
- **Done lands a pending framing.** A wheel zoom is debounced; when a Resource leaves portal Edit, the canvas flushes its pending framing through the request's `select` before another Claim can withdraw that commit, and an unmount falls back to the last request the embedding published.
- **The canvas keeps one Map embedding request per node** (`packages/app/src/map-embeddings.ts`), which discovery reads in place of a Map entry's `open`. A publish that asks for the same view, the same presence of `select` and the same Claim keeps the stored request, whose `select` forwards to the latest published commit, so the host's re-minted commits do not churn the drawn Map.
- **A Resource drawing a Map embedding is raised to the Open z-index** (`OPEN_RESOURCE_Z_INDEX`, which the projection gives a host-Open Resource), so its drawn Map sits over its Closed neighbours as an Open Space Resource's did.
- **A Reference to a Space** draws the Space plugin inside the Reference embedding, on a surface with no `select` and no Claim, so its Map is drawn with no authoring; `authorsEmbeddedMap` decides it.
- **No host Open remains.** The host Open Edit refuses every kind, and the canvas's Enter and Shift+Enter, and Open and Expand on the Space menu, open nothing. `takesOpen`, `drawnByPlugin`, the `open` entry field, `map-content-not-kept` and `CanvasResource`'s Space branch are left unreached for issue 10 to remove.
- **Creation is unchanged** (issue 08): the Dock and the Resources list still make a Space Resource as before; the plugin has no `newContent`.
- **The plugin's glyph is Lucide's Box**, drawn with the plugin's name, while `@project/ui`'s kind view for the Resources list keeps the cube icon; e2e looks for the glyph by its name.
- **A claimed plugin surface carries `data-content-editing`**, as a Resource in content edit did, so the receding rule and active face read it.
- **`renderPlugin`'s test host draws the map variant** (`data-testid="embedded-map"` with the view and Claim as data attributes, and a choose button that commits through `select`), so a plugin's tests can drive it.
- **The plugin manifests move to 0.1.5**, because the authoring skill's Closed/Open rule now names a Space Resource's Map content.
- **E2E helpers.** `openFromRail` Opens by the keyboard (a floating toolbar near the canvas edge can sit under the minimap). `selectResource` is unchanged: the rail band keeps its press clear of the Title.
- **Focus stays on Edit across a keyboard Done.** The surface holding the Claim keeps being offered one (`pluginSurfaceOperations`): it was offered none while it held it, so the render in which its own release landed, before the gate's publication rebuilt its operations, drew it with neither Done nor Edit and the focus fell to the page. Another drawing of the same Resource still offers none while it is held.
- **Tests rolled forward with the base.** An embedded Markdown Resource is Opened before it is edited, as issue 05 made it, and the Closed story draws a Space Resource as its plugin, with the content it is created with.
- **`defineKind` no longer answers references.** Every kind is now a plugin, and `kindFromPlugin` declares `resourceReferences`, `contentTarget` and `spaceReferences` from the plugin, so the defaults were unreachable; a kind declaration now requires them.
