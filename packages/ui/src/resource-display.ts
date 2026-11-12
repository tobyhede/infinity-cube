import type { ResourceContent } from '@project/core';

/**
 * What a drawn Resource shows now. A Closed Resource carries no content (ADR
 * 0006, as narrowed by ADR 0064); an Open one carries its resolved content, its
 * own or its Target's. Presenting draws on the Stage through
 * `PresentedResource`, never through `CanvasResource` (ADR 0123). No edit runs
 * in a content area `CanvasResource` draws: a plugin's edit is its own, inside
 * its rect (ADR 0142).
 */
export type ResourceDisplay =
  { readonly shown: 'closed' } | { readonly shown: 'open'; readonly content: ResourceContent };

/** The one Closed display, so every Closed Resource shares its identity. */
export const CLOSED_DISPLAY: Extract<ResourceDisplay, { readonly shown: 'closed' }> = {
  shown: 'closed',
};
