import { uuidSchema } from '@project/core';
import type { MapEmbedRequest } from '@project/ui';
import { PresentedSpaceMap } from './PresentedSpaceMap';

/**
 * The Map embedding as the Stage draws it (ADR 0140, ADR 0142): the Map and
 * Graph the plugin selects, read-only, whatever the plugin passed with it.
 */
export function PresentedMapEmbed({ request }: { readonly request: MapEmbedRequest }) {
  const spaceId = uuidSchema.safeParse(request.view.spaceId);
  const mapId = uuidSchema.safeParse(request.view.map);
  const graphId = uuidSchema.safeParse(request.view.graph);
  if (!spaceId.success || !mapId.success || !graphId.success) return null;
  return <PresentedSpaceMap spaceId={spaceId.data} mapId={mapId.data} graphId={graphId.data} />;
}
