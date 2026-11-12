# 02 — The Resource API and its hosts, with Ur on it

Status: ready-for-agent

**Blocked by:** 01 — Prove the interface.

**What to build:** `@project/resource-api` with its `/domain` and `/view` entries, as [`spec.md`](../spec.md) sets out, `renderPlugin`, and the build-time plugin list. `/domain` declares `Resource<C>`, the one structure the core, stores, HTTP and plugins take. The host's Claim chain and `exclusively` are built here, as the spec's invariants set out. A Map host in `ResourceNode` draws the rect, handles, rail, and the border and ring on a declared outline around a plugin's view, inside a per-Resource failure boundary. The Stage hosts the same view. Both fall back to today's `CanvasResource` and `presented` for a kind not yet moved. Map entries gain optional `content`, parsed by the plugin's Map content schema, resolved through its default and `withoutMap`, committed as an Edit and carried through Import and Export. `complete` gains a way to settle a `queued` Edit, and the host refuses a commit from a withdrawn surface.

Ur moves first because it is the smallest. Its package holds both halves, it declares its outline from its Shape, and `shape` moves into its Map content. `Title`, `Own` and `<Rail>` are built here.

**Roll forward:** every stored Ur `shape` moves to Map content, `docs/schema/space.schema.json` follows, and `CanvasResource`'s Ur branch goes (`.scratch/resource-kind-modules/kind-sites.md`). The Shape Edit and intake refusal for another kind become that plugin's schema answering, so this step removes the Map entry's `shape`, the core's `takesResourceShape` and the `shape-not-taken` refusal: a Map content commit no plugin keeps is refused `map-content-not-kept`, and one a plugin's schema rejects `map-content-invalid`, at intake and at `complete` alike. `open`, `canOpen`, `takesOpen` and `open-requires-content` stay until `10`.

**Acceptance:**

- An Ur Resource keeps every Shape, per Map, through a reload, an Export and an Import, with the ring on its outline.
- Ur imports no `@project/*` package but `@project/resource-api`, and a lint rule fails any other.
- A plugin with a wrong `apiVersion` fails the build.
- A plugin that throws loses its Resource and not the canvas.
- On the Stage it gets no commit and the value `withoutMap` gives.
- A commit settles once its Edit has been applied, including one `queued` behind another, and answers refused from a replaced working Space and from a withdrawn surface.
- A Claim held by one chain answers `undefined` to another, an inner release returns to the outer, and an outer Claim is not released while an inner one runs.
- `exclusively` is one at a time and answers `busy` before any work starts; while it runs, every retained commit, the surrounding Claims' included, answers refused, and only the work's own commits land.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.

## Decisions

