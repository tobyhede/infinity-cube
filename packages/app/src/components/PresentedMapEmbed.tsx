import type { MapEmbedRequest } from '@project/ui';
import { embeddedViewIds } from '../embedded-open-space-resource';
import { PresentedSpaceMap } from './PresentedSpaceMap';

/**
 * The Map embedding as the Stage draws it (ADR 0140, ADR 0142): the Map and
 * Graph the plugin selects, or the Space's `defaultMap` where it passed no
 * view, read-only, whatever the plugin passed with it.
 */
export function PresentedMapEmbed({ request }: { readonly request: MapEmbedRequest }) {
  const spaceId = uuidSchema.safeParse(request.space);
  if (!spaceId.success) return null;
  return <PresentedSpaceMap spaceId={spaceId.data} view={request.view} />;
}
