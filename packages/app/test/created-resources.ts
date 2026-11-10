import {
  jsonValueSchema,
  newResourceDocument,
  type EmptyCreatableKindId,
  type JsonValue,
  type MapPosition,
  type ResourceId,
} from '@project/core';
import type { PlacementMode } from '@project/graph';
import type { AuthoringCompletion } from '../src/space-authoring';

/**
 * The `created-resources` Edits a test completes directly, as the creation host
 * asks for them (ADR 0142): a kind's empty Resource, a Reference to a Target,
 * and Image Resources from their content.
 */

type Created = Extract<AuthoringCompletion, { kind: 'created-resources' }>;

/** One Resource of a kind that starts empty, as its plugin's Dock creation asks for it. */
export const createdEmpty = (kind: EmptyCreatableKindId, anchor: MapPosition): Created => ({
  kind: 'created-resources',
  items: [{ kind, content: jsonValueSchema.parse(newResourceDocument(kind, 'unused').content) }],
  anchor,
  placement: 'avoidingOverlap',
});

/** One Reference Resource to `target`, as the Reference plugin asks for it from its Target. */
export const createdReference = (
  target: ResourceId,
  anchor: MapPosition,
  title?: string,
): Created => ({
  kind: 'created-resources',
  items: [{ kind: 'reference', title, content: { target } }],
  anchor,
  placement: 'avoidingOverlap',
});

/** Image Resources holding these contents, as the Image plugin asks for them. */
export const createdImages = (
  contents: readonly JsonValue[],
  anchor: MapPosition,
  placement: PlacementMode,
): Created => ({
  kind: 'created-resources',
  items: contents.map((content) => ({ kind: 'image', content })),
  anchor,
  placement,
});
