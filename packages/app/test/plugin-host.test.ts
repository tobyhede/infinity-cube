import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { uuidSchema, type ResourceDocument } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import { isStoredAsset, type Answer, type StoreAnswer } from '@project/resource-api/domain';
import type { PluginOperations } from '@project/ui';
import {
  beginExclusive,
  claim,
  deepest,
  endExclusive,
  heldByAnotherDrawing,
  holds,
  NO_CLAIMS,
  release,
  unmount,
  type ClaimChain,
  type Drawing,
} from '../src/plugin-host/claim-chain';
import {
  answerOf,
  completeAsAnswer,
  pluginSurfaceOperations,
  type PluginHost,
} from '../src/plugin-host/plugin-commits';
import { createPluginGate } from '../src/plugin-host/plugin-gate';
import type { AuthoringResult, Settle } from '../src/space-authoring';

const RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const FACTS = { authorOnCanvas: true, editable: true };

/** Why storing refused, or undefined for a store that answered a reference. */
const refusalOf = (stored: StoreAnswer | undefined): string | undefined =>
  stored === undefined || isStoredAsset(stored) ? undefined : stored.refused;

/** Why an answer refused, or undefined for one that did not. */
const reasonOf = (answer: Answer | undefined): string | undefined =>
  answer === undefined || answer === 'completed' || answer === 'unchanged'
    ? undefined
    : answer.refused;

/** Drawings of Resources `a`, `b` and `c`, each keyed for its own surface. */
const drawingOf = (resource: string): Drawing => ({ resource, key: Symbol(resource) });
const A = drawingOf('a');
const B = drawingOf('b');
const C = drawingOf('c');

