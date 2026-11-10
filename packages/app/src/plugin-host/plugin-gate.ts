import {
  beginExclusive,
  claim as claimIn,
  endExclusive,
  NO_CLAIMS,
  release as releaseIn,
  unmount as unmountIn,
  type ClaimChain,
  type SurfacePath,
} from './claim-chain';

/**
 * The application's one Claim chain and exclusive gate (ADR 0142, ADR 0126),
 * the thin shell over `claim-chain.ts`. Every composed Space's plugin surfaces
 * share it: a Claim held by one chain answers `undefined` to every other, and
 * exclusive work anywhere withdraws every surface's commits, which each commit
 * asks when it is called (`plugin-commits.ts`).
 */

/** A Claim a surface holds, as the host hands it out; `own` is built per run. */
export interface HostClaim<Own> {
  release(): boolean;
  exclusively<T>(work: (own: Own) => Promise<T>): Promise<T | 'busy'>;
}

export interface PluginGate {
  readonly getState: () => ClaimChain;
  readonly subscribe: (listener: () => void) => () => void;
  /** Whether exclusive work runs anywhere, which withdraws every surface's commits. */
  readonly exclusiveRunning: () => boolean;
  /**
   * Claim for the surface at `path`, or `undefined` when the chain refuses.
   * `own` builds the commits exclusive work may use, live while `live()` is.
   */
  readonly claim: <Own>(
    path: SurfacePath,
    own: (live: () => boolean) => Own,
  ) => HostClaim<Own> | undefined;
  /** The surface is gone: its Claim and every Claim inside it are released. */
  readonly unmount: (surface: string) => void;
}

export function createPluginGate(): PluginGate {
  let chain: ClaimChain = NO_CLAIMS;
  const listeners = new Set<() => void>();
  const install = (next: ClaimChain): void => {
    if (next === chain) return;
    chain = next;
    for (const listener of [...listeners]) listener();
  };

  const claim = <Own>(
    path: SurfacePath,
    own: (live: () => boolean) => Own,
  ): HostClaim<Own> | undefined => {
    const surface = path.at(-1);
    const next = claimIn(chain, path);
    if (surface === undefined || next === undefined) return undefined;
    install(next);
    return {
      release: () => {
        const released = releaseIn(chain, surface);
        if (released === undefined) return false;
        install(released);
        return true;
      },
      exclusively: async <T,>(work: (own: Own) => Promise<T>): Promise<T | 'busy'> => {
        const begun = beginExclusive(chain, surface);
        if (begun === 'busy' || begun === 'not-held') return 'busy';
        install(begun);
        let live = true;
        try {
          return await work(own(() => live));
        } finally {
          live = false;
          install(endExclusive(chain, surface));
        }
      },
    };
  };

  return {
    getState: () => chain,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    exclusiveRunning: () => chain.exclusive !== null,
    claim,
    unmount: (surface) => install(unmountIn(chain, surface)),
  };
}
