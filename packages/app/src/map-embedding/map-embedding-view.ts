import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { EmbeddedRoot } from '../embedded-open-space-resource';
import {
  createMapEmbedding,
  drawnEmbeddings,
  type MapEmbedding,
  type MapEmbeddingDependencies,
} from './map-embedding';

const MapEmbeddingContext = createContext<MapEmbedding | null>(null);

/** Where the Map embedding of the canvas drawing this composition is provided. */
export const MapEmbeddingProvider = MapEmbeddingContext.Provider;

/** The Map embedding of the canvas this is drawn on, or `null` off one. */
export const useMapEmbedding = (): MapEmbedding | null => useContext(MapEmbeddingContext);

/**
 * The Map embedding one canvas draws with, for the canvas's life. It follows
 * whichever Open Spaces, gate and selection the canvas draws with now; the
 * schedule it is created with stays its own.
 */
export function useCanvasMapEmbedding(
  dependencies: Pick<MapEmbeddingDependencies, 'spaces' | 'claims' | 'select' | 'schedule'>,
): MapEmbedding {
  const [embedding] = useState(() => createMapEmbedding(dependencies));
  const { spaces, claims, select } = dependencies;
  useLayoutEffect(() => {
    embedding.follow({ spaces, claims, select });
  }, [embedding, spaces, claims, select]);
  useLayoutEffect(
    () => () => {
      embedding.dispose();
    },
    [embedding],
  );
  return embedding;
}

/**
 * What a canvas draws for its Map embeddings, settled on every commit: the
 * embeddings derived during render from what discovery reads, never from the
 * framing drafts a pan or a wheel tick publishes, then `drawn` from a layout
 * effect, so a store update it makes draws again before paint.
 */
export function useDrawnMapEmbeddings(
  mapEmbedding: MapEmbedding,
  drawn: {
    readonly nodes: readonly ResourceFlowNode[];
    readonly dragging: ReadonlySet<string>;
    readonly root: EmbeddedRoot;
    /** Whether the canvas draws its Resources yet; until it does, no Space is read. */
    readonly ready: boolean;
  },
) {
  const { nodes, dragging, ready } = drawn;
  const embedding = useSyncExternalStore(mapEmbedding.subscribe, mapEmbedding.getState);
  const { embeds, editing, entries, failures, footers, publications } = embedding;
  const { spaceId, mapId, policy } = drawn.root;
  const root = useMemo(() => ({ spaceId, mapId, policy }), [spaceId, mapId, policy]);
  const { requests, failed } = useMemo(
    () =>
      drawnEmbeddings({ editing, entries, failures, footers, publications }, embeds, {
        nodes,
        dragging,
        root,
      }),
    [editing, entries, failures, footers, publications, embeds, nodes, dragging, root],
  );
  useLayoutEffect(() => {
    mapEmbedding.drawn({ nodeIds: nodes.map((node) => node.id), requests, ready });
  }, [mapEmbedding, nodes, embeds, requests, ready]);
  return { embeds, embedding, requests, failed };
}