describe('the Claim chain (ADR 0142)', () => {
  it('grants a first Claim to any drawing, and a later one only inside the deepest', () => {
    const outer = claim(NO_CLAIMS, [A]);
    expect(outer).toEqual({ holders: [[A]], exclusive: null, releasing: [] });
    if (outer === undefined) return;
    expect(claim(outer, [B])).toBeUndefined();
    expect(claim(outer, [A])).toBe(outer);
    const inner = claim(outer, [A, B]);
    expect(inner?.holders).toEqual([[A], [A, B]]);
    if (inner === undefined) return;
    expect(deepest(inner)).toBe(B.key);
    expect(claim(inner, [A, C])).toBeUndefined();
  });

  it('releases the deepest Claim at once, returning to the one outside it', () => {
    const chain: ClaimChain = { holders: [[A], [A, B]], exclusive: null, releasing: [] };
    expect(release(chain, B.key)).toEqual({ holders: [[A]], exclusive: null, releasing: [] });
    expect(release(NO_CLAIMS, A.key)).toBe(NO_CLAIMS);
  });

  it('keeps an outer Claim released while an inner one runs, and completes it when that one is released', () => {
    const chain: ClaimChain = { holders: [[A], [A, B]], exclusive: null, releasing: [] };
    const pending = release(chain, A.key);
    expect(pending).toEqual({ ...chain, releasing: [A.key] });
    expect(holds(pending, A.key)).toBe(true);
    expect(release(pending, A.key)).toBe(pending);
    expect(beginExclusive(pending, A.key)).toBe('not-held');
    expect(release(pending, B.key)).toEqual(NO_CLAIMS);
  });

  it('completes an outer release when the Claim inside it unmounts', () => {
    const chain: ClaimChain = { holders: [[A], [A, B]], exclusive: null, releasing: [A.key] };
    expect(unmount(chain, B.key)).toEqual(NO_CLAIMS);
  });

  it('keeps a Claim released during its exclusive work until that work ends', () => {
    const held: ClaimChain = { holders: [[A], [A, B]], exclusive: B.key, releasing: [] };
    const pending = release(held, B.key);
    expect(pending).toEqual({ ...held, releasing: [B.key] });
    expect(deepest(pending)).toBe(B.key);
    expect(endExclusive(pending, B.key)).toEqual({
      holders: [[A]],
      exclusive: null,
      releasing: [],
    });
    // An outer release pending behind it completes with it.
    expect(endExclusive(release(pending, A.key), B.key)).toEqual(NO_CLAIMS);
  });

  it('releases a drawing and every Claim inside it when it unmounts, ending their work', () => {
    const chain: ClaimChain = {
      holders: [[A], [A, B], [A, B, C]],
      exclusive: C.key,
      releasing: [C.key],
    };
    expect(unmount(chain, B.key)).toEqual({ holders: [[A]], exclusive: null, releasing: [] });
    expect(unmount(chain, Symbol('z'))).toBe(chain);
  });

  it('runs exclusive work one at a time, for a holder, and grants nothing while it runs', () => {
    const held: ClaimChain = { holders: [[A], [A, B]], exclusive: null, releasing: [] };
    expect(beginExclusive(NO_CLAIMS, A.key)).toBe('not-held');
    const running = beginExclusive(held, B.key);
    expect(running).toEqual({ ...held, exclusive: B.key });
    if (running === 'busy' || running === 'not-held') return;
    expect(beginExclusive(running, A.key)).toBe('busy');
    expect(claim(running, [A, B, C])).toBeUndefined();
    expect(endExclusive(running, B.key)).toEqual(held);
  });

  it('keeps two drawings of one Resource apart: one Claim, and unmounting the other keeps it', () => {
    const first = drawingOf('a');
    const second = drawingOf('a');
    const held = claim(NO_CLAIMS, [first]);
    expect(held).toBeDefined();
    if (held === undefined) return;
    expect(claim(held, [second])).toBeUndefined();
    expect(holds(held, first.key)).toBe(true);
    expect(holds(held, second.key)).toBe(false);
    expect(unmount(held, second.key)).toBe(held);
    expect(release(held, second.key)).toBe(held);
  });

  it('says another drawing holds the Resource only to a drawing of it that does not hold', () => {
    const first = drawingOf('a');
    const second = drawingOf('a');
    const held = claim(NO_CLAIMS, [first]);
    if (held === undefined) throw new Error('A first Claim is granted.');
    expect(heldByAnotherDrawing(held, second)).toBe(true);
    expect(heldByAnotherDrawing(held, first)).toBe(false);
    expect(heldByAnotherDrawing(held, B)).toBe(false);
    expect(heldByAnotherDrawing(NO_CLAIMS, second)).toBe(false);
    // Nor to a drawing embedded in the holder, which is not the same Resource.
    const inner = claim(held, [first, B]);
    if (inner === undefined) throw new Error('An embedded drawing may claim.');
    expect(heldByAnotherDrawing(inner, second)).toBe(true);
    expect(heldByAnotherDrawing(inner, drawingOf('b'))).toBe(true);
  });

  it('keeps every chain a run of drawings each embedded in the one before', () => {
    const drawings = [A, B, C, drawingOf('a')];
    const step = fc.oneof(
      fc.record({
        kind: fc.constant('claim' as const),
        embedding: fc.array(fc.constantFrom(...drawings), { minLength: 1, maxLength: 3 }),
      }),
      fc.record({ kind: fc.constant('release' as const), drawing: fc.constantFrom(...drawings) }),
      fc.record({ kind: fc.constant('unmount' as const), drawing: fc.constantFrom(...drawings) }),
      fc.record({ kind: fc.constant('begin' as const), drawing: fc.constantFrom(...drawings) }),
      fc.record({ kind: fc.constant('end' as const), drawing: fc.constantFrom(...drawings) }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 20 }), (steps) => {
        let chain = NO_CLAIMS;
        for (const next of steps) {
          if (next.kind === 'claim') chain = claim(chain, next.embedding) ?? chain;
          else if (next.kind === 'release') chain = release(chain, next.drawing.key);
          else if (next.kind === 'unmount') chain = unmount(chain, next.drawing.key);
          else if (next.kind === 'end') chain = endExclusive(chain, next.drawing.key);
          else {
            const begun = beginExclusive(chain, next.drawing.key);
            if (begun !== 'busy' && begun !== 'not-held') chain = begun;
          }
          chain.holders.forEach((embedding, index) => {
            const outer = chain.holders[index - 1];
            if (outer === undefined) return;
            expect(embedding.slice(0, outer.length)).toEqual(outer);
            expect(embedding.length).toBeGreaterThan(outer.length);
          });
          if (chain.exclusive !== null) expect(holds(chain, chain.exclusive)).toBe(true);
          // A release is pending only for a holder, and only while something
          // runs inside it: a Claim inside it, or its own exclusive work.
          const top = deepest(chain);
          for (const pending of chain.releasing) expect(holds(chain, pending)).toBe(true);
          if (top !== undefined && chain.releasing.includes(top)) {
            expect(chain.exclusive).toBe(top);
          }
          // At most one drawing of a Resource holds a Claim.
          const held = chain.holders.map((embedding) => embedding.at(-1));
          for (const drawing of held) {
            if (drawing === undefined) continue;
            const others = held.filter(
              (other) => other?.resource === drawing.resource && other.key !== drawing.key,
            );
            expect(others).toEqual([]);
          }
        }
      }),
    );
  });
});

