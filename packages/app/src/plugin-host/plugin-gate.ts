import {
  beginExclusive,
  claim as claimIn,
  endExclusive,
  NO_CLAIMS,
  release as releaseIn,
  unmount as unmountIn,
  type ClaimChain,
  type DrawingKey,
  type Embedding,
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
  /** Let the Claim go: at once, or as soon as nothing runs inside it (`claim-chain.ts`). */
  release(): void;
  exclusively<T>(work: (own: Own) => Promise<T>): Promise<T | 'busy'>;
}

export interface PluginGate {
  readonly getState: () => ClaimChain;
  readonly subscribe: (listener: () => void) => () => void;
  /** Whether exclusive work runs anywhere, which withdraws every surface's commits. */
  readonly exclusiveRunning: () => boolean;
  /**
   * Whether an Edit made now is withdrawn: exclusive work runs, and the Edit
   * is not that work's own (`admit`). Every composed Space's Authoring asks
   * it at `complete`, so nothing changes the Space around the work.
   */
  readonly withdraws: () => boolean;
  /** Run `edit`, synchronously, as the running exclusive work's own. */
  readonly admit: <T>(edit: () => T) => T;
  /**
   * Claim for the drawing at the end of `embedding`, or `undefined` when the
   * chain refuses. `own` builds the commits exclusive work may use, live while
   * `live()` is.
   */
  readonly claim: <Own>(
    embedding: Embedding,
    own: (live: () => boolean) => Own,
  ) => HostClaim<Own> | undefined;
  /** The drawing is gone: its Claim and every Claim inside it are released. */
  readonly unmount: (drawing: DrawingKey) => void;
  /**
   * The drawings whose Claim is passed to a Map embedding, which authors that
   * Map in place under it. Such a Claim is held for the Map's authoring, not
   * for running work in the plugin's own rect, so it withdraws nothing a
   * plugin's edit does (`canvas-resource-authoring.ts`).
   */
  readonly lent: () => ReadonlySet<DrawingKey>;
  /** This drawing's Claim is passed to a Map embedding until the answer is called. */
  readonly lend: (drawing: DrawingKey) => () => void;
}

export function createPluginGate(): PluginGate {
  let chain: ClaimChain = NO_CLAIMS;
  /**
   * The one exclusive run whose commits are live. It ends whichever way the
   * chain's exclusive work ends — the work settling, or its surface unmounting
   * — so a run whose surface has gone never commits again, even after that
   * surface claims and runs anew.
   */
  let liveRun: object | null = null;
  let admitting = 0;
  const lentCounts = new Map<DrawingKey, number>();
  let lentDrawings: ReadonlySet<DrawingKey> = new Set();
  const listeners = new Set<() => void>();
  const changeLent = (drawing: DrawingKey, by: 1 | -1): void => {
    const count = (lentCounts.get(drawing) ?? 0) + by;
    if (count > 0) lentCounts.set(drawing, count);
    else lentCounts.delete(drawing);
    const next = new Set(lentCounts.keys());
    if (next.size === lentDrawings.size && [...next].every((each) => lentDrawings.has(each)))
      return;
    lentDrawings = next;
    for (const listener of [...listeners]) listener();
  };
  const install = (next: ClaimChain): void => {
    if (next === chain) return;
    chain = next;
    if (chain.exclusive === null) liveRun = null;
    for (const listener of [...listeners]) listener();
  };

  const claim = <Own>(
    embedding: Embedding,
    own: (live: () => boolean) => Own,
  ): HostClaim<Own> | undefined => {
    const drawing = embedding.at(-1)?.key;
    const next = claimIn(chain, embedding);
    if (drawing === undefined || next === undefined) return undefined;
    install(next);
    return {
      release: () => install(releaseIn(chain, drawing)),
      exclusively: async <T>(work: (own: Own) => Promise<T>): Promise<T | 'busy'> => {
        const begun = beginExclusive(chain, drawing);
        if (begun === 'busy' || begun === 'not-held') return 'busy';
        const run = {};
        liveRun = run;
        install(begun);
        try {
          return await work(own(() => liveRun === run));
        } finally {
          if (liveRun === run) install(endExclusive(chain, drawing));
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
    withdraws: () => chain.exclusive !== null && admitting === 0,
    admit: (edit) => {
      admitting += 1;
      try {
        return edit();
      } finally {
        admitting -= 1;
      }
    },
    claim,
    unmount: (drawing) => install(unmountIn(chain, drawing)),
    lent: () => lentDrawings,
    lend: (drawing) => {
      changeLent(drawing, 1);
      let returned = false;
      return () => {
        if (returned) return;
        returned = true;
        changeLent(drawing, -1);
      };
    },
  };
}
