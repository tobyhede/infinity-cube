import { defaultPlugin } from '@project/plugin-default/domain';
import { defaultPluginView } from '@project/plugin-default/view';
import type { KindNaming } from './registry';

/**
 * What a Resource whose kind names no plugin in this build is called and drawn
 * as: the default plugin's names and glyph (ADR 0142). Its Resources are drawn
 * by `PluginResource` through the default plugin's entry in `plugin-views.tsx`.
 */
export const defaultListing: KindNaming = {
  name: defaultPlugin.name,
  listName: defaultPlugin.listName,
  referenceName: defaultPlugin.referenceName,
  Glyph: defaultPluginView.Glyph,
};
