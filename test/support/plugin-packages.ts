import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository's `packages/` directory. */
export const PACKAGES_DIRECTORY = fileURLToPath(new URL('../../packages/', import.meta.url));

/**
 * The two halves every Resource plugin package exports, by the file its
 * `@project/plugin-<name>/<half>` specifier resolves to. The path aliases in
 * `tsconfig.base.json`, `vitest.config.ts` and `packages/app/workspace-aliases.ts`
 * map a specifier to these files by pattern, naming no plugin.
 */
export const PLUGIN_HALVES = {
  domain: 'src/domain.ts',
  view: 'src/view.tsx',
} as const;

/** The `packages/plugin-*` directory names under `packagesDirectory`, sorted. */
export const pluginPackages = (packagesDirectory: string = PACKAGES_DIRECTORY): readonly string[] =>
  readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^plugin-[^/]+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();

/**
 * Every half a `packages/plugin-*` directory lacks, as `<package>/<file>`. A
 * plugin without both cannot be reached through the pattern aliases.
 */
export const missingPluginHalves = (
  packagesDirectory: string = PACKAGES_DIRECTORY,
): readonly string[] =>
  pluginPackages(packagesDirectory).flatMap((name) =>
    Object.values(PLUGIN_HALVES)
      .filter((file) => !existsSync(join(packagesDirectory, name, file)))
      .map((file) => `${name}/${file}`),
  );

/** Every TypeScript source file under each plugin's `src/`, repo-root-relative and sorted. */
export const pluginSourceFiles = (
  packagesDirectory: string = PACKAGES_DIRECTORY,
): readonly string[] =>
  pluginPackages(packagesDirectory)
    .flatMap((name) =>
      readdirSync(join(packagesDirectory, name, 'src'), { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.tsx?$/u.test(file))
        .map((file) => `packages/${name}/src/${file.split('\\').join('/')}`),
    )
    .sort();

/** One Vite or Vitest alias entry, in the array form both accept. */
export interface AliasEntry {
  readonly find: string | RegExp;
  readonly replacement: string;
}

/**
 * The file `specifier` resolves to through `aliases`, as Vite's alias plugin
 * resolves it: the first matching entry wins; a string matches the specifier
 * itself or the specifier followed by a slash, and a regular expression is
 * applied with `String.prototype.replace`. Undefined when nothing matches.
 */
export const resolveAlias = (
  aliases: readonly AliasEntry[],
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
