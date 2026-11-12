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
 * - Releasing is idempotent and never refused. The deepest Claim, with no
 *   exclusive work of its own running, is released at once and returns to the
 *   one outside it. Any other holder's release is pending: it completes as
 *   soon as nothing runs inside it — when the Claims inside it are released or
 *   unmounted, or its exclusive work ends — so no plugin ever retries one.
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
  /** The holders whose release waits on a Claim inside them or their exclusive work. */
  readonly releasing: readonly DrawingKey[];
}

export const NO_CLAIMS: ClaimChain = { holders: [], exclusive: null, releasing: [] };

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

/** Whether this holder's release is pending. */
const releasing = (chain: ClaimChain, key: DrawingKey): boolean => chain.releasing.includes(key);

/**
 * The chain with every pending release that nothing now runs inside completed:
 * the deepest holder is released while its release is pending and no
 * exclusive work of its own runs, which may leave the next one deepest.
 */
function settle(chain: ClaimChain): ClaimChain {
  let { holders } = chain;
  for (;;) {
    const last = holders.at(-1);
    const key = last === undefined ? undefined : drawingOf(last)?.key;
    if (key === undefined || chain.exclusive === key || !releasing(chain, key)) break;
    holders = holders.slice(0, -1);
  }
  if (holders === chain.holders) return chain;
  const left = new Set(holders.map((embedding) => drawingOf(embedding)?.key));
  return { ...chain, holders, releasing: chain.releasing.filter((key) => left.has(key)) };
}

/**
 * The chain with this drawing's Claim released, or its release pending until
 * nothing runs inside it. A drawing that holds nothing, or whose release is
 * already pending, leaves the chain as it is.
 */
export function release(chain: ClaimChain, key: DrawingKey): ClaimChain {
  if (!holds(chain, key) || releasing(chain, key)) return chain;
  return settle({ ...chain, releasing: [...chain.releasing, key] });
}

/**
 * The chain once this drawing is unmounted: its Claim and every Claim inside
 * it released, and exclusive work run by any of them ended.
 */
export function unmount(chain: ClaimChain, key: DrawingKey): ClaimChain {
  const at = chain.holders.findIndex((embedding) => drawingOf(embedding)?.key === key);
  if (at < 0) return chain;
  const holders = chain.holders.slice(0, at);
  const left = new Set(holders.map((embedding) => drawingOf(embedding)?.key));
  const exclusive = chain.exclusive !== null && left.has(chain.exclusive) ? chain.exclusive : null;
  return settle({
    holders,
    exclusive,
    releasing: chain.releasing.filter((pending) => left.has(pending)),
  });
}

/**
 * Why exclusive work cannot start, or the chain with it running. A holder
 * whose release is pending has let its Claim go and runs nothing.
 */
export function beginExclusive(
  chain: ClaimChain,
  key: DrawingKey,
): ClaimChain | 'busy' | 'not-held' {
  if (chain.exclusive !== null) return 'busy';
  if (!holds(chain, key) || releasing(chain, key)) return 'not-held';
  return { ...chain, exclusive: key };
}

/** The chain with this drawing's exclusive work ended, and its pending release completed. */
export function endExclusive(chain: ClaimChain, key: DrawingKey): ClaimChain {
  return chain.exclusive === key ? settle({ ...chain, exclusive: null }) : chain;
}
