import type { ResourcePlugin } from '@project/resource-api/domain';
import type { PluginView } from '@project/resource-api/view';
import { defaultPlugin } from '@project/plugin-default/domain';
import { defaultPluginView } from '@project/plugin-default/view';
import { imagePlugin } from '@project/plugin-image/domain';
import { imagePluginView } from '@project/plugin-image/view';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { markdownPluginView } from '@project/plugin-markdown/view';
import { referencePlugin } from '@project/plugin-reference/domain';
import { referencePluginView } from '@project/plugin-reference/view';
import { spacePlugin } from '@project/plugin-space/domain';
import { spacePluginView } from '@project/plugin-space/view';
import { urPlugin } from '@project/plugin-ur/domain';
import { urPluginView } from '@project/plugin-ur/view';

/**
 * One plugin's two halves, its content and Map content types kept between
 * them and hidden from the host: the host reads them through `use`, which
 * hands both halves to a function typed for any plugin (ADR 0142).
 */
export interface PluginHalves {
  readonly kind: string;
  use<R>(read: <C, M>(plugin: ResourcePlugin<C, M>, view: PluginView<C, M>) => R): R;
}

/** A plugin's halves, typed together where the plugin is listed. */
export function pluginHalves<C, M>(
  plugin: ResourcePlugin<C, M>,
  view: PluginView<C, M>,
): PluginHalves {
  if (view.kind !== plugin.kind) {
    throw new Error(`The "${view.kind}" view is not the "${plugin.kind}" plugin's.`);
  }
  return { kind: plugin.kind, use: (read) => read(plugin, view) };
}

/**
 * Every plugin's two halves, in the build's list order
 * (`./domain`, `PLUGINS`): what a surface draws with and what a creation is
 * offered from.
 */
export const PLUGIN_VIEWS: readonly PluginHalves[] = [
  pluginHalves(markdownPlugin, markdownPluginView),
  pluginHalves(spacePlugin, spacePluginView),
  pluginHalves(imagePlugin, imagePluginView),
  pluginHalves(urPlugin, urPluginView),
  pluginHalves(referencePlugin, referencePluginView),
];

/** The default plugin's two halves, which draw a Resource whose kind names no plugin in this build. */
export const DEFAULT_PLUGIN_VIEW: PluginHalves = pluginHalves(defaultPlugin, defaultPluginView);