Made while delivering this ticket (PR #463).

- **Where the plugin list lives.** It is `packages/core/src/kinds/plugins.ts` (`PLUGINS = pluginList([urPlugin])`), so core, graph and intake read plugins with no React. Each plugin's view half is keyed to that list in `packages/ui/src/kinds/plugin-views.tsx`, with `satisfies Record<PluginKind, PluginEntry>`, so a plugin the list names and ui omits fails to compile.
- **How `apiVersion` is checked.** `pluginList` takes only elements whose `apiVersion` is the API's literal, which is the build failure. It also refuses on load (`PluginListError`), for a plugin that slips past the types. Both are held by `packages/resource-api/test/domain.test.ts`.
- **Core lost `rootDir`.** Core now imports `@project/resource-api` and `@project/plugin-ur`, whose files resolve outside core's own directory.
- **`definePluginView` takes the domain half.** The view knows its own kind and names without restating them.
- **Outlines are a fixed vocabulary.** `OUTLINES` is rectangle, pill, ellipse and diamond. The host strokes only those, and a plugin declares one. It cannot draw an arbitrary path.
- **Map content type and storage.**
  - Map content is held as `JsonValue` and compared whole, key order aside (`sameJsonValue`).
  - `JsonArray` and `JsonObject` are *mutable* interfaces. Only that form is its own image under Hono's `JSONParsed`; readonly or alias forms made `space-http-app-types.test.ts` recurse too deeply.
  - PostgreSQL `jsonb` may reorder the keys of multi-key Map content on Export. Ur's Map content has one key, so nothing changes yet.
- **Unchanged is computed against the resolved value.** An Edit that writes the plugin's default to an entry that stores none answers `unchanged`.
- **Refusal codes.**
  - `changed-map-content` refuses `map-content-not-kept` (no plugin draws the kind) and `map-content-invalid` (the plugin's schema refuses the value). `shape-not-taken` is gone.
  - Intake raises `map-content-invalid` too.
  - A `queued` Edit discarded by the drain settles `space-replaced` or `edit-abandoned`, through the optional `settle` callback `complete` now takes.
- **Withdrawn surfaces.** The host refuses a commit from a withdrawn surface in three places:
  - **An unmounted surface:** `PluginSurface` refuses with "This Resource is no longer drawn here."
  - **A moved epoch:** a commit built before the `replacementEpoch` moved is refused.
  - **Exclusive work elsewhere:** while exclusive work runs anywhere, every plain commit answers refused. The work's own commits stay live only while it runs, and end when its surface unmounts mid-run, so a second run may start without the first's commits beside it.
  - A non-JSON value is refused before it reaches the host.
- **The size hint is accepted and ignored** until the Markdown plugin (issue 05) needs it.
- **Assets and Embed are stubs.**
  - `Surface.assets` has `url` and `read`, plus optional `pick` and `store`, matching issue 03's `AssetClient`. Here it reads nothing.
  - `Embed` is one stable component that draws nothing. A test holds its identity across renders.
- **The embedded Map's selection declaration is deferred to issue 07.**
- **Plugin kind facts.** `kindFromPlugin` derives every flag false but one: not Open-able and no referenced Spaces, and a Target where the plugin declares `mayBeTarget`. Ur declares it, so a Reference to an Ur Resource is accepted, as it was before. An Ur Resource no longer offers Open, which it never could.
- **Ur computes its own insets.** It lays out its Title in the rectangle its Shape inscribes. The host gives it the rect and strokes the outline.
- **Claims.**
  - **The gate and ADR 0126's hold are separate.** The Claim chain and exclusive gate are one per page, held by Open Spaces and handed to every composed Space, and are not yet linked to ADR 0126's hold. That is a note for issue 04.
  - **A held Claim gives the plugin the whole rect.** The plugin's layer takes `nodrag nopan nowheel` while its surface holds a Claim, so the canvas neither drags nor pans under it.
  - **A Claim is a drawing's, not a Resource's** (review of #463). Each mounted surface mints a key for its lifetime (`Symbol`, no id), and a drawing is `{ resource, key }`. The chain's holders are embeddings, outermost first, compared by key, so two drawings of one Resource never share a Claim and unmounting one leaves the other's held. Nested drawings arrive with the Space plugin, which prepends the drawings they are embedded in. The chain names a drawing's place an embedding, since `path` means a file path.
  - **A release is never refused** (review of #463). `Claim.release()` answers nothing. Where the Claim cannot go yet — a Claim inside it is held, or its own exclusive work runs — the chain marks it `releasing` and completes the release as soon as that inner Claim is released or unmounted or the work ends (`claim-chain.ts`, `settle`). Releasing again changes nothing, and a holder whose release is pending runs no exclusive work. A `boolean` answer would have made every plugin keep the Claim and retry.
  - **While a drawing holds a Claim, every other drawing of its Resource is offered no commit** (review of #463 and #465). `heldByAnotherDrawing` in `claim-chain.ts` is the pure predicate. The canvas offers it to the surface as `claimHolder(drawing)`, read when called, so the other drawing re-renders with no commits, no Claim, a read-only Title and no Actions, and a commit it kept answers refused. The chain also refuses that drawing a Claim. `PluginOperations.claim` takes the drawing's key, and `claimed` is gone.
- **A Reference to an Ur Resource keeps the old frame.** It is not drawn by Ur's plugin, so it is the rectangle. On the Stage, Ur is drawn by its plugin, which centres its Title itself. A Reference to one is still drawn by `PresentedResource`, so `ur-stage.css` stays, scoped off `.resource--plugin`, and centres that Reference's name as a title slide (review of #463).
- **A refusal a plugin draws is `role="alert"`**, as every refusal is (`docs/agents/ui.md`). A plugin has no design-system primitives yet; that gap is recorded in `docs/agents/ui.md`.
- **The Stage's nominal size is 1600×900.** The Stage host hands the plugin that size, `withoutMap`'s value, no commit and no Claim.
- **Kind-neutral modules.** `plugins`, `plugin-kind` and `plugin-views` joined `KIND_NEUTRAL_MODULES` in `eslint.config.js`, because they read every plugin alike. A `packages/plugin-*` package counts as a kind module in `kind-ids-in-modules.test.ts`.
- **A test seam for the host.** `PluginSurface` takes the plugin's entry, so `packages/ui/test/PluginResource.test.tsx` draws a probe plugin through the real Map host.
- **Commit identities are stable.**
  - The host memoises its guarded operations, and the plugin entry memoises its JSON-checking wrappers.
  - Otherwise a plugin that publishes rail commands keyed on a commit re-renders the host forever.
  - A surface's lifetime (still drawn, Claims to release) is one object held in state rather than refs read during render.
- **Optional capability members accept `undefined`.** These are `Kept.commit`, `KeptMap.commit`, the `Exclusive` members, `Surface.claim` and the host's `PluginOperations` and `PluginCommits`. Absent and `undefined` mean the same to a plugin, and hosts build a surface as one literal.
- **A rail drawn in the rect stands over the plugin's pixels** (`.canvas-resource--plugin > .canvas-resource__actions`), since the plugin's layer fills the rect.
- **Exclusive work withdraws every Edit, at `complete`** (review of #463). Issue 01's Answer withdraws every commit while exclusive work runs, so the check sits at the one door every Edit enters: each composed Space's Authoring asks the page's gate first, before every other check, and refuses `exclusive-work-running` ("Wait for the change in progress to finish."). The work's own commits are admitted through the gate. Host Title rename, Close, Delete, Remove from Map and the Dock are refused there, not per caller.
- **Withdrawal is offered as well as enforced.** The canvas subscribes to the gate, so while work runs elsewhere a plugin surface re-renders with no commits, no Claim, a read-only host Title and no Actions. Host-drawn controls of other kinds and the Dock are only refused at `complete`; they are not yet redrawn without their commands, and Navigation is not withdrawn.
- **A commit whose Edit throws answers refused** ("This change could not be made.") and the throw goes to the composition's reporter.
- **Failure boundaries start again on what they draw.** Both are keyed on the Resource and the Replacement epoch, and report to the composition's reporter. The Map's also takes the Map content as `retryOn`: a failed drawing is tried again once the value changes, compared with `sameJsonValue`, and a drawn plugin is not remounted, so its state and Claims survive a Map content commit (review of #463).
- **A plugin's declared reference must be a UUID.** `kindFromPlugin` refines the plugin's content schema so content naming a non-UUID id is refused where it is parsed, intake included, rather than the reference being dropped (review of #463).
- **The host's Title is one component per surface lifetime on every host.** The Stage host and `renderPlugin` read the Title from context, as the Map host does, so a rename does not remount it (review of #463).
- **The core's Resource is the API's `Resource<C>`**, instantiated per kind with the registry's content, so the core, the stores, HTTP and plugins take one structure. `Resource<C>`'s content defaults to `unknown`.
- **`renderPlugin` is the host in miniature.** A granted store records the bytes and answers a reference, a granted pick answers the files given, and exclusive work answers busy beside a run, withdraws every other commit, store and pick, and keeps own commits to the run.
- **A JSON object with an own `__proto__` key is refused**, at any depth, since a record parse drops the key.
- **Lint and catalogue.** Every file under a plugin's domain entry takes the domain zone (no React, no view), `/view/testing` is refused in a plugin's source, and the UI catalogue reads every `packages/plugin-*/src` and the Resource API's view half.
- **`AGENTS.md` records the ten packages and that the Resource API and Ur are built.**
