// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { bareKindData, type ResourceFlowNode } from '@project/react-flow-adapter';
import type { MapEmbedEntry } from '../src/map-embeddings';
import { createOpenSpaces, type OpenSpace } from '../src/open-spaces';
import { CANVAS } from '../src/space-authoring';
import type { SpaceResourceFraming } from '../src/space-resource-framing';
import {
  useEmbeddedOpenSpaceResources,
  type EmbeddedTargetReader,
} from '../src/use-embedded-open-space-resources';
import { recordingHistory } from './browser-history';
import { refusingFullscreen } from './fullscreen';
import { unlinkedPresentations } from './presentations';
import { fixtureFacts } from './render-adapter-fixtures';
import { publishedEmbeds } from './published-embeds';

/** No gesture in flight: the lean is a drag's, and these tests run none. */
const NO_DRAG: ReadonlySet<string> = new Set();

const id = (value: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`);

const HOST = id(1);
const TARGET = id(2);
const MAP = id(3);
const OTHER_MAP = id(6);
const GRAPH = id(7);
const HOST_MAP = id(8);
const HOST_GRAPH = id(9);

/** What a plugin publishes when it passes `<Embed space>` no view: the Space's own `defaultMap`. */
const viewlessEmbed = (nodes: readonly ResourceFlowNode[]): ReadonlyMap<string, MapEmbedEntry> =>
  new Map(
    nodes.map((node): [string, MapEmbedEntry] => [
      node.id,
      {
        resourceId: node.data.resourceId,
        drawing: Symbol(node.id),
        request: { space: TARGET, view: undefined, select: undefined, claim: undefined },
      },
    ]),
  );

const spaceResource = (resourceId: typeof HOST, mapId: typeof MAP): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: { x: 100, y: 200 },
  width: 700,
  height: 500,
  data: {
    shape: 'rectangle',
    resourceId,
    title: 'Elsewhere',
    readOnly: false,
    ...bareKindData('space'),
    ...fixtureFacts('space', true, '', { spaceId: TARGET, map: mapId }),
    selectedForAuthoring: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    borderColor: null,
    receding: false,
  },
});

const reader = (
  embed: (spaceId: typeof TARGET) => Promise<OpenSpace | undefined>,
  entries: readonly OpenSpace[] = [],
): EmbeddedTargetReader => ({
  getState: () => ({ composed: entries }),
  subscribe: () => () => undefined,
  hold: async (spaceId) => {
    await embed(spaceId);
    return { release: () => Promise.resolve() };
  },
});

describe('useEmbeddedOpenSpaceResources', () => {
  it('asks for each visible embedding once, and again only when the Map changes', async () => {
    const asked: (typeof TARGET)[] = [];
    const spaces = reader((spaceId) => {
      asked.push(spaceId);
      return Promise.resolve(undefined);
    });
    const { rerender } = renderHook(
      ({ nodes }) =>
        useEmbeddedOpenSpaceResources(nodes, publishedEmbeds(nodes), spaces, NO_DRAG, {
          spaceId: HOST,
          mapId: OTHER_MAP,
          policy: 'authoring',
        }),
      {
        initialProps: { nodes: [spaceResource(HOST, MAP)] },
      },
    );
    await waitFor(() => expect(asked).toEqual([TARGET]));
    rerender({ nodes: [spaceResource(HOST, MAP)] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(asked).toEqual([TARGET]);
    rerender({ nodes: [spaceResource(HOST, OTHER_MAP)] });
    await waitFor(() => expect(asked).toEqual([TARGET, TARGET]));
  });

  it('releases a drawing that closes before its target finishes loading', async () => {
    let finish: (() => void) | undefined;
    let released = 0;
    const composed: readonly OpenSpace[] = [];
    const spaces: EmbeddedTargetReader = {
      getState: () => ({ composed }),
      subscribe: () => () => undefined,
      hold: async () => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return {
          release: () => {
            released += 1;
            return Promise.resolve();
          },
        };
      },
    };
    const { rerender } = renderHook(
      ({ nodes }) =>
        useEmbeddedOpenSpaceResources(nodes, publishedEmbeds(nodes), spaces, NO_DRAG, {
          spaceId: HOST,
          mapId: OTHER_MAP,
          policy: 'authoring',
        }),
      { initialProps: { nodes: [spaceResource(HOST, MAP)] } },
    );
    rerender({ nodes: [] });
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    expect(released).toBe(1);
  });

  it('surfaces a failed read keyed by the target Space and clears it on resume', async () => {
    let fail = true;
    const spaces = reader(() => {
      if (fail) return Promise.reject(new Error('Target missing'));
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceResources(
        [spaceResource(HOST, MAP)],
        publishedEmbeds([spaceResource(HOST, MAP)]),
        spaces,
        NO_DRAG,
        {
          spaceId: HOST,
          mapId: OTHER_MAP,
          policy: 'authoring',
        },
      ),
    );
    await waitFor(() => expect(result.current.embeddedFailures.get(TARGET)).toBe('Target missing'));
    fail = false;
    await act(async () => {
      await result.current.resumeEmbedded(TARGET);
    });
    expect(result.current.embeddedFailures.has(TARGET)).toBe(false);
  });

  it('drops a failure whose embedding is no longer standing', async () => {
    const spaces = reader(() => Promise.reject(new Error('Target missing')));
    const { result, rerender } = renderHook(
      ({ nodes }) =>
        useEmbeddedOpenSpaceResources(nodes, publishedEmbeds(nodes), spaces, NO_DRAG, {
          spaceId: HOST,
          mapId: OTHER_MAP,
          policy: 'authoring',
        }),
      { initialProps: { nodes: [spaceResource(HOST, MAP)] } },
    );
    await waitFor(() => expect(result.current.embeddedFailures.get(TARGET)).toBe('Target missing'));
    rerender({ nodes: [] });
    expect(result.current.embeddedFailures.has(TARGET)).toBe(false);
  });

  it('measures the title footer into embed bounds', async () => {
    const spaces = reader(() => Promise.resolve(undefined));
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceResources(
        [spaceResource(HOST, MAP)],
        publishedEmbeds([spaceResource(HOST, MAP)]),
        spaces,
        NO_DRAG,
        {
          spaceId: HOST,
          mapId: OTHER_MAP,
          policy: 'authoring',
        },
      ),
    );
    await waitFor(() => expect(result.current.embeddedRequests).toHaveLength(1));
    expect(result.current.embeddedRequests[0]?.bounds.bottom).toBe(396);
    act(() => {
      result.current.reportBodyHeight(HOST, 40);
    });
    expect(result.current.embeddedRequests[0]?.bounds.bottom).toBe(456);
  });

  it('counts a Resource as editing its portal while its plugin passes a Claim to the embedding', async () => {
    const spaces = reader(() => Promise.resolve(undefined));
    const nodes = [spaceResource(HOST, MAP)];
    const { result, rerender } = renderHook(
      ({ claimed }) =>
        useEmbeddedOpenSpaceResources(nodes, publishedEmbeds(nodes, claimed), spaces, NO_DRAG, {
          spaceId: HOST,
          mapId: OTHER_MAP,
          policy: 'authoring',
        }),
      { initialProps: { claimed: new Set<string>() } },
    );
    await waitFor(() => expect(result.current.embeddedRequests).toHaveLength(1));
    expect(result.current.editingPortals.has(HOST)).toBe(false);
    rerender({ claimed: new Set([HOST]) });
    expect(result.current.editingPortals.has(HOST)).toBe(true);
    rerender({ claimed: new Set() });
    expect(result.current.editingPortals.has(HOST)).toBe(false);
  });

  it('owns the in-flight framing draft', async () => {
    const spaces = reader(() => Promise.resolve(undefined));
    const nodes = [spaceResource(HOST, MAP)];
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceResources(nodes, publishedEmbeds(nodes), spaces, NO_DRAG, {
        spaceId: HOST,
        mapId: OTHER_MAP,
        policy: 'authoring',
      }),
    );
    await waitFor(() => expect(result.current.embeddedRequests).toHaveLength(1));
    const framing: SpaceResourceFraming = { centreX: 200, centreY: 100, zoom: 2 };
    act(() => {
      result.current.setPortalDraft(new Map([[HOST, framing]]));
    });
    expect(result.current.portalDraft.get(HOST)).toEqual(framing);
  });

  it('keeps a failed read for an embedding given no view, and reads it again on resume', async () => {
    let fail = true;
    let asked = 0;
    const spaces = reader(() => {
      asked += 1;
      if (fail) return Promise.reject(new Error('Target missing'));
      return Promise.resolve(undefined);
    });
    const nodes = [spaceResource(HOST, MAP)];
    const embeds = viewlessEmbed(nodes);
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceResources(nodes, embeds, spaces, NO_DRAG, {
        spaceId: HOST,
        mapId: OTHER_MAP,
        policy: 'authoring',
      }),
    );
    await waitFor(() => expect(asked).toBe(1));
    await act(async () => {
      await Promise.resolve();
    });
    // Nothing is drawn while the Space is unread, so the failure is said on the placement.
    expect(result.current.embeddedRequests).toHaveLength(0);
    expect(result.current.embeddedFailures.get(TARGET)).toBe('Target missing');
    expect(result.current.failedEmbeddings).toEqual([
      { id: HOST, title: 'Elsewhere', message: 'Target missing' },
    ]);
    fail = false;
    await act(async () => {
      await result.current.resumeEmbedded(TARGET);
    });
    expect(asked).toBe(2);
    expect(result.current.embeddedFailures.has(TARGET)).toBe(false);
    expect(result.current.failedEmbeddings).toEqual([]);
  });

  it("draws an embedding given no view on its Space's defaultMap as it is now", async () => {
    const containing: SpaceSnapshot = {
      id: HOST,
      document: {
        version: 1,
        title: 'Talk',
        defaultMap: HOST_MAP,
        maps: [
          {
            id: HOST_MAP,
            title: 'Talk Map',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: HOST_GRAPH, title: 'Talk Graph', edges: [] }],
          },
        ],
      },
      resources: [],
    };
    const shown: SpaceSnapshot = {
      id: TARGET,
      document: {
        version: 1,
        title: 'Architecture',
        defaultMap: MAP,
        maps: [
          {
            id: MAP,
            title: 'First',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: GRAPH, title: 'First Graph', edges: [] }],
          },
        ],
      },
      resources: [],
    };
    const spaces = createOpenSpaces({
      fullscreen: refusingFullscreen,
      presentations: unlinkedPresentations,
      backend: new MemorySpaceBackend(
        HOST,
        [containing, shown].map((snapshot) => ({
          snapshot,
          revision: 0n,
          exportedRevision: null,
        })),
      ),
      metaSpaceId: HOST,
      metaSpaceTitle: containing.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    await spaces.open(HOST);
    const { entry } = await spaces.hold(TARGET);
    const nodes = [spaceResource(HOST, MAP)];
    const embeds = viewlessEmbed(nodes);
    const { result, rerender } = renderHook(() =>
      useEmbeddedOpenSpaceResources(nodes, embeds, spaces, NO_DRAG, {
        spaceId: HOST,
        mapId: OTHER_MAP,
        policy: 'authoring',
      }),
    );
    await waitFor(() => expect(result.current.embeddedRequests[0]?.mapId).toBe(MAP));
    // A new Map is the Space's opening Map from then on (ADR 0079).
    await act(async () => {
      entry.app.authoring.complete(CANVAS, { kind: 'created-map' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const opening = entry.app.currentSpace().defaultMap;
    expect(opening).not.toBe(MAP);
    rerender();
    expect(result.current.embeddedRequests[0]?.mapId).toBe(opening);
  });
});
