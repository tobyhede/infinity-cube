import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PLUGIN_HALF_FILES, PLUGIN_PACKAGE_NAME } from '../../packages/app/plugin-specifiers';
import type { WorkspaceAlias } from '../../packages/app/workspace-aliases';
import { trackedFiles } from './structural-scan';

/** The repository's `packages/` directory. */
export const PACKAGES_DIRECTORY = fileURLToPath(new URL('../../packages/', import.meta.url));

/** A plugin package's `package.json`, capturing the package's directory name. */
const PLUGIN_PACKAGE_JSON = new RegExp(`^packages/(${PLUGIN_PACKAGE_NAME})/package\\.json$`, 'u');

/** A TypeScript source file under a plugin package's `src/`. */
const PLUGIN_SOURCE = new RegExp(`^packages/${PLUGIN_PACKAGE_NAME}/src/.*\\.tsx?$`, 'u');

/**
 * The plugin packages among `files` (repo-root-relative, the tracked files by
 * default): each `packages/plugin-*` directory holding a `package.json`,
 * sorted. Reading tracked files rather than the directory keeps a leftover
 * directory, such as one holding only `node_modules`, out of the list.
 */
export const pluginPackages = (files: readonly string[] = trackedFiles()): readonly string[] =>
  files.flatMap((file) => PLUGIN_PACKAGE_JSON.exec(file)?.slice(1, 2) ?? []).toSorted();

/**
 * Every half a plugin package among `files` lacks, as `<package>/<file>`. A
 * plugin without both cannot be reached through the pattern aliases.
 */
export const missingPluginHalves = (
  files: readonly string[] = trackedFiles(),
): readonly string[] => {
  const present = new Set(files);
  return pluginPackages(files).flatMap((name) =>
    Object.values(PLUGIN_HALF_FILES)
      .filter((file) => !present.has(`packages/${name}/${file}`))
      .map((file) => `${name}/${file}`),
  );
};

/** Every tracked TypeScript source file under a plugin package's `src/`, sorted. */
export const pluginSourceFiles = (): readonly string[] =>
  trackedFiles()
    .filter((file) => PLUGIN_SOURCE.test(file))
    .toSorted();

/** An alias list read from a Vite or Vitest config, parsed rather than asserted. */
export const aliasListSchema = z.array(
  z.object({ find: z.union([z.string(), z.instanceof(RegExp)]), replacement: z.string() }),
);

/**
 * The file `specifier` resolves to through `aliases`, as Vite's alias plugin
 * resolves it: the first matching entry wins; a string matches the specifier
 * itself or the specifier followed by a slash, and a regular expression is
 * applied with `String.prototype.replace`. Undefined when nothing matches.
 */
export const resolveAlias = (
  aliases: readonly WorkspaceAlias[],
  specifier: string,
): string | undefined => {
  for (const { find, replacement } of aliases) {
    if (find instanceof RegExp) {
      if (find.test(specifier)) return specifier.replace(find, replacement);
    } else {
      if (specifier === find) return replacement;
      if (specifier.startsWith(`${find}/`)) return replacement + specifier.slice(find.length);
    }
  }
  return undefined;
};

/**
 * Names an individual plugin, as opposed to the `plugin-*` pattern or the
 * `plugins` list: `@project/plugin-` followed by a name rather than a wildcard
 * or a group. The slash may be escaped, as it is in a regular expression's
 * source.
 */
const NAMES_A_PLUGIN = /@project\\?\/plugin-(?![*([])/u;

/** Whether an alias list's `find` names one plugin rather than the pattern. */
export const namesAPlugin = (find: string | RegExp): boolean =>
  NAMES_A_PLUGIN.test(find instanceof RegExp ? find.source : find);
