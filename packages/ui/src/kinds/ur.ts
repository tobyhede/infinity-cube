import { urKind, type UrContent } from '@project/core';
import { urPlugin } from '@project/plugin-ur/domain';
import { urPluginView } from '@project/plugin-ur/view';
import type { KindView } from './kind-view';
import type { PluginOperations } from './plugin-views';

/**
 * The Ur kind's place in this package's kind registry, taken from its plugin
 * (ADR 0142): its names and glyph are the plugin's, and its Resources are drawn
 * by `PluginResource` and `PresentedPluginResource` from `plugin-views.tsx`, so
 * it declares no content view of its own.
 */
export const urView: KindView<PluginOperations, UrContent> = {
  name: urPlugin.name,
  listName: urPlugin.listName,
  referenceName: urPlugin.referenceName,
  Glyph: urPluginView.Glyph,
  bareOperations: { kind: urKind.id },
};
