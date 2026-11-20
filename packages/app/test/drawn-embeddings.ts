import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { EmbeddedRoot } from '../src/embedded-open-space-resource';
import {
  createMapEmbedding,
  drawnEmbeddings,
  type EmbeddedTargetReader,
} from '../src/map-embedding/map-embedding';
import type { MapEmbedEntry } from '../src/map-embedding/map-embeddings';

/**
 * Draws `nodes` through one Map embedding as the canvas does: each placement's
 * plugin publishes what it asks of its embedding, the drawn embeddings are
 * derived during render, and every commit settles the module against them.
 */
export function useDrawnEmbeddings(
  nodes: readonly ResourceFlowNode[],
  embeds: ReadonlyMap<string, MapEmbedEntry>,
  spaces: EmbeddedTargetReader | null,
  dragging: ReadonlySet<string>,
  root: EmbeddedRoot,
) {
  const [embedding] = useState(() =>
    createMapEmbedding({
      spaces,
      claims: { lend: () => () => undefined },
      select: () => undefined,
    }),
  );
  const registry = embedding.embeddings;
  // One drawing per placement, as a plugin's drawing keeps its key while it is drawn.
  const [drawings] = useState(() => new Map<string, symbol>());
  useLayoutEffect(() => {
    for (const [nodeId, entry] of embeds) {
      const drawing = drawings.get(nodeId) ?? Symbol(nodeId);
      drawings.set(nodeId, drawing);
      registry.publish(nodeId, entry.resourceId, entry.request, drawing);
    }
    for (const [nodeId, entry] of registry.getState())
      if (!embeds.has(nodeId)) registry.publish(nodeId, entry.resourceId, null, entry.drawing);
  });
  const published = useSyncExternalStore(registry.subscribe, registry.getState);
  const state = useSyncExternalStore(embedding.subscribe, embedding.getState);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the root is a literal per render in these tests
  const fixedRoot = useMemo(() => root, []);
  const { requests, failed } = useMemo(
    () => drawnEmbeddings(state, published, { nodes, dragging, root: fixedRoot }),
    [state, published, nodes, dragging, fixedRoot],
  );
  useLayoutEffect(() => {
    embedding.drawn({ placements: nodes.map((node) => node.id), requests });
  }, [embedding, nodes, published, requests]);
  useLayoutEffect(() => () => embedding.dispose(), [embedding]);
  return {
    embeddedRequests: requests,
    failedEmbeddings: failed,
    resumeEmbedded: embedding.resume,
    reportBodyHeight: embedding.reportFooter,
  };
}
