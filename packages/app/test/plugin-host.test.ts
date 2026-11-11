import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { uuidSchema } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { Answer } from '@project/resource-api/domain';
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
    expect(outer).toEqual({ holders: [[A]], exclusive: null });
    if (outer === undefined) return;
    expect(claim(outer, [B])).toBeUndefined();
    expect(claim(outer, [A])).toBe(outer);
    const inner = claim(outer, [A, B]);
    expect(inner?.holders).toEqual([[A], [A, B]]);
    if (inner === undefined) return;
    expect(deepest(inner)).toBe(B.key);
    expect(claim(inner, [A, C])).toBeUndefined();
  });

  it('releases only the deepest Claim, returning to the one outside it', () => {
    const chain: ClaimChain = { holders: [[A], [A, B]], exclusive: null };
    expect(release(chain, A.key)).toBeUndefined();
    expect(release(chain, B.key)).toEqual({ holders: [[A]], exclusive: null });
  });

  it('releases a drawing and every Claim inside it when it unmounts, ending their work', () => {
    const chain: ClaimChain = { holders: [[A], [A, B], [A, B, C]], exclusive: C.key };
    expect(unmount(chain, B.key)).toEqual({ holders: [[A]], exclusive: null });
    expect(unmount(chain, Symbol('z'))).toBe(chain);
  });

  it('runs exclusive work one at a time, for a holder, and grants nothing while it runs', () => {
    const held: ClaimChain = { holders: [[A], [A, B]], exclusive: null };
    expect(beginExclusive(NO_CLAIMS, A.key)).toBe('not-held');
    const running = beginExclusive(held, B.key);
    expect(running).toEqual({ ...held, exclusive: B.key });
    if (running === 'busy' || running === 'not-held') return;
    expect(beginExclusive(running, A.key)).toBe('busy');
    expect(claim(running, [A, B, C])).toBeUndefined();
    expect(release(running, B.key)).toBeUndefined();
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
    expect(release(held, second.key)).toBeUndefined();
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
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 20 }), (steps) => {
        let chain = NO_CLAIMS;
        for (const next of steps) {
          if (next.kind === 'claim') chain = claim(chain, next.embedding) ?? chain;
          else if (next.kind === 'release') chain = release(chain, next.drawing.key) ?? chain;
          else chain = unmount(chain, next.drawing.key);
          chain.holders.forEach((embedding, index) => {
            const outer = chain.holders[index - 1];
            if (outer === undefined) return;
            expect(embedding.slice(0, outer.length)).toEqual(outer);
            expect(embedding.length).toBeGreaterThan(outer.length);
          });
          if (chain.exclusive !== null) expect(holds(chain, chain.exclusive)).toBe(true);
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
  const hostWith = (
    complete: PluginHost['complete'],
    epoch: { value: number } = { value: 0 },
    report: ObserverErrorReporter = () => undefined,
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
