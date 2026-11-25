import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { MapEmbedRequest } from '@project/ui';
import type { EmbeddedTargetReader } from '../src/map-embedding/map-embedding';
import {
  useCanvasMapEmbedding,
  useDrawnMapEmbeddings,
} from '../src/map-embedding/map-embedding-view';
import { manualSchedule } from './manual-schedule';

const SPACE_RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000f1');
const TARGET = uuidSchema.parse('00000000-0000-4000-8000-0000000000f2');
const TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000f3');
const TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-0000000000f4');

const claimed: MapEmbedRequest = {
  space: TARGET,
  view: { map: TARGET_MAP, graph: TARGET_GRAPH },
  select: undefined,
  claim: { release: () => undefined },
};

const NO_NODES = [] as const;
const { schedule } = manualSchedule();
const NO_DRAG: ReadonlySet<string> = new Set();

const gate = () => {
  const given = vi.fn();
  return {
    given,
    lend: vi.fn((drawing: symbol) => () => {
      given(drawing);
    }),
  };
};

const reader = (): EmbeddedTargetReader & {
  readonly held: () => number;
  readonly released: () => number;
} => {
  let held = 0;
  let released = 0;
  return {
    getState: () => ({ composed: [] }),
    subscribe: () => () => undefined,
    hold: () => {
      held += 1;
      return Promise.resolve({
        release: () => {
          released += 1;
          return Promise.resolve();
        },
      });
    },
    held: () => held,
    released: () => released,
  };
};

describe('the Map embedding a canvas draws with', () => {
  it('lends a Claim through the gate the canvas draws with now, not the one it mounted with', () => {
    const first = gate();
    const second = gate();
    const { result, rerender } = renderHook(
      ({ claims }) =>
        useCanvasMapEmbedding({ spaces: null, claims, select: () => undefined, schedule }),
      { initialProps: { claims: first } },
    );
    rerender({ claims: second });

    const drawing = Symbol('drawing');
    result.current.embeddings.publish('node', SPACE_RESOURCE, claimed, drawing);
    result.current.drawn({ nodeIds: ['node'], requests: [] });

    expect(first.lend).not.toHaveBeenCalled();
    expect(second.lend).toHaveBeenCalledWith(drawing);
  });

  it('selects on Done through the selection the canvas draws with now', () => {
    const first = vi.fn();
    const second = vi.fn();
    const claims = gate();
    const { result, rerender } = renderHook(
      ({ select }) => useCanvasMapEmbedding({ spaces: null, claims, select, schedule }),
      { initialProps: { select: first } },
    );
    const drawing = Symbol('drawing');
    result.current.embeddings.publish('node', SPACE_RESOURCE, claimed, drawing);
    result.current.drawn({ nodeIds: ['node'], requests: [] });
    rerender({ select: second });

    result.current.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      { ...claimed, claim: undefined },
      drawing,
    );
    result.current.drawn({ nodeIds: ['node'], requests: [] });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(SPACE_RESOURCE);
  });

  it('gives a Claim lent mid-Edit back to the gate it came from, and lends it through the new one', () => {
    const first = gate();
    const second = gate();
    const { result, rerender } = renderHook(
      ({ claims }) =>
        useCanvasMapEmbedding({ spaces: null, claims, select: () => undefined, schedule }),
      { initialProps: { claims: first } },
    );
    const drawing = Symbol('drawing');
    result.current.embeddings.publish('node', SPACE_RESOURCE, claimed, drawing);
    result.current.drawn({ nodeIds: ['node'], requests: [] });

    rerender({ claims: second });

    expect(first.given).toHaveBeenCalledWith(drawing);
    expect(second.lend).toHaveBeenCalledWith(drawing);
  });

  it('keeps its embeddings on other Open Spaces, reading their Spaces from the new ones', async () => {
    const first = reader();
    const second = reader();
    const claims = gate();
    const { result, rerender } = renderHook(
      ({ spaces }) => useCanvasMapEmbedding({ spaces, claims, select: () => undefined, schedule }),
      { initialProps: { spaces: first } },
    );
    const before = result.current;
    const drawing = Symbol('drawing');
    before.embeddings.publish('node', SPACE_RESOURCE, claimed, drawing);
    const lifetime = before.embeddings.getState().get('node')?.lifetime;
    if (lifetime === undefined) throw new Error('nothing is embedded at node');
    before.setNotice('node', 'Link copied.', lifetime);
    before.drawn({
      nodeIds: ['node'],
      requests: [
        { parent: { id: 'node' }, spaceId: TARGET, mapId: TARGET_MAP, graphId: TARGET_GRAPH },
      ],
    });
    await vi.waitFor(() => {
      expect(first.held()).toBe(1);
    });

    rerender({ spaces: second });

    expect(result.current).toBe(before);
    expect(before.getState().embeds.has('node')).toBe(true);
    expect(before.getState().notices.get('node')).toBe('Link copied.');
    await vi.waitFor(() => {
      expect(first.released()).toBe(1);
      expect(second.held()).toBe(1);
    });
  });

  it('does not discover again for a framing draft', () => {
    // A pan publishes a draft on every move; what is drawn does not change.
    const claims = gate();
    const { result } = renderHook(() => {
      const embedding = useCanvasMapEmbedding({
        spaces: null,
        claims,
        select: () => undefined,
        schedule,
      });
      return {
        embedding,
        drawn: useDrawnMapEmbeddings(embedding, {
          nodes: NO_NODES,
          dragging: NO_DRAG,
          root: { spaceId: TARGET, mapId: TARGET_MAP, policy: 'authoring' },
          ready: true,
        }),
      };
    });
    const before = result.current.drawn.requests;

    act(() => {
      result.current.embedding.draft('node', { centreX: 1, centreY: 2, zoom: 3 });
    });

    expect(result.current.embedding.getState().drafts.has('node')).toBe(true);
    expect(result.current.drawn.requests).toBe(before);
  });
});
