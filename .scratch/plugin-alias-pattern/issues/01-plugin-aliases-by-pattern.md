# 01: Plugin path aliases by pattern

**What to build:** adding a `packages/plugin-*` package needs no alias edit anywhere. Today each plugin is named by hand in 20 lines across 14 files, and no test checks those lists agree. After this, the per-plugin cost is the two entries in the plugin list and the two `package.json` dependency lines.

**Blocked by:** PR #481 (the Mermaid plugin) merging. This lands as its own PR off `main`.

**Status:** ready-for-agent

**Decisions (agreed 2026-11-18):**

1. Convert all three kinds of list: tsconfig `paths` (`tsconfig.base.json` and the nine narrowed `packages/*/tsconfig.json`), the Vitest alias list, and the server builds' workspace aliases.
2. In tsconfig, one wildcard entry per half a package may reach: `"@project/plugin-*/domain": ["../plugin-*/src/domain.ts"]` and, where the package may reach views, `"@project/plugin-*/view": ["../plugin-*/src/view.tsx"]`. Checked in `packages/core` with tsc 7: the typecheck passes, and a view import is still refused there.
3. In Vite and Vitest, a regular-expression alias, not a directory listing. `ssr.noExternal` takes the same expression. Not yet run; check the subpath-before-package ordering note in `vitest.config.ts` still holds.
4. Replace the hard-coded alias count in the HTTP server build config test with a test that walks `packages/plugin-*` and checks each has both halves and resolves through the alias. Derive the hand-written file list in the plugin import-restrictions test from the same walk.
5. Keep the `package.json` dependency lines in `plugins` and `app`; pnpm needs them.
6. No ADR (no ADR covers aliases, and no domain decision changes). Update AGENTS.md's "Cross-package imports" paragraph and its "one line in each half" claim, and `docs/agents/build-tooling.md`.

- [ ] No file outside `packages/plugins` and the two `package.json` files names an individual plugin's specifier.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages` and the dev, mount, HTTP server and desktop sidecar builds resolve every plugin.
- [ ] A package that may not reach a plugin's view half still cannot (the narrowing holds per package).
- [ ] The new walk test fails when a `packages/plugin-*` directory lacks a half.
- [ ] CI passes on the PR.
