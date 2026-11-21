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
import type { ResourceId } from '@project/core';
import {
  createMapEmbedding,
  drawnEmbeddings,
  type EmbeddedTargetReader,
  type MapEmbedding,
  type MapEmbeddingDependencies,
} from './map-embedding';

const MapEmbeddingContext = createContext<MapEmbedding | null>(null);

/** Where the Map embedding of the canvas drawing this composition is provided. */
export const MapEmbeddingProvider = MapEmbeddingContext.Provider;

/** The Map embedding of the canvas this is drawn on, or `null` off one. */
export const useMapEmbedding = (): MapEmbedding | null => useContext(MapEmbeddingContext);

/**
 * The Map embedding one canvas draws with. It lends Claims through, and
 * selects through, whichever gate and selection the canvas draws with now. On
 * other Open Spaces it starts again: the one it replaces gives back every
 * Claim and Space it holds.
 */
export function useCanvasMapEmbedding({
  spaces,
  claims,
  select,
}: {
  readonly spaces: EmbeddedTargetReader | null;
  readonly claims: MapEmbeddingDependencies['claims'];
  readonly select: (resourceId: ResourceId) => void;
}): MapEmbedding {
  const [current] = useState(() => following(claims, select));
  useLayoutEffect(() => {
    current.follow(claims, select);
  }, [current, claims, select]);
  const make = (on: EmbeddedTargetReader | null): MapEmbedding =>
    createMapEmbedding({ spaces: on, claims: current, select: current.select });
  const [made, setMade] = useState(() => ({ spaces, embedding: make(spaces) }));
  let embedding = made.embedding;
  if (made.spaces !== spaces) {
    const next = { spaces, embedding: make(spaces) };
    setMade(next);
    embedding = next.embedding;
  }
  useLayoutEffect(
    () => () => {
      embedding.dispose();
    },
    [embedding],
  );
  return embedding;
}

/** A gate and a selection that forward to whichever were followed last. */
function following(
  claims: MapEmbeddingDependencies['claims'],
  select: (resourceId: ResourceId) => void,
) {
  let now = { claims, select };
  return {
    lend: (drawing: Parameters<MapEmbeddingDependencies['claims']['lend']>[0]) =>
      now.claims.lend(drawing),
    select: (resourceId: ResourceId) => {
      now.select(resourceId);
    },
    follow: (
      nextClaims: MapEmbeddingDependencies['claims'],
      nextSelect: (resourceId: ResourceId) => void,
    ) => {
      now = { claims: nextClaims, select: nextSelect };
    },
  };
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
  const embeds = useSyncExternalStore(
    mapEmbedding.embeddings.subscribe,
    mapEmbedding.embeddings.getState,
  );
  const embedding = useSyncExternalStore(mapEmbedding.subscribe, mapEmbedding.getState);
  const { editing, entries, failures, footers, publications } = embedding;
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
