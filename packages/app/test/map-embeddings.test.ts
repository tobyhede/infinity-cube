import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { MapEmbedRequest } from '@project/ui';
import { createMapEmbeddings, editingMapEmbeds, ownMapEmbed } from '../src/map-embeddings';

const SPACE_RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000e1');
const TARGET = uuidSchema.parse('00000000-0000-4000-8000-0000000000e2');

const request = (
  commit?: NonNullable<MapEmbedRequest['select']>['commit'],
  claimed = false,
): MapEmbedRequest => ({
  view: { spaceId: TARGET, map: TARGET, graph: TARGET },
  select:
    commit === undefined
      ? undefined
      : { value: { spaceId: TARGET, map: TARGET, graph: TARGET }, commit },
  claim: claimed ? { release: () => undefined } : undefined,
});

describe('the Map embeddings drawn on one canvas', () => {
  it('tells every listener of a publication although one of them throws', () => {
    const report = vi.fn();
    const embeddings = createMapEmbeddings(report);
    const failure = new Error('listener failed');
    const after = vi.fn();
    embeddings.subscribe(() => {
      throw failure;
    });
    embeddings.subscribe(after);

    embeddings.publish('node', SPACE_RESOURCE, request(), Symbol('drawing'));

    expect(after).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(failure);
  });

  it('keeps a withdrawn embedding’s latest commit until it is forgotten', async () => {
    const embeddings = createMapEmbeddings();
    const commit = vi.fn(() => Promise.resolve('completed' as const));
    const drawing = Symbol('drawing');
    embeddings.publish('node', SPACE_RESOURCE, request(commit), drawing);
    const stored = embeddings.getState().get('node')?.request.select?.commit;
    embeddings.publish('node', SPACE_RESOURCE, null, drawing);

    // A framing pending when the embedding was taken down still lands.
    await stored?.({ spaceId: TARGET, map: TARGET, graph: TARGET });
    expect(commit).toHaveBeenCalledOnce();

    embeddings.forget('node');
    await expect(stored?.({ spaceId: TARGET, map: TARGET, graph: TARGET })).resolves.toEqual({
      refused: 'This choice is no longer offered.',
    });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('keeps a drawn embedding’s commit when its placement is forgotten', async () => {
    const embeddings = createMapEmbeddings();
    const commit = vi.fn(() => Promise.resolve('completed' as const));
    embeddings.publish('node', SPACE_RESOURCE, request(commit), Symbol('drawing'));
    embeddings.forget('node');
    const stored = embeddings.getState().get('node')?.request.select?.commit;
    await stored?.({ spaceId: TARGET, map: TARGET, graph: TARGET });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('keeps two drawings of one Space Resource apart, each by its placement and drawing', () => {
    const embeddings = createMapEmbeddings();
    const first = Symbol('first drawing');
    const second = Symbol('second drawing');
    embeddings.publish('first-node', SPACE_RESOURCE, request(undefined, false), first);
    embeddings.publish('second-node', SPACE_RESOURCE, request(undefined, true), second);
    const embeds = embeddings.getState();

    expect(ownMapEmbed(embeds, 'first-node')?.drawing).toBe(first);
    expect(ownMapEmbed(embeds, 'second-node')?.drawing).toBe(second);
    // Only the drawing that passed its Claim authors its Map in place.
    expect([...editingMapEmbeds(embeds)]).toEqual(['second-node']);
  });
});
