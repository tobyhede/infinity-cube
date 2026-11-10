import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { uuidSchema } from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import {
  beginExclusive,
  claim,
  deepest,
  endExclusive,
  holds,
  NO_CLAIMS,
  release,
  unmount,
  type ClaimChain,
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

describe('the Claim chain (ADR 0142)', () => {
  it('grants a first Claim to any surface, and a later one only inside the deepest', () => {
    const outer = claim(NO_CLAIMS, ['a']);
    expect(outer).toEqual({ holders: [['a']], exclusive: null });
    if (outer === undefined) return;
    expect(claim(outer, ['b'])).toBeUndefined();
    expect(claim(outer, ['a'])).toBe(outer);
    const inner = claim(outer, ['a', 'b']);
    expect(inner?.holders).toEqual([['a'], ['a', 'b']]);
    if (inner === undefined) return;
    expect(deepest(inner)).toBe('b');
    expect(claim(inner, ['a', 'c'])).toBeUndefined();
  });

  it('releases only the deepest Claim, returning to the one outside it', () => {
    const chain: ClaimChain = { holders: [['a'], ['a', 'b']], exclusive: null };
    expect(release(chain, 'a')).toBeUndefined();
    expect(release(chain, 'b')).toEqual({ holders: [['a']], exclusive: null });
  });

  it('releases a surface and every Claim inside it when it unmounts, ending their work', () => {
    const chain: ClaimChain = { holders: [['a'], ['a', 'b'], ['a', 'b', 'c']], exclusive: 'c' };
    expect(unmount(chain, 'b')).toEqual({ holders: [['a']], exclusive: null });
    expect(unmount(chain, 'z')).toBe(chain);
  });

  it('runs exclusive work one at a time, for a holder, and grants nothing while it runs', () => {
    const held: ClaimChain = { holders: [['a'], ['a', 'b']], exclusive: null };
    expect(beginExclusive(NO_CLAIMS, 'a')).toBe('not-held');
    const running = beginExclusive(held, 'b');
    expect(running).toEqual({ ...held, exclusive: 'b' });
    if (running === 'busy' || running === 'not-held') return;
    expect(beginExclusive(running, 'a')).toBe('busy');
    expect(claim(running, ['a', 'b', 'c'])).toBeUndefined();
    expect(release(running, 'b')).toBeUndefined();
    expect(endExclusive(running, 'b')).toEqual(held);
  });

  it('keeps every chain a run of surfaces each embedded in the one before', () => {
    const step = fc.oneof(
      fc.record({
        kind: fc.constant('claim' as const),
        path: fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 3 }),
      }),
      fc.record({ kind: fc.constant('release' as const), surface: fc.constantFrom('a', 'b', 'c') }),
      fc.record({ kind: fc.constant('unmount' as const), surface: fc.constantFrom('a', 'b', 'c') }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 20 }), (steps) => {
        let chain = NO_CLAIMS;
        for (const next of steps) {
          if (next.kind === 'claim') chain = claim(chain, next.path) ?? chain;
          else if (next.kind === 'release') chain = release(chain, next.surface) ?? chain;
          else chain = unmount(chain, next.surface);
          chain.holders.forEach((path, index) => {
            const outer = chain.holders[index - 1];
            if (outer === undefined) return;
            expect(path.slice(0, outer.length)).toEqual(outer);
            expect(path.length).toBeGreaterThan(outer.length);
          });
          if (chain.exclusive !== null) expect(holds(chain, chain.exclusive)).toBe(true);
        }
      }),
    );
  });
});

describe('the plugin gate', () => {
  it('answers busy to exclusive work while other work runs, and withdraws the gate after', async () => {
    const gate = createPluginGate();
    const held = gate.claim(['a'], (live) => ({ live }));
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
    expect(gate.claim(['a'], () => null)).toBeDefined();
    expect(gate.claim(['b'], () => null)).toBeUndefined();
    gate.unmount('a');
    expect(gate.getState()).toEqual(NO_CLAIMS);
    expect(gate.claim(['b'], () => null)).toBeDefined();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('a plugin surface’s commits on the canvas', () => {
  const hostWith = (
    complete: PluginHost['complete'],
    epoch: { value: number } = { value: 0 },
  ): PluginHost => ({ gate: createPluginGate(), replacementEpoch: () => epoch.value, complete });

  it('answers a settled Edit in the words every refusal is reported in', () => {
    expect(answerOf({ kind: 'completed' })).toBe('completed');
    expect(answerOf({ kind: 'unchanged' })).toBe('unchanged');
    expect(
      reasonOf(answerOf({ kind: 'refused', refusal: { code: 'map-content-invalid' } })),
    ).toMatch(/\S/u);
  });

  it('answers a queued Edit when it settles, and any other at once', async () => {
    let settle: Settle = () => undefined;
    const queued = completeAsAnswer((told) => {
      settle = told;
      return { kind: 'queued' };
    });
    settle({ kind: 'refused', refusal: { code: 'space-replaced' } });
    expect(reasonOf(await queued)).toMatch(/\S/u);
    await expect(completeAsAnswer(() => ({ kind: 'unchanged' }))).resolves.toBe('unchanged');
  });

  it('offers nothing where the canvas may not author the Resource', () => {
    const host = hostWith(() => ({ kind: 'completed' }));
    expect(
      pluginSurfaceOperations('ur', RESOURCE, { ...FACTS, authorOnCanvas: false }, host),
    ).toEqual({ kind: 'ur' });
    expect(pluginSurfaceOperations('ur', RESOURCE, { ...FACTS, editable: false }, host)).toEqual({
      kind: 'ur',
    });
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
    const held = operations.claim?.();
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
});
