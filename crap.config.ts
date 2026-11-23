import type { CrapConfig } from './scripts/crap/score';

/**
 * The CRAP gate over the TypeScript (`pnpm crap:ts`, `scripts/crap.ts`). The
 * Rust crates have their own, `.cargo-crap.toml`, at the same threshold.
 */
export const crapConfig = {
  /*
   * 30 is the Crap4J default: a CC-10 function needs about 42% coverage to
   * fall below it, a CC-15 one about 59%, and anything above CC 30 fails
   * however well it is tested.
   */
  threshold: 30,
  /*
   * The packages whose coverage `vitest.config.ts` already gates, for the
   * reason it gives there: they are the pure domain and transport logic, where
   * unit coverage is the whole measure. React components are reached by the
   * Playwright suites, which record no coverage, so their scores are reported
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
   * `<file>:<function>` of each function already over the threshold when the
   * gate was added. This list only shrinks: an entry that no longer names a
   * function over the threshold fails the gate until it is deleted, and a new
   * entry is not the way past a failure.
   */
  allow: {
    'packages/http/src/product-destination.ts:parseProductDestination':
      'The product-URL grammar, one branch per path shape (CC 38). Fully covered; it fails on complexity alone.',
  },
} satisfies CrapConfig;
