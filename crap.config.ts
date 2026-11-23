import type { CrapConfig } from './scripts/crap/score';

/**
 * The CRAP gate over the TypeScript (`pnpm crap:ts`; the metric is in
 * `scripts/crap/score.ts`). The Rust gate, `.cargo-crap.toml`, keeps the same
 * threshold, which `test/unit/crap-score.test.ts` holds.
 */
export const crapConfig = {
  /*
   * 30 is the Crap4J default: a CC-10 function needs about 42% coverage to
   * fall below it, a CC-15 one about 59%, and anything above CC 30 fails
   * however well it is tested.
   */
  threshold: 30,
  /*
   * The packages whose coverage `vitest.config.ts` gates, for the reason it
   * gives there; `test/unit/crap-score.test.ts` holds the two lists equal.
   * React reached only by Playwright records no coverage, so it is reported
   * (`pnpm crap:ts --report`) but not gated.
   */
  gated: [
    'packages/core/src/',
    'packages/graph/src/',
    'packages/aggregate/src/',
    'packages/http/src/',
    'packages/persistence/src/',
  ],
  /*
   * `<file>:<function>` of each function over the threshold that the gate
   * lets past, with why. This list only shrinks: an entry that no longer names a
   * function over the threshold fails the gate until it is deleted, and a new
   * entry is not the way past a failure.
   */
  allow: {
    'packages/http/src/product-destination.ts:parseProductDestination':
      'The product-URL grammar: one branch per path shape, so its complexity alone is over the threshold.',
  },
} satisfies CrapConfig;
