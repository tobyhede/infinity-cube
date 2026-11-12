import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { MapEmbedEntry } from '../src/map-embeddings';

/**
 * What each drawn Resource's plugin publishes through the Map embedding: an
 * Open Space Resource, or a Reference to one, embeds the Map its display
 * shows; a Closed one, or another kind, embeds nothing (ADR 0142). `claimed`
 * names the Resources whose plugin passed its Claim to the embedding.
 */
export const publishedEmbeds = (
  nodes: readonly ResourceFlowNode[],
  claimed: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, MapEmbedEntry> =>
  new Map(
    nodes.flatMap((node): (readonly [string, MapEmbedEntry])[] => {
      const display = node.data.display;
      if (display.shown !== 'open' || display.content.kind !== 'space') return [];
      return [
        [
          node.id,
          {
            resourceId: node.data.resourceId,
            request: {
              view: display.content.content,
              select: undefined,
              claim: claimed.has(node.data.resourceId) ? { release: () => undefined } : undefined,
            },
          },
        ],
      ];
    }),
  );
