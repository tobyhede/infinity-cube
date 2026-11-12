import { pluginList } from '@project/resource-api/domain';
import { imagePlugin } from '@project/plugin-image/domain';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { urPlugin } from '@project/plugin-ur/domain';

/**
 * The build-time plugin list (ADR 0120, ADR 0142): every Resource plugin this
 * build draws with, listed once. A plugin written for another Resource API
 * version fails the typecheck here, and refuses to load if it slips past it.
 * Each plugin's view half is keyed to this list by its kind in
 * `packages/ui/src/kinds/plugin-views.tsx`, whose type requires one per entry.
 */
export const PLUGINS = pluginList([imagePlugin, markdownPlugin, urPlugin]);

/** A kind a plugin in this build draws. */
export type PluginKind = (typeof PLUGINS)[number]['kind'];

/** The kinds a plugin in this build draws, in list order. */
export const PLUGIN_KINDS: readonly PluginKind[] = PLUGINS.map(({ kind }) => kind);
