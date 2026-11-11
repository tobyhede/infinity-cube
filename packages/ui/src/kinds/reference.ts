import { referenceKind } from '@project/core';
import { referencePlugin } from '@project/plugin-reference/domain';
import { BADGED_TARGET_GLYPH, type KindView } from './kind-view';
import type { PluginOperations } from './plugin-views';

/**
 * The Reference kind's place in this package's kind registry, taken from its
 * plugin (ADR 0070, ADR 0142): its names are the plugin's, and its Resources
 * are drawn by `PluginResource` and `PresentedPluginResource`, which embed its
 * Target. It draws no silhouette of its own but its Target's with a badge.
 * The canvas strokes its border dotted at rest (`reference-canvas.css`, which
 * `PluginResource` imports).
 */
export const referenceView: KindView<PluginOperations> = {
  name: referencePlugin.name,
  listName: referencePlugin.listName,
  referenceName: referencePlugin.referenceName,
  Glyph: BADGED_TARGET_GLYPH,
  bareOperations: { kind: referenceKind.id },
};
