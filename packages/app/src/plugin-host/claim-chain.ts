/**
 * The Claim chain (ADR 0142), as a pure core: who is interacting, and whether
 * exclusive work runs. The shell (`plugin-gate.ts`) holds one of these for the
 * whole application and publishes each next state.
 *
 * A Claim is a drawing's: one mounted surface drawing one Resource, named by a
 * key minted for that surface's lifetime, so two drawings of the same Resource
 * never share a Claim. A drawing is placed by its embedding: the drawings it is
 * embedded in, outermost first, then itself. Claims nest through what a plugin
 * embeds, so the chain is always a run of drawings each embedded in the one
 * before:
 *
 * - The first Claim may be any drawing's. A later one is granted only to a
 *   drawing embedded in the deepest holder; a sibling, an outer drawing, another
 *   drawing of a held Resource or another chain is answered `undefined`. Asking
 *   again from the deepest holder answers the Claim it holds.
 * - Only the deepest Claim releases: an outer Claim is not released while an
 *   inner one runs, and an inner release returns to the outer.
 * - Unmounting a drawing releases its Claim and every Claim inside it.
 * - Exclusive work is one at a time, run by a held Claim, and nothing is
 *   claimed while it runs.
 * - While a drawing of a Resource holds a Claim, every other drawing of that
 *   Resource is offered no commit (`heldByAnotherDrawing`).
 */

/** What names one drawing for its surface's lifetime: unique to that mount. */
export type DrawingKey = symbol;

/** One drawing: the Resource drawn, and the key of the surface drawing it. */
export interface Drawing {
  readonly resource: string;
  readonly key: DrawingKey;
}

/** A drawing's embedding: the drawings it is embedded in, outermost first, then itself. */
export type Embedding = readonly Drawing[];

export interface ClaimChain {
  /** The holders, outermost first; each is embedded in the one before. */
  readonly holders: readonly Embedding[];
  /** The holder whose exclusive work runs, by its key, or `null`. */
  readonly exclusive: DrawingKey | null;
}

export const NO_CLAIMS: ClaimChain = { holders: [], exclusive: null };

const drawingOf = (embedding: Embedding): Drawing | undefined => embedding.at(-1);

const isStrictPrefix = (outer: Embedding, inner: Embedding): boolean =>
  outer.length < inner.length && outer.every((drawing, index) => inner[index]?.key === drawing.key);

/** Whether this drawing holds a Claim in the chain. */
export const holds = (chain: ClaimChain, key: DrawingKey): boolean =>
  chain.holders.some((embedding) => drawingOf(embedding)?.key === key);

/**
 * Whether a drawing of this drawing's Resource other than it holds a Claim:
 * the one state in which this drawing is offered no commit, so a second
 * drawing cannot change the Resource under the claimant's work.
 */
export const heldByAnotherDrawing = (chain: ClaimChain, drawing: Drawing): boolean =>
  chain.holders.some((embedding) => {
    const holder = drawingOf(embedding);
    return holder?.resource === drawing.resource && holder.key !== drawing.key;
  });

/** The deepest holder's key, whose commands show and which holds the keyboard. */
export const deepest = (chain: ClaimChain): DrawingKey | undefined => {
  const last = chain.holders.at(-1);
  return last === undefined ? undefined : drawingOf(last)?.key;
};

/** The chain with this drawing's Claim granted, or `undefined` when it is refused. */
export function claim(chain: ClaimChain, embedding: Embedding): ClaimChain | undefined {
  const drawing = drawingOf(embedding);
  if (drawing === undefined || chain.exclusive !== null) return undefined;
  const last = chain.holders.at(-1);
  if (last === undefined) return { ...chain, holders: [embedding] };
  if (drawingOf(last)?.key === drawing.key) return chain;
  if (!isStrictPrefix(last, embedding) || heldByAnotherDrawing(chain, drawing)) return undefined;
  return { ...chain, holders: [...chain.holders, embedding] };
}

/** The chain with this drawing's Claim released, or `undefined` when it may not be. */
export function release(chain: ClaimChain, key: DrawingKey): ClaimChain | undefined {
  if (deepest(chain) !== key || chain.exclusive === key) return undefined;
  return { ...chain, holders: chain.holders.slice(0, -1) };
}

/**
 * The chain once this drawing is unmounted: its Claim and every Claim inside
 * it released, and exclusive work run by any of them ended.
 */
export function unmount(chain: ClaimChain, key: DrawingKey): ClaimChain {
  const at = chain.holders.findIndex((embedding) => drawingOf(embedding)?.key === key);
  if (at < 0) return chain;
  const holders = chain.holders.slice(0, at);
  const exclusive =
    chain.exclusive !== null &&
    holders.some((embedding) => drawingOf(embedding)?.key === chain.exclusive)
      ? chain.exclusive
      : null;
  return { holders, exclusive };
}

/** Why exclusive work cannot start, or the chain with it running. */
export function beginExclusive(
  chain: ClaimChain,
  key: DrawingKey,
): ClaimChain | 'busy' | 'not-held' {
  if (chain.exclusive !== null) return 'busy';
  if (!holds(chain, key)) return 'not-held';
  return { ...chain, exclusive: key };
}

/** The chain with this drawing's exclusive work ended. */
export function endExclusive(chain: ClaimChain, key: DrawingKey): ClaimChain {
  return chain.exclusive === key ? { ...chain, exclusive: null } : chain;
}