describe('the plugin gate', () => {
  it('answers busy to exclusive work while other work runs, and withdraws the gate after', async () => {
    const gate = createPluginGate();
    const held = gate.claim([A], (live) => ({ live }));
    expect(held).toBeDefined();
    let liveInside: () => boolean = () => false;
    let finish: () => void = () => undefined;
    const running = held?.exclusively(
      (own) =>
        new Promise<string>((resolve) => {
          liveInside = own.live;
          finish = () => resolve('done');
        }),
    );
    expect(gate.exclusiveRunning()).toBe(true);
    expect(liveInside()).toBe(true);
    await expect(held?.exclusively(() => Promise.resolve('again'))).resolves.toBe('busy');
    finish();
    await expect(running).resolves.toBe('done');
    expect(liveInside()).toBe(false);
    expect(gate.exclusiveRunning()).toBe(false);
  });

  it('completes a release asked for during exclusive work once that work settles', async () => {
    const gate = createPluginGate();
    const held = gate.claim([A], () => null);
    let finish: () => void = () => undefined;
    const running = held?.exclusively(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    held?.release();
    expect(holds(gate.getState(), A.key)).toBe(true);
    await expect(held?.exclusively(() => Promise.resolve('again'))).resolves.toBe('busy');
    finish();
    await running;
    expect(gate.getState()).toEqual(NO_CLAIMS);
    expect(gate.claim([B], () => null)).toBeDefined();
  });

  it('ends exclusive work that rejects, handing back its rejection, so a Claim may run again', async () => {
    const gate = createPluginGate();
    const held = gate.claim([A], (live) => ({ live }));
    let liveInside: () => boolean = () => false;
    const failure = new Error('Unable to store an asset: HTTP 500');
    const running = held?.exclusively((own) => {
      liveInside = own.live;
      return Promise.reject(failure);
    });
    expect(gate.exclusiveRunning()).toBe(true);
    await expect(running).rejects.toBe(failure);
    expect(liveInside()).toBe(false);
    expect(gate.exclusiveRunning()).toBe(false);
    expect(gate.withdraws()).toBe(false);
    held?.release();
    expect(gate.getState()).toEqual(NO_CLAIMS);
    expect(gate.claim([B], () => null)).toBeDefined();
  });

  it('refuses a second chain, and releases on unmount', () => {
    const gate = createPluginGate();
    const listener = vi.fn();
    gate.subscribe(listener);
    expect(gate.claim([A], () => null)).toBeDefined();
    expect(gate.claim([B], () => null)).toBeUndefined();
    gate.unmount(A.key);
    expect(gate.getState()).toEqual(NO_CLAIMS);
    expect(gate.claim([B], () => null)).toBeDefined();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('ends exclusive work’s commits when its surface unmounts, so only one run is ever live', async () => {
    const gate = createPluginGate();
    let firstLive: () => boolean = () => true;
    let finishFirst: () => void = () => undefined;
    const first = gate
      .claim([A], (live) => ({ live }))
      ?.exclusively(
        (own) =>
          new Promise<void>((resolve) => {
            firstLive = own.live;
            finishFirst = resolve;
          }),
      );
    expect(firstLive()).toBe(true);

    gate.unmount(A.key);
    expect(firstLive()).toBe(false);
    expect(gate.exclusiveRunning()).toBe(false);

    // A second surface may now run, and the first run's commits stay ended.
    let secondLive: () => boolean = () => false;
    let finishSecond: () => void = () => undefined;
    const second = gate
      .claim([B], (live) => ({ live }))
      ?.exclusively(
        (own) =>
          new Promise<void>((resolve) => {
            secondLive = own.live;
            finishSecond = resolve;
          }),
      );
    expect(secondLive()).toBe(true);
    expect(firstLive()).toBe(false);

    // The first run settling late does not end the second.
    finishFirst();
    await first;
    expect(gate.exclusiveRunning()).toBe(true);
    expect(secondLive()).toBe(true);
    finishSecond();
    await second;
    expect(gate.exclusiveRunning()).toBe(false);
  });

  it('keeps an unmounted surface’s run ended when the same surface claims and runs again', async () => {
    const gate = createPluginGate();
    let firstLive: () => boolean = () => true;
    let finishFirst: () => void = () => undefined;
    const first = gate
      .claim([A], (live) => ({ live }))
      ?.exclusively(
        (own) =>
          new Promise<void>((resolve) => {
            firstLive = own.live;
            finishFirst = resolve;
          }),
      );
    gate.unmount(A.key);
    let againLive: () => boolean = () => false;
    let finishAgain: () => void = () => undefined;
    const again = gate
      .claim([A], (live) => ({ live }))
      ?.exclusively(
        (own) =>
          new Promise<void>((resolve) => {
            againLive = own.live;
            finishAgain = resolve;
          }),
      );
    expect(againLive()).toBe(true);
    expect(firstLive()).toBe(false);
    finishFirst();
    await first;
    expect(againLive()).toBe(true);
    expect(gate.exclusiveRunning()).toBe(true);
    finishAgain();
    await again;
  });
});

describe('a plugin surface’s commits on the canvas', () => {
  const DOCUMENT: ResourceDocument = {
    title: 'Figure',
    kind: 'image',
    content: { url: 'https://example.com/a.png' },
  };
  const STORED = `/assets/${'C'.repeat(43)}` as const;
  const hostWith = (
    complete: PluginHost['complete'],
    epoch: { value: number } = { value: 0 },
    report: ObserverErrorReporter = () => undefined,
    assets: PluginHost['assets'] = {},
    capSizeHint?: PluginHost['capSizeHint'],
  ): PluginHost => {
    const gate = createPluginGate();
    return {
      gate,
      // As the canvas reads it: the chain the gate last published.
      get claims() {
        return gate.getState();
      },
      replacementEpoch: () => epoch.value,
      complete,
      report,
      document: (resourceId) => (resourceId === RESOURCE ? DOCUMENT : undefined),
      assets,
      capSizeHint,
    };
  };

  it('answers a settled Edit in the words every refusal is reported in', () => {
    expect(answerOf({ kind: 'completed' })).toBe('completed');
    expect(answerOf({ kind: 'unchanged' })).toBe('unchanged');
    expect(
      reasonOf(answerOf({ kind: 'refused', refusal: { code: 'map-content-invalid' } })),
    ).toMatch(/\S/u);
  });

  it('answers a queued Edit when it settles, and any other at once', async () => {
    let settle: Settle = () => undefined;
    const queued = completeAsAnswer(
      (told) => {
        settle = told;
        return { kind: 'queued' };
      },
      () => undefined,
    );
    settle({ kind: 'refused', refusal: { code: 'space-replaced' } });
    expect(reasonOf(await queued)).toMatch(/\S/u);
    await expect(
      completeAsAnswer(
        () => ({ kind: 'unchanged' }),
        () => undefined,
      ),
    ).resolves.toBe('unchanged');
  });

  it('offers nothing where the canvas may not author the Resource', () => {
    const host = hostWith(() => ({ kind: 'completed' }));
    const offered = (operations: PluginOperations) => [operations.commitMap, operations.claim];
    expect(
      offered(pluginSurfaceOperations('ur', RESOURCE, { ...FACTS, authorOnCanvas: false }, host)),
    ).toEqual([undefined, undefined]);
    expect(
      offered(pluginSurfaceOperations('ur', RESOURCE, { ...FACTS, editable: false }, host)),
    ).toEqual([undefined, undefined]);
    expect(pluginSurfaceOperations('ur', RESOURCE, FACTS, undefined)).toEqual({ kind: 'ur' });
  });

  it('commits Map content as one Edit, and refuses a commit kept past a replacement', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const epoch = { value: 3 };
    const operations = pluginSurfaceOperations('ur', RESOURCE, FACTS, hostWith(complete, epoch));
    await expect(operations.commitMap?.({ shape: 'pill' })).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      { kind: 'changed-map-content', resourceId: RESOURCE, content: { shape: 'pill' } },
      expect.any(Function),
    );
    epoch.value = 4;
    expect(reasonOf(await operations.commitMap?.({ shape: 'ellipse' }))).toMatch(/\S/u);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('commits a Title as one Edit of the document as it stands, and refuses one whose Resource is gone', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const host = hostWith(complete);
    const operations = pluginSurfaceOperations('image', RESOURCE, FACTS, host);
    await expect(operations.commitTitle?.('Harbour')).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      {
        kind: 'edited-resource',
        resourceId: RESOURCE,
        document: { ...DOCUMENT, title: 'Harbour' },
      },
      expect.any(Function),
    );
    const gone = pluginSurfaceOperations(
      'image',
      uuidSchema.parse('00000000-0000-4000-8000-0000000000a3'),
      FACTS,
      host,
    );
    expect(reasonOf(await gone.commitTitle?.('Harbour'))).toMatch(/\S/u);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('commits content as one changed-content Edit', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'unchanged' }));
    const operations = pluginSurfaceOperations('image', RESOURCE, FACTS, hostWith(complete));
    await expect(operations.commitContent?.({ url: 'https://example.com/b.png' })).resolves.toBe(
      'unchanged',
    );
    expect(complete).toHaveBeenCalledWith(
      {
        kind: 'changed-content',
        resourceId: RESOURCE,
        content: { url: 'https://example.com/b.png' },
      },
      expect.any(Function),
    );
  });

  it('offers the store and picker only where the canvas offers them', () => {
    const operations = pluginSurfaceOperations('image', RESOURCE, FACTS, hostWith(vi.fn()));
    expect(operations.commitStore).toBeUndefined();
    expect(operations.pick).toBeUndefined();
  });

  it('stores and picks while no exclusive work runs, and stores only for that work while it does', async () => {
    const store = vi.fn(() => Promise.resolve(STORED));
    const pick = vi.fn(() => Promise.resolve([new File(['x'], 'x.png')]));
    const host = hostWith(vi.fn(), undefined, undefined, { store, pick });
    const operations = pluginSurfaceOperations('image', RESOURCE, FACTS, host);
    await expect(operations.commitStore?.(new Blob(['a']))).resolves.toBe(STORED);
    await expect(operations.pick?.('image/png')).resolves.toHaveLength(1);
    const held = operations.claim?.(Symbol('drawing'));
    let ownStore: ((bytes: Blob) => Promise<StoreAnswer>) | undefined;
    let finish: () => void = () => undefined;
    const work = held?.exclusively(
      (own) =>
        new Promise<void>((resolve) => {
          ownStore = own.store;
          finish = resolve;
        }),
    );
    expect(refusalOf(await operations.commitStore?.(new Blob(['b'])))).toMatch(/\S/u);
    await expect(operations.pick?.('image/png')).resolves.toEqual([]);
    await expect(ownStore?.(new Blob(['c']))).resolves.toBe(STORED);
    finish();
    await work;
    expect(refusalOf(await ownStore?.(new Blob(['d'])))).toMatch(/\S/u);
    expect(store).toHaveBeenCalledTimes(2);
    expect(pick).toHaveBeenCalledTimes(1);
    held?.release();
  });

  it('carries a size hint capped at what the canvas shows, and drops one it cannot cap', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const capped = pluginSurfaceOperations(
      'markdown',
      RESOURCE,
      FACTS,
      hostWith(complete, { value: 0 }, undefined, undefined, (hint) => ({
        width: Math.min(hint.width, 800),
        height: Math.min(hint.height, 600),
      })),
    );
    await capped.commitMap?.({ open: true }, { sizeHint: { width: 640, height: 2000 } });
    expect(complete).toHaveBeenLastCalledWith(
      {
        kind: 'changed-map-content',
        resourceId: RESOURCE,
        content: { open: true },
        size: { width: 640, height: 600 },
      },
      expect.any(Function),
    );
    const uncapped = pluginSurfaceOperations('markdown', RESOURCE, FACTS, hostWith(complete));
    await uncapped.commitMap?.({ open: true }, { sizeHint: { width: 640, height: 2000 } });
    expect(complete).toHaveBeenLastCalledWith(
      { kind: 'changed-map-content', resourceId: RESOURCE, content: { open: true } },
      expect.any(Function),
    );
  });

  it('withdraws every plain commit while exclusive work runs, and keeps that work’s own live', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const host = hostWith(complete);
    const operations = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    const other = pluginSurfaceOperations(
      'ur',
      uuidSchema.parse('00000000-0000-4000-8000-0000000000a2'),
      FACTS,
      host,
    );
    const held = operations.claim?.(Symbol('drawing'));
    expect(held).toBeDefined();
    let ownMap: ((next: { shape: string }) => Promise<Answer>) | undefined;
    let finish: () => void = () => undefined;
    const work = held?.exclusively(
      (own) =>
        new Promise<void>((resolve) => {
          ownMap = own.map;
          finish = resolve;
        }),
    );
    expect(reasonOf(await other.commitMap?.({ shape: 'pill' }))).toMatch(/\S/u);
    await expect(ownMap?.({ shape: 'pill' })).resolves.toBe('completed');
    finish();
    await work;
    expect(reasonOf(await ownMap?.({ shape: 'diamond' }))).toMatch(/\S/u);
    expect(complete).toHaveBeenCalledTimes(1);
    held?.unmount();
    expect(host.gate.getState()).toEqual(NO_CLAIMS);
  });

  it('completes a surface’s release asked for during its exclusive work once the work settles', async () => {
    const host = hostWith(() => ({ kind: 'completed' }));
    const operations = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    const drawing = Symbol('drawing');
    const held = operations.claim?.(drawing);
    let finish: () => void = () => undefined;
    const work = held?.exclusively(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    held?.release();
    expect(operations.claimHolder?.(drawing)).toBe('this-drawing');
    finish();
    await work;
    expect(operations.claimHolder?.(drawing)).toBe('none');
    expect(host.gate.getState()).toEqual(NO_CLAIMS);
  });

  it('answers refused, and reports, when the Edit throws', async () => {
    const report = vi.fn();
    const broke = new Error('derivation broke');
    const answer = await completeAsAnswer(() => {
      throw broke;
    }, report);
    expect(reasonOf(answer)).toMatch(/\S/u);
    expect(report).toHaveBeenCalledWith(broke);
  });

  it('commits the exclusive work’s own Edits through the gate’s admission, and no plain one', async () => {
    const admitted: boolean[] = [];
    const host = hostWith((): AuthoringResult => {
      admitted.push(!host.gate.withdraws());
      return { kind: 'completed' };
    });
    const operations = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    let ownMap: ((next: { shape: string }) => Promise<Answer>) | undefined;
    let finish: () => void = () => undefined;
    const work = operations.claim?.(Symbol('drawing'))?.exclusively(
      (own) =>
        new Promise<void>((resolve) => {
          ownMap = own.map;
          finish = resolve;
        }),
    );
    await expect(ownMap?.({ shape: 'pill' })).resolves.toBe('completed');
    expect(admitted).toEqual([true]);
    finish();
    await work;
  });

  it('offers no commit and no Claim while exclusive work runs, and says the surface is withdrawn', () => {
    const host = hostWith(() => ({ kind: 'completed' }));
    const running = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    void running.claim?.(Symbol('drawing'))?.exclusively(() => new Promise<void>(() => undefined));
    const other = pluginSurfaceOperations(
      'ur',
      uuidSchema.parse('00000000-0000-4000-8000-0000000000a2'),
      FACTS,
      host,
    );
    expect(other.commitMap).toBeUndefined();
    expect(other.claim).toBeUndefined();
    expect(other.withdrawn).toBe(true);
  });

  it('offers another Resource nothing while one holds a Claim, and another drawing of the held Resource no Claim', () => {
    const host = hostWith(() => ({ kind: 'completed' }));
    const drawing = Symbol('drawing');
    const held = pluginSurfaceOperations('markdown', RESOURCE, FACTS, host).claim?.(drawing);
    expect(held).toBeDefined();
    const OTHER = uuidSchema.parse('00000000-0000-4000-8000-0000000000a3');
    const other = pluginSurfaceOperations('markdown', OTHER, FACTS, host);
    expect(other.commitMap).toBeUndefined();
    expect(other.claim).toBeUndefined();
    const again = pluginSurfaceOperations('markdown', RESOURCE, FACTS, host);
    expect(again.commitContent).toBeTypeOf('function');
    expect(again.claimHolder?.(drawing)).toBe('this-drawing');
    const second = Symbol('second drawing');
    expect(again.claimHolder?.(second)).toBe('another-drawing');
    expect(again.claim?.(second)).toBeUndefined();
    held?.release();
    expect(pluginSurfaceOperations('markdown', OTHER, FACTS, host).commitMap).toBeTypeOf(
      'function',
    );
  });

  /** An asset store recording what it stored, and a picker answering one file. */
  const recordingAssets = () => {
    const stored: Blob[] = [];
    const picked = [new File(['x'], 'x.txt')];
    const assets: NonNullable<PluginHost['assets']> = {
      store: (bytes) => {
        stored.push(bytes);
        return Promise.resolve(`/assets/${'A'.repeat(43)}` as const);
      },
      pick: () => Promise.resolve(picked),
    };
    return { assets, stored, picked };
  };

  it('offers the asset store and the picker where it offers commits, and neither elsewhere', async () => {
    const { assets, stored, picked } = recordingAssets();
    const host = Object.assign(
      hostWith(() => ({ kind: 'completed' })),
      { assets },
    );
    const operations = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);

    await expect(operations.commitStore?.(new Blob(['a']))).resolves.toBe(
      `/assets/${'A'.repeat(43)}`,
    );
    await expect(operations.pick?.('*/*')).resolves.toEqual(picked);
    expect(stored).toHaveLength(1);
    const bare = pluginSurfaceOperations('ur', RESOURCE, { ...FACTS, editable: false }, host);
    expect([bare.commitStore, bare.pick]).toEqual([undefined, undefined]);
  });

  it('withdraws storing and picking while exclusive work runs, and keeps that work’s own store live', async () => {
    const { assets, stored } = recordingAssets();
    const host = Object.assign(
      hostWith(() => ({ kind: 'completed' })),
      { assets },
    );
    const operations = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    const kept = pluginSurfaceOperations(
      'ur',
      uuidSchema.parse('00000000-0000-4000-8000-0000000000a2'),
      FACTS,
      host,
    );
    const held = operations.claim?.(Symbol('drawing'));
    let ownStore: PluginOperations['commitStore'];
    let finish: () => void = () => undefined;
    const work = held?.exclusively(
      (own) =>
        new Promise<void>((resolve) => {
          ownStore = own.store;
          finish = resolve;
        }),
    );

    const during = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    expect([during.commitStore, during.pick]).toEqual([undefined, undefined]);
    await expect(kept.commitStore?.(new Blob(['kept']))).resolves.toHaveProperty('refused');
    await expect(kept.pick?.('*/*')).resolves.toEqual([]);
    await expect(ownStore?.(new Blob(['own']))).resolves.toBe(`/assets/${'A'.repeat(43)}`);
    expect(stored).toHaveLength(1);

    finish();
    await work;
    await expect(ownStore?.(new Blob(['late']))).resolves.toHaveProperty('refused');
    expect(stored).toHaveLength(1);
  });

  it('says which drawing holds a Claim, and reports what its plugin throws while drawing', () => {
    const report = vi.fn();
    const host = hostWith(() => ({ kind: 'completed' }), { value: 2 }, report);
    const drawing = Symbol('drawing');
    const elsewhere = Symbol('elsewhere');
    expect(pluginSurfaceOperations('ur', RESOURCE, FACTS, host).claimHolder?.(drawing)).toBe(
      'none',
    );
    pluginSurfaceOperations('ur', RESOURCE, FACTS, host).claim?.(drawing);
    const held = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    expect(held.claimHolder?.(drawing)).toBe('this-drawing');
    expect(held.claimHolder?.(elsewhere)).toBe('another-drawing');
    expect(held.epoch).toBe(2);
    const thrown = new Error('drawing broke');
    held.onFailure?.(thrown);
    expect(report).toHaveBeenCalledWith(thrown);
    // A surface that may not be authored still reports what it throws.
    const bare = pluginSurfaceOperations('ur', RESOURCE, { ...FACTS, editable: false }, host);
    bare.onFailure?.(thrown);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('grants one Claim across two drawings of one Resource, which unmounting the other keeps', () => {
    const host = hostWith(() => ({ kind: 'completed' }));
    const first = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    const second = pluginSurfaceOperations('ur', RESOURCE, FACTS, host);
    const firstDrawing = Symbol('first');
    const secondDrawing = Symbol('second');
    const held = first.claim?.(firstDrawing);
    expect(held).toBeDefined();
    expect(second.claim?.(secondDrawing)).toBeUndefined();
    expect(second.claimHolder?.(secondDrawing)).toBe('another-drawing');
    expect(first.claimHolder?.(firstDrawing)).toBe('this-drawing');
    host.gate.unmount(secondDrawing);
    expect(first.claimHolder?.(firstDrawing)).toBe('this-drawing');
    held?.unmount();
    expect(second.claimHolder?.(secondDrawing)).toBe('none');
  });
});
