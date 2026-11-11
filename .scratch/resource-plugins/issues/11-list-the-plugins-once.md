# 11 — List the plugins once

Status: ready-for-agent

**Blocked by:** the Embed amendment of ADR 0142 being built (the shown Space's chooser and authoring come from the `Embed`, so `packages/app/src/kinds/space.ts` builds no rail).

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
