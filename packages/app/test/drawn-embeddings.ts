import { useLayoutEffect, useState } from 'react';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { EmbeddedRoot } from '../src/embedded-open-space-resource';
import type { EmbeddedTargetReader } from '../src/map-embedding/map-embedding';
import {
  useCanvasMapEmbedding,
  useDrawnMapEmbeddings,
} from '../src/map-embedding/map-embedding-view';
import type { MapEmbedEntry } from '../src/map-embedding/map-embeddings';
import { manualSchedule } from './manual-schedule';

const NO_CLAIMS = { lend: () => () => undefined };
const NO_SELECTION = () => undefined;

/**
 * Draws `nodes` through the Map embedding wiring the canvas uses
 * (`useCanvasMapEmbedding`, `useDrawnMapEmbeddings`), with each node's plugin
 * publishing what `embeds` asks of its embedding.
 */
export function useDrawnEmbeddings(
  nodes: readonly ResourceFlowNode[],
  embeds: ReadonlyMap<string, MapEmbedEntry>,
  spaces: EmbeddedTargetReader | null,
  dragging: ReadonlySet<string>,
  root: EmbeddedRoot,
) {
  const [{ schedule }] = useState(manualSchedule);
  const embedding = useCanvasMapEmbedding({
    spaces,
    claims: NO_CLAIMS,
    select: NO_SELECTION,
    schedule,
  });
  const registry = embedding.embeddings;
  // One drawing per node, as a plugin's drawing keeps its key while it is drawn.
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
  const { requests, failed } = useDrawnMapEmbeddings(embedding, {
    nodes,
    dragging,
    root,
    ready: true,
  });
  return {
    embeddedRequests: requests,
    failedEmbeddings: failed,
    resumeEmbedded: embedding.resume,
    reportBodyHeight: embedding.reportFooter,
  };
}
