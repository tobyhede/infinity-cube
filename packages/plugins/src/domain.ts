import { pluginList } from '@project/resource-api/domain';
import { defaultPlugin } from '@project/plugin-default/domain';
import { imagePlugin } from '@project/plugin-image/domain';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { referencePlugin } from '@project/plugin-reference/domain';
import { spacePlugin } from '@project/plugin-space/domain';
import { urPlugin } from '@project/plugin-ur/domain';

/**
 * The build's plugin list (ADR 0142): every Resource plugin this build draws
 * with, listed once, in the order every choice among kinds is offered in. A
 * plugin written for another Resource API version fails the typecheck here,
 * and refuses to load if it slips past it.
 */
export const PLUGINS = pluginList([
  markdownPlugin,
  spacePlugin,
  imagePlugin,
  urPlugin,
  referencePlugin,
]);

/**
 * The default plugin (ADR 0142): what draws a Resource whose kind names no
 * plugin in this build. It is in no list, so no stored kind selects it; every
 * lookup that finds no plugin falls back to it.
 */
export const DEFAULT_PLUGIN = defaultPlugin;

/** A plugin in the build's list. */
type Listed = (typeof PLUGINS)[number];

/** A kind a plugin in the build's list draws. */
export type PluginKind = Listed['kind'];

/** The plugin in the build's list that draws this kind. */
type PluginOfKind<K extends PluginKind> = Extract<Listed, { readonly kind: K }>;

/**
 * The plugin in the build's list that draws this kind, typed as that plugin,
 * so `pluginOf('space').content.parse(content)` answers a Space Resource's
 * content. For a test or a fixture that built a Resource of a kind it names:
 * the host itself names no kind, and reads a Resource through its plugin's
 * declarations.
 */
export const pluginOf = <K extends PluginKind>(kind: K): PluginOfKind<K> => {
  const found = PLUGINS.find((plugin): plugin is PluginOfKind<K> => plugin.kind === kind);
  if (found === undefined) throw new Error(`No plugin in this build draws "${kind}".`);
  return found;
};
