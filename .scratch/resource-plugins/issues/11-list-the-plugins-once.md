# 11 — List the plugins once

Status: built, in review

**Blocked by:** none. The shown Space's chooser, links and authoring come from the `Embed` (`packages/app/src/embed-commands.ts`), so `packages/app/src/kinds/space.ts` builds no rail.

**What to build:** one build list of plugins, read everywhere a choice among kinds is made, and the retirement of the three `kinds/` halves that issue 10 kept ("`kinds/` halves kept"). ADR 0142, "The plugins are listed once".

Today the kinds are enumerated five times: `core/src/kinds/plugins.ts` (`PLUGINS`), `core/src/kinds/registry.ts` (`REGISTERED`, from six one-line `kindFromPlugin` wrappers), `ui/src/kinds/plugin-views.tsx` (`PLUGIN_ENTRIES`, `PLUGIN_NAMES`), `ui/src/kinds/registry.ts` (`KIND_VIEWS`, from six listings whose `bareOperations` are all `{ kind }`) and `app/src/kinds/registry.ts` (`DECORATIONS`, from five decorators, four of which are the same call to `pluginSurfaceOperations`). They already disagree: `ui/src/kinds/space.ts` and `reference.ts` draw a host glyph in place of the plugin's. `core` and `ui` depend on every plugin package.

## Decisions

Decided with Toby, 2026-11-11, from the architecture review of the #460 stack.

1. **Where the list lives.** A new package, `@project/plugins`, with a `/domain` entry (each plugin's domain half) and a `/view` entry (each plugin's view half), as a plugin is split. It exports the build's list and, separately, the default plugin. `core` imports `/domain`; `ui` and `app` import `/view`. `core/src/kinds/plugins.ts` goes.
2. **No type per kind in the host.** `KindId`, `ContentByKind`, `Kinded`, `isOfKind` and the per-kind content types (`SpaceContent`, `ImageContent`, …) go. To the host a Resource is `Resource<unknown>` with its plugin's declarations; what the host needs from `content` it reads through those declarations. A kind is a string the list resolves to a plugin or to the default plugin.
3. **Surfaces are handed the list.** `PluginResource`, `PresentedPluginResource`, `ResourceEmbedding` and the creation host take the view entries at composition (context), so a test mounts a probe plugin the build does not list, as the spec's "the host mounts one probe plugin on each surface" requires. Intake keeps the static import of `/domain`: the domain rules are the same everywhere.
4. **The host draws no per-kind look.** A plugin's `Glyph` is its only glyph; `ui/src/kinds/space.ts`'s `SpaceResourceIcon` substitution and `BADGED_TARGET_GLYPH` go (if the Space cube is the better glyph, it moves into `plugin-space`). The badged glyph and the dotted border are drawn for any Resource whose plugin declares a Target, keyed on that declaration; `reference-canvas.css`'s `[data-kind='reference']` selector goes.
5. **One canvas decoration.** `kindDecorator`, `AgreeingAllOf`, `kindDecorationMemo`, the per-kind `slice`s and `app/src/kinds/*` go, replaced by one decoration for every Resource. The step that withholds a plugin's Claim below the canvas's own Map (`embeddedMapEdit`) moves into the surface policy, keyed on depth, not kind.
6. **Recorded in ADR 0142**, which already refines ADR 0128, not a new ADR.
7. **The default plugin** is exported by `@project/plugins` beside the list, and the host's one lookup falls back to it, replacing the separate fallbacks in `core` (`defaultKind`), `ui` (`pluginEntryFor`) and `app` (`defaultDecorator`).
8. **The Space lifecycle names no kind.** `persistence/src/space-resource-planning.ts` and `session-registry.ts` read a Space Resource's Space through the plugin's declared Space reference, and the lifecycle's default Space-kind document goes: every caller passes the document builder, as plugin creation does. `persistence` imports no plugin.
9. **One guard.** A lint zone allows only `packages/plugins` to import a `plugin-*` package. `test/unit/kind-ids-in-modules.test.ts`, `KIND_FEATURE_FILES` and `.scratch/resource-kind-modules/kind-sites.md` are retired; an exception is a lint exemption with its reason.
10. **No kind is a default.** `DEFAULT_KIND` goes. Add (canvas and Dock) creates the first plugin in list order that offers a Dock creation; the list puts Markdown first, so authors see no change. The Resources list's filters and the Dock's sort come from list order.
11. **Delivered as one PR** on top of the Embed amendment's PR, so the lists never disagree part-way.

