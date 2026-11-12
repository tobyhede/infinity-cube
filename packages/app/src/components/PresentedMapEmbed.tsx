import type { MapEmbedRequest } from '@project/ui';
import { embeddedViewIds } from '../embedded-open-space-resource';
import { PresentedSpaceMap } from './PresentedSpaceMap';

/**
 * The Map embedding as the Stage draws it (ADR 0140, ADR 0142): the Map and
 * Graph the plugin selects, read-only, whatever the plugin passed with it.
 */
export function PresentedMapEmbed({ request }: { readonly request: MapEmbedRequest }) {
  const ids = embeddedViewIds(request.view);
  if (ids === undefined) return null;
  return <PresentedSpaceMap spaceId={ids.spaceId} mapId={ids.map} graphId={ids.graph} />;
}
