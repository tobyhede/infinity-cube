import { z } from 'zod';
import { spaceSelection, uuidSchema, type SpaceView } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { MapEmbedEntry } from '../src/map-embeddings';

/** A plugin's Map content while it is Open. */
const OPEN = z.object({ open: z.literal(true) });

/** A Space Resource's stored content: the view of another Space it shows. */
const SPACE_CONTENT = z.object({ spaceId: uuidSchema, map: uuidSchema, graph: uuidSchema });

/**
 * The view an Open node's plugin embeds: a Space Resource's own, or its
 * Target's for a Reference Resource to one.
 */
const embeddedView = (data: ResourceFlowNode['data']): SpaceView | undefined => {
  if (!OPEN.safeParse(data.mapContent).success) return undefined;
  if (data.kind === 'reference') {
    const target = data.embeddable?.[0];
    return target === undefined ? undefined : spaceSelection(target);
  }
  if (data.kind !== 'space') return undefined;
  const own = SPACE_CONTENT.safeParse(data.ownContent);
  return own.success ? { ...own.data, framing: undefined } : undefined;
};

/**
 * What each drawn Resource's plugin publishes through the Map embedding: an
 * Open Space Resource, or a Reference to one, embeds the Map it shows; a
 * Closed one, or another kind, embeds nothing (ADR 0142). `claimed` names the
 * Resources whose plugin passed its Claim to the embedding.
 */
export const publishedEmbeds = (
  nodes: readonly ResourceFlowNode[],
  claimed: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, MapEmbedEntry> =>
  new Map(
    nodes.flatMap((node): (readonly [string, MapEmbedEntry])[] => {
      const view = embeddedView(node.data);
      if (view === undefined) return [];
      return [
        [
          node.id,
          {
            resourceId: node.data.resourceId,
            drawing: Symbol(node.id),
            request: {
              view,
              select: undefined,
              claim: claimed.has(node.data.resourceId) ? { release: () => undefined } : undefined,
            },
          },
        ],
      ];
    }),
  );
