import type { ResourceId } from '@project/core';
import { referencedResources, type Space } from '@project/graph';
import { HostMapProvider, PresentedPluginResource } from '@project/ui';
import { drawPresentedMapEmbed } from './map-embed-draws';

export interface StagedResourceProps {
  /** The Space the Resource belongs to. */
  readonly space: Space;
  /** The Resource drawn on the Stage. */
  readonly resourceId: ResourceId;
  /** Told what a Resource plugin threw while drawing (ADR 0142). */
  readonly onPluginFailure?: ((error: Error) => void) | undefined;
  /** The Replacement epoch, on which a plugin's drawing starts again. */
  readonly replacementEpoch?: number | undefined;
}

/**
 * A Resource drawn on the Stage by its plugin, read-only, with the presented
 * Map embedding a Space Resource draws its Map through: what Full View and
 * presenting both draw, so Full View previews what the audience sees.
 */
export function StagedResource({
  space,
  resourceId,
  onPluginFailure,
  replacementEpoch,
}: StagedResourceProps) {
  const resource = space.lookup.resource(resourceId);
  if (resource === undefined) return null;
  return (
    <HostMapProvider draw={drawPresentedMapEmbed}>
      <PresentedPluginResource
        resourceId={resource.id}
        kind={resource.kind}
        title={resource.title}
        content={resource.content}
        embeddable={referencedResources(space, resource)}
        onFailure={onPluginFailure}
        replacementEpoch={replacementEpoch}
      />
    </HostMapProvider>
  );
}
