import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { PLUGIN_DOMAIN_SPECIFIER, PLUGIN_VIEW_SPECIFIER } from './packages/app/plugin-specifiers';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    /*
     * Order is load-bearing, and the list is therefore NOT alphabetical.
     *
     * A string `find` matches when the specifier equals it *or* starts with it
     * plus a slash, and the first match wins. So `@project/persistence` also
     * matches `@project/persistence/test-support` and rewrites it to
     * `…/src/index.ts/test-support`, which resolves to nothing. The subpath must
     * come first. Sorting these keys makes every test that imports the subpath
     * fail to collect.
     *
     * A Resource plugin is reached by the patterns `plugin-specifiers.ts`
     * exports, which match no other package's specifier, so their place in this
     * list captures no other package's subpath.
     */
    alias: [
      { find: '@project/aggregate', replacement: resolve('./packages/aggregate/src/index.ts') },
      { find: '@project/core', replacement: resolve('./packages/core/src/index.ts') },
      { find: '@project/graph', replacement: resolve('./packages/graph/src/index.ts') },
      { find: '@project/http', replacement: resolve('./packages/http/src/index.ts') },
      {
        find: '@project/persistence/test-support',
        replacement: resolve('./packages/persistence/test/backend-contract.ts'),
      },
      { find: '@project/persistence', replacement: resolve('./packages/persistence/src/index.ts') },
      { find: '@project/plugins/domain', replacement: resolve('./packages/plugins/src/domain.ts') },
      { find: '@project/plugins/view', replacement: resolve('./packages/plugins/src/view.ts') },
      {
        find: '@project/plugins/testing',
        replacement: resolve('./packages/plugins/src/testing.ts'),
      },
      {
        find: PLUGIN_DOMAIN_SPECIFIER,
        replacement: resolve('./packages/$1/src/domain.ts'),
      },
      {
        find: PLUGIN_VIEW_SPECIFIER,
        replacement: resolve('./packages/$1/src/view.tsx'),
      },
      {
        find: '@project/react-flow-adapter',
        replacement: resolve('./packages/react-flow-adapter/src/index.ts'),
      },
      {
        find: '@project/resource-api/domain',
        replacement: resolve('./packages/resource-api/src/domain/index.ts'),
      },
      {
        find: '@project/resource-api/view/testing',
        replacement: resolve('./packages/resource-api/src/view/testing.tsx'),
      },
      {
        find: '@project/resource-api/view/host',
        replacement: resolve('./packages/resource-api/src/view/host.tsx'),
      },
      {
        find: '@project/resource-api/view',
        replacement: resolve('./packages/resource-api/src/view/index.tsx'),
      },
      {
        find: '@project/ui/MarkdownSourceEditor',
        replacement: resolve('./packages/ui/src/MarkdownSourceEditor.tsx'),
      },
      { find: '@project/ui', replacement: resolve('./packages/ui/src/index.ts') },
    ],
  },
  test: {
    globals: true,
    /*
     * Node by default; jsdom only where something renders.
     *
     * jsdom was the global environment, and one test file in twenty-six renders
     * a component. Measured, the cumulative environment setup for `core` and
     * `graph` alone was 6.25s under jsdom against 2ms under node, with identical
     * results — and it scales with file count, not with how much DOM is used.
     *
     * The wall-clock is the smaller half of the argument. The larger one is that
     * a domain test should not be able to reach for `document` by accident:
     * `core` and `graph` have no React and no DOM by design (AGENTS.md), and
     * running them in a browser-shaped environment quietly permits what the
     * package boundary forbids.
     */
    environment: 'node',
    /*
     * Every spy is undone between tests.
     *
     * `vi.spyOn` mutates a shared global — `crypto.randomUUID` is the one this
     * repo pins — and without this each spy outlived the test that set it. A
     * test written after one that pinned the generator inherited a constant
     * uuid and passed for a reason its author never chose. Both spy sites set
     * theirs inside a test, so restoring between tests takes nothing away.
     */
    restoreMocks: true,
    /*
     * After-hooks run in reverse order of registration, so the unowned-update
     * guard `vitest.setup.ts` registers runs after Testing Library's cleanup
     * and charges a report raised while unmounting to the test that mounted.
     */
    sequence: { hooks: 'stack' },
    environmentMatchGlobs: [['packages/*/test/**/*.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/test/**/*.{test,spec}.{ts,tsx}', 'test/unit/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      // Source only. Tests, fixtures and config would otherwise inflate every
      // number and hide exactly the gaps this is here to show.
      include: ['packages/*/src/**/*.{ts,tsx}'],
      reporter: ['text', 'html'],
      /*
       * Per-package, pinned at what already holds — a ratchet, not an ambition.
       *
       * There is deliberately **no global threshold**. The repo-wide number is
       * dominated by React components that e2e covers and unit tests do not, so
       * a global gate would either sit uselessly low or invite tests written to
       * move a number. These packages are the pure domain and transport logic,
       * where a drop really does mean coverage was lost.
       *
       * `http` is gated for a demonstrated reason: its RFC 9110 media scanner
       * shipped at 69.89% statements with the whole quoted-pair escape path
       * unexercised, and nothing failed. An ungated package of pure branching
       * logic is exactly where that goes unnoticed.
       */
      thresholds: {
        /*
         * `core`'s branch number moved down when ADR 0079's removal deleted
         * covered core source: what is left uncovered is two of v8's synthetic
         * module-load records (`resource-geometry.ts` and `compact-uuid.ts` both
         * report line 1 uncovered while every function in them is exercised),
         * and the smaller denominator stopped diluting them. No test reaches
         * one — importing the module directly leaves the record untaken — so
         * this is re-pinned at what holds rather than chased.
         */
        'packages/core/src/**': { statements: 96, branches: 87, functions: 95 },
        /*
         * `graph`'s statement number moved down the way `core`'s did, and for
         * the same reason: ADR 0087's removal deleted covered source — the
         * per-Graph handle family in `graph-rendering.ts` and the two endpoint
         * references on `LayoutStrategyEdge` were well exercised — and the
         * smaller denominator stopped diluting v8's synthetic module-load
         * records. Every file in the package reports line 1 uncovered while
         * every function in it is exercised, and no test reaches one. Re-pinned
         * at what holds rather than chased.
         */
        'packages/graph/src/**': { statements: 94, branches: 90, functions: 95 },
        'packages/aggregate/src/**': { statements: 97, branches: 93, functions: 100 },
        'packages/http/src/**': { statements: 98, branches: 94, functions: 96 },
        'packages/persistence/src/**': { statements: 95, branches: 90, functions: 95 },
      },
    },
  },
});
