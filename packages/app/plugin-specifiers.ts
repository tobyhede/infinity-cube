/**
 * A Resource plugin's halves, by pattern: `@project/plugin-<name>/domain` and
 * `/view` capture `plugin-<name>`, the package's directory under `packages/`,
 * so adding a plugin package edits no alias list. Anchored at both ends and
 * needing the hyphen, neither matches `@project/plugins/…`, which
 * `test/unit/plugin-aliases.test.ts` holds ("refuses the plugin list"), as it
 * resolves every plugin through `vitest.config.ts`, which aliases both halves
 * with these, and the server builds' shared list, which carries the domain
 * half alone.
 *
 * Imported by Vite and Vitest configs, so it imports nothing.
 */

/** A plugin package's directory name, as a regular-expression source. */
export const PLUGIN_PACKAGE_NAME = 'plugin-[^/]+';

/** The file each half's specifier names, within its plugin package. */
export const PLUGIN_HALF_FILES = {
  domain: 'src/domain.ts',
  view: 'src/view.tsx',
} as const;

export type PluginHalf = keyof typeof PLUGIN_HALF_FILES;

const specifierOf = (half: PluginHalf): RegExp =>
  new RegExp(`^@project\\/(${PLUGIN_PACKAGE_NAME})\\/${half}$`, 'u');

export const PLUGIN_DOMAIN_SPECIFIER = specifierOf('domain');
export const PLUGIN_VIEW_SPECIFIER = specifierOf('view');

/**
 * The replacement an alias list pairs with a half's pattern: `$1`, the
 * captured `plugin-<name>`, under `packagesDirectory`, then the half's file.
 * Vite applies it with `String.prototype.replace`, so every `$` already in
 * the directory is doubled to stay literal.
 */
export const pluginReplacement = (packagesDirectory: string, half: PluginHalf): string =>
  `${packagesDirectory.replaceAll('$', '$$$$')}$1/${PLUGIN_HALF_FILES[half]}`;
