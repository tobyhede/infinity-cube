/**
 * The Claim chain (ADR 0142), as a pure core: who is interacting, and whether
 * exclusive work runs. The shell (`plugin-gate.ts`) holds one of these for the
 * whole application and publishes each next state.
 *
 * A surface is named by its path: the surfaces it is embedded in, outermost
 * first, then itself. Claims nest through what a plugin embeds, so the chain is
 * always a run of surfaces each embedded in the one before:
 *
 * - The first Claim may be any surface's. A later one is granted only to a
 *   surface embedded in the deepest holder; a sibling, an outer surface or
 *   another chain is answered `undefined`. Asking again from the deepest holder
 *   answers the Claim it holds.
 * - Only the deepest Claim releases: an outer Claim is not released while an
 *   inner one runs, and an inner release returns to the outer.
 * - Unmounting a surface releases its Claim and every Claim inside it.
 * - Exclusive work is one at a time, run by a held Claim, and nothing is
 *   claimed while it runs.
 */

/** A surface's path: the surfaces it is embedded in, outermost first, then itself. */
export type SurfacePath = readonly string[];

export interface ClaimChain {
  /** The holders, outermost first; each is embedded in the one before. */
  readonly holders: readonly SurfacePath[];
  /** The holder whose exclusive work runs, by its surface, or `null`. */
  readonly exclusive: string | null;
}

export const NO_CLAIMS: ClaimChain = { holders: [], exclusive: null };

const surfaceOf = (path: SurfacePath): string | undefined => path.at(-1);

const isStrictPrefix = (outer: SurfacePath, inner: SurfacePath): boolean =>
  outer.length < inner.length && outer.every((surface, index) => inner[index] === surface);

/** Whether this surface holds a Claim in the chain. */
export const holds = (chain: ClaimChain, surface: string): boolean =>
  chain.holders.some((path) => surfaceOf(path) === surface);

/** The deepest holder's surface, whose commands show and which holds the keyboard. */
export const deepest = (chain: ClaimChain): string | undefined => {
  const last = chain.holders.at(-1);
  return last === undefined ? undefined : surfaceOf(last);
};

/** The chain with this surface's Claim granted, or `undefined` when it is refused. */
export function claim(chain: ClaimChain, path: SurfacePath): ClaimChain | undefined {
  const surface = surfaceOf(path);
  if (surface === undefined || chain.exclusive !== null) return undefined;
  const last = chain.holders.at(-1);
  if (last === undefined) return { ...chain, holders: [path] };
  if (surfaceOf(last) === surface) return chain;
  if (!isStrictPrefix(last, path)) return undefined;
  return { ...chain, holders: [...chain.holders, path] };
}

/** The chain with this surface's Claim released, or `undefined` when it may not be. */
export function release(chain: ClaimChain, surface: string): ClaimChain | undefined {
  if (deepest(chain) !== surface || chain.exclusive === surface) return undefined;
  return { ...chain, holders: chain.holders.slice(0, -1) };
}

/**
 * The chain once this surface is unmounted: its Claim and every Claim inside
 * it released, and exclusive work run by any of them ended.
 */
export function unmount(chain: ClaimChain, surface: string): ClaimChain {
  const at = chain.holders.findIndex((path) => surfaceOf(path) === surface);
  if (at < 0) return chain;
  const holders = chain.holders.slice(0, at);
  const exclusive =
    chain.exclusive !== null && holders.some((path) => surfaceOf(path) === chain.exclusive)
      ? chain.exclusive
      : null;
  return { holders, exclusive };
}

/** Why exclusive work cannot start, or the chain with it running. */
export function beginExclusive(
  chain: ClaimChain,
  surface: string,
): ClaimChain | 'busy' | 'not-held' {
  if (chain.exclusive !== null) return 'busy';
  if (!holds(chain, surface)) return 'not-held';
  return { ...chain, exclusive: surface };
}

/** The chain with this surface's exclusive work ended. */
export function endExclusive(chain: ClaimChain, surface: string): ClaimChain {
  return chain.exclusive === surface ? { ...chain, exclusive: null } : chain;
}