**Roll forward:** `tsconfig.base.json`, `vitest.config.ts` and each package's narrowed `paths` for `@project/plugins`; `eslint.config.js`'s zones; `core`'s and `ui`'s `package.json`; `canvas-resource-decoration.test.ts` and other tests importing per-kind decorators or `isOfKind`; `CommandDockSpaces.tsx`'s `spaceKind.id` glyph rows; `docs/agents/editing-and-persistence.md`, `ui.md` and `rendering.md`; AGENTS.md's package layout and its ADR 0128 and 0142 entries; `CONTEXT.md` if a term moves.

**Acceptance:**

- `rg "@project/plugin-" packages src --glob '!packages/plugin*/**'` finds only `packages/plugins`.
- No `kinds/` directory remains in `core`, `ui` or `app`.
- A test mounts a probe plugin, not in the build list, on the Map, the Stage and an embedding.
- A Reference Resource's dotted border and badge are drawn by a declared Target, shown by a probe plugin that declares one.
- `CI passed` is green with every required job, including the PostgreSQL and SQLite restart proofs.

## Built

Built 2026-11-11 on the branch stacked on the Embed amendment's PR. Where the build departs from a decision above, it says so here.

- **Decision 2: content is a `JsonValue`, not `unknown`.** With `unknown`, Hono's inferred response type reads every Resource's `content` as `never`, and `packages/http/test/space-http-app-types.test.ts` (the HTTP contract equals the declared wire types) fails. The core now checks a plugin's parsed or built content is JSON as it takes it (`moduleOf` in `packages/core/src/plugin-modules.ts`), which Map content already did. The host still names no kind and reads content only through declarations.
- **Decision 3: the Dock and the rail still offer the build's creations.** `useResourcePlacement` runs a creation from the catalogue its surface is handed, and every surface draws from it; the Dock's buttons and the rail's Create entries read the build's list (`DOCK_CREATIONS`, `RESOURCE_CREATIONS`), so a probe plugin in a test's catalogue is drawn and run but not offered there.
- **Decision 9: the acceptance `rg` also matches files that are not imports.** Each package's narrowed tsconfig still maps the `plugin-*` paths so `tsc` can resolve the list package's own imports, `packages/app/workspace-aliases.ts` and the app's manifest name them for Vite, and tests and stories import a plugin directly. No package's `src/` imports one: the lint zone (`PLUGIN_LIST_IMPORTS`) refuses it, and `test/unit/plugin-list-imports.test.ts` holds both the rule and the tracked source.
- **Tests read kinds through `@project/plugins/testing`** (`isOfKind`, `contentOf`, `LISTED_KINDS`, `spaceResourceMaker`), which the same lint zone keeps out of every package's `src/`.
- **Retired with the kind sites:** `test/unit/kind-ids-in-modules.test.ts`, `kind-module-imports.test.ts`, `kind-css-selectors.test.ts`, `kind-stylesheet-order.test.ts` and `.scratch/resource-kind-modules/kind-sites.md`; `test/unit/target-stylesheet.test.ts` holds that no host stylesheet selects a kind.

Rebased 2026-11-13 onto `main` after the #472 stack's review fixes merged under it. What those fixes changed here:

- **Decision 3: an embedded probe is handed by the catalogue, not a per-surface override.** The Reference review fixes had added an `entryFor` override to `PluginSurface`, `PresentedPluginSurface` and the embedding, so a test could draw a probe plugin inside a Reference. The catalogue context does the same for every surface, so the override is gone and `packages/ui/test/resource-embedding.test.tsx` hands the probe through `PluginCatalogProvider`.
- **Decision 7: the `unavailable` filter's glyph is the default plugin's entry.** The default plugin review fixes drew it from `missingKindNaming`; that name now answers the catalogue's fallback (`packages/ui/src/ResourceKindIcon.tsx`).
- **Decision 8: the lifecycle's document was already required.** The creation review fixes had removed the lifecycle's default Space-kind document, so nothing was left to remove there; the tests keep their `showingSpace` helpers (`packages/persistence/test/showing-space.ts`, `packages/app/test/showing-space.ts`), which build the document with `spaceResourceMaker`.
- **The core's reading of a plugin keeps the review fixes' rules:** content declaring a non-UUID id is refused by the plugin's content schema, an outline that throws or answers no outline is stroked as a rectangle (`declaredOutline`, which the view's host reports), a selection has no `frame`, and `KIND_ID_FORM` words a malformed kind; all live in `packages/core/src/plugin-modules.ts`.
- **`pnpm lint` runs ESLint with a 6 GiB heap.** `projectService` holds one TypeScript program per tsconfig, and `packages/plugins/tsconfig.json` is one more. Measured 2026-11-13 on Node 24: `main` before this change already OOMs at `--max-old-space-size=3500` and passes at 4100; with this change it fails at 4100, passes at 4100 when `packages/plugins/**` is ignored, and CI's `static-checks` hit the default heap limit. The script calls `node --max-old-space-size=6144 node_modules/eslint/bin/eslint.js` rather than shrinking the program set.
