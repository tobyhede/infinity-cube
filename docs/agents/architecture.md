# Package boundaries

Read this before choosing a package, crossing an import boundary, adding a Resource plugin, or changing how an opened Space is composed.

## Domain and Resource plugins

- `core` owns schemas and domain types. `graph` owns intake and pure operations on a Space. Neither owns React or transport.
- A Resource plugin publishes `/domain` and `/view` from `src/domain.ts` and `src/view.tsx`. It reaches only `resource-api/domain` and `resource-api/view` among project packages. Keep React out of the domain entry. Hosts provide `resource-api/view/host`; plugin tests use `resource-api/view/testing`.
- `plugins` owns registration and choice order. Register a kind in its domain and view entries, and add the dependency to the `plugins` and `app` manifests. The default plugin handles unregistered kinds. See [Space and Resources](../requirements/space-and-resources.md) and [Build & Tooling](build-tooling.md) for plugin aliases and CSS side effects.

## Hosts and persistence

- `http` owns the browser-safe Fetch app and client contract. Node and Rust host adapters own listening and wiring. Read [HTTP & Hono](http.md) and [Storage and hosts](../requirements/storage.md) before changing either side.
- `persistence` owns the backend and session contracts, optimistic revision handling and commit lifecycle. `aggregate` owns the browser-safe Aggregate reader and repository boundaries. Filesystem and database adapters live on the host side. Read [Editing and persistence](editing-and-persistence.md) before changing save, replacement or recovery.
- `Cargo.toml` lists the Rust workspace members. Intake, host, CLI and conformance live under `crates/`. For desktop lifecycle, native menus, scheme permissions or bundle changes, start with the [desktop skill](../../.agents/skills/infinity-cube-desktop/SKILL.md).

## Application composition

- `react-flow-adapter` projects domain state into React Flow. Its Zustand store owns the drawn projection, drag bookkeeping and canvas selection. Navigation and Space Authoring own their observable state separately. Read [Rendering](../requirements/rendering.md) and [Navigation](../requirements/navigation.md) before moving state between them.
- `app` composes the opened Space. Start at `compose-app.ts` for the working Space reader, Navigation, authoring and the rendering adapter. Keep interaction continuations at the composition boundary that owns them. Read [Cross-module coordination](workflow.md#cross-module-coordination) before changing dependency or notification order.
- `ui` holds reusable primitives and presentation. Start production UI changes with the [shadcn-first-ui skill](../../.agents/skills/shadcn-first-ui/SKILL.md).

## Import enforcement

Use `@project/*` imports across packages. ESLint zones catch forbidden package imports and relative escapes. Per-package TypeScript paths narrow which aliases resolve. Root `src/` has no pnpm links for these packages. Check `tsconfig.base.json`, the affected package's tsconfig, `vitest.config.ts` and `packages/app/workspace-aliases.ts` when changing an alias. Follow the [Vite config and plugin alias rules](build-tooling.md) for those special cases.
