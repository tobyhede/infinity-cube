import { imageKind, type ImageContent } from '@project/core';
import { imagePlugin } from '@project/plugin-image/domain';
import { imagePluginView } from '@project/plugin-image/view';
import type { KindView } from './kind-view';
import type { PluginOperations } from './plugin-views';

/**
 * The Image kind's place in this package's kind registry, taken from its
 * plugin (ADR 0106, ADR 0142): its names and glyph are the plugin's, and its
 * own Resources are drawn by `PluginResource` and `PresentedPluginResource`,
 * and a Reference Resource's view of one by the host's embedding.
 */
export const imageView: KindView<PluginOperations, ImageContent> = {
  name: imagePlugin.name,
  listName: imagePlugin.listName,
  referenceName: imagePlugin.referenceName,
  Glyph: imagePluginView.Glyph,
  bareOperations: { kind: imageKind.id },
};
