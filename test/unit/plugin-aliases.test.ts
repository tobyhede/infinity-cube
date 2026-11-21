import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { z } from 'zod';
import vitestConfig from '../../vitest.config';
import {
  type WorkspaceAlias,
  workspaceAliases,
  workspacePackages,
} from '../../packages/app/workspace-aliases';
import {
  PLUGIN_DOMAIN_SPECIFIER,
  PLUGIN_HALF_FILES,
  PLUGIN_VIEW_SPECIFIER,
  pluginReplacement,
} from '../../packages/app/plugin-specifiers';
import {
  aliasListSchema,
  PACKAGES_DIRECTORY,
  missingPluginHalves,
  namesAPlugin,
  pluginPackages,
  resolveAlias,
} from '../support/plugin-packages';
import { trackedFiles } from '../support/structural-scan';

/**
 * A Resource plugin is reached through path aliases written as patterns, so
 * adding a `packages/plugin-*` package edits no alias list. These hold every
 * plugin to its two halves, every alias list to resolving each plugin, and
 * no list to naming one.
 */

const vitestAliases: readonly WorkspaceAlias[] = z
  .object({ resolve: z.object({ alias: aliasListSchema }) })
  .parse(vitestConfig).resolve.alias;

/** The part of a tsconfig these checks read. */
const tsconfigPathsSchema = z.object({
  compilerOptions: z.object({ paths: z.record(z.array(z.string())).optional() }).optional(),
});

describe('the plugin package listing', () => {
  // Also what keeps every `it.each(pluginPackages())` below from passing
  // empty, as it would where git lists no files.
  it('finds the plugin packages and not the list', () => {
    const plugins = pluginPackages();
    expect(plugins).toContain('plugin-ur');
    expect(plugins).not.toContain('plugins');
  });

  it('lists no leftover directory that holds no plugin package', () => {
    expect(
      pluginPackages([
        'packages/plugin-whole/package.json',
        'packages/plugin-whole/src/domain.ts',
        'packages/plugin-whole/src/view.tsx',
        'packages/plugin-leftover/node_modules/.modules.yaml',
        'packages/plugins/package.json',
      ]),
    ).toEqual(['plugin-whole']);
  });

  it('finds both halves in every plugin package', () => {
    expect(missingPluginHalves()).toEqual([]);
  });

  it('reports a plugin package that lacks a half', () => {
    expect(
      missingPluginHalves([
        'packages/plugin-whole/package.json',
        'packages/plugin-whole/src/domain.ts',
        'packages/plugin-whole/src/view.tsx',
        'packages/plugin-no-view/package.json',
        'packages/plugin-no-view/src/domain.ts',
        'packages/plugin-no-domain/package.json',
        'packages/plugin-no-domain/src/view.tsx',
        'packages/plugins/package.json',
        'packages/plugins/src/domain.ts',
      ]),
    ).toEqual(['plugin-no-domain/src/domain.ts', 'plugin-no-view/src/view.tsx']);
  });
});

describe('the plugin specifier patterns', () => {
  it.each([
    ['domain', PLUGIN_DOMAIN_SPECIFIER],
    ['view', PLUGIN_VIEW_SPECIFIER],
  ] as const)('refuses the plugin list in the %s pattern', (_half, pattern) => {
    expect(
      ['@project/plugins/domain', '@project/plugins/view', '@project/plugins/testing'].filter(
        (specifier) => pattern.test(specifier),
      ),
    ).toEqual([]);
  });

  it('keeps a `$` in the packages directory out of the replacement pattern', () => {
    const aliases = [
      { find: PLUGIN_DOMAIN_SPECIFIER, replacement: pluginReplacement('/c/$&$1$$/', 'domain') },
    ];
    expect(resolveAlias(aliases, '@project/plugin-ur/domain')).toBe(
      '/c/$&$1$$/plugin-ur/src/domain.ts',
    );
  });
});

describe('resolving a plugin through the aliases', () => {
  it.each(pluginPackages())('resolves both halves of %s through Vitest', (name) => {
    for (const [half, file] of Object.entries(PLUGIN_HALF_FILES)) {
      expect(resolveAlias(vitestAliases, `@project/${name}/${half}`)).toBe(
        join(PACKAGES_DIRECTORY, name, file),
      );
    }
  });

  it.each(pluginPackages())('resolves the domain half of %s through the server builds', (name) => {
    expect(resolveAlias(workspaceAliases(), `@project/${name}/domain`)).toBe(
      join(PACKAGES_DIRECTORY, name, PLUGIN_HALF_FILES.domain),
    );
  });

  it.each(pluginPackages())('inlines the domain half of %s in the HTTP server build', (name) => {
    const specifier = `@project/${name}/domain`;
    expect(
      workspacePackages.some((entry) =>
        entry instanceof RegExp ? entry.test(specifier) : entry === specifier,
      ),
    ).toBe(true);
  });

  it('keeps the plugin list ahead of the plugin pattern', () => {
    expect(resolveAlias(vitestAliases, '@project/plugins/domain')).toBe(
      join(PACKAGES_DIRECTORY, 'plugins/src/domain.ts'),
    );
    expect(resolveAlias(workspaceAliases(), '@project/plugins/domain')).toBe(
      join(PACKAGES_DIRECTORY, 'plugins/src/domain.ts'),
    );
  });

  it('leaves a plugin’s view half out of the server builds', () => {
    expect(resolveAlias(workspaceAliases(), '@project/plugin-ur/view')).toBeUndefined();
  });
});

/** A tracked file's text, read from the repository root whatever the working directory. */
const readTrackedFile = (file: string): string =>
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

/** Each tracked tsconfig's `paths` keys, by file. */
const tsconfigPathKeys = (): ReadonlyMap<string, readonly string[]> =>
  new Map(
    trackedFiles()
      .filter((file) => /(?:^|\/)tsconfig[^/]*\.json$/u.test(file))
      .map((file) => [
        file,
        Object.keys(
          tsconfigPathsSchema.parse(
            ts.parseConfigFileTextToJson(file, readTrackedFile(file)).config,
          ).compilerOptions?.paths ?? {},
        ),
      ]),
  );

/** The tsconfigs whose `paths` hold `key`, sorted. */
const tsconfigsWith = (key: string): readonly string[] =>
  [...tsconfigPathKeys()]
    .filter(([, keys]) => keys.includes(key))
    .map(([file]) => file)
    .toSorted();

describe('the alias lists', () => {
  it('see a regular expression that names one plugin, as well as a string', () => {
    expect(namesAPlugin('@project/plugin-ur/domain')).toBe(true);
    expect(namesAPlugin(/^@project\/plugin-ur\/domain$/u)).toBe(true);
    expect(namesAPlugin('@project/plugin-*/domain')).toBe(false);
    expect(namesAPlugin(PLUGIN_DOMAIN_SPECIFIER)).toBe(false);
    expect(namesAPlugin('@project/plugins/domain')).toBe(false);
  });

  it('name no individual plugin in any tsconfig', () => {
    const naming = [...tsconfigPathKeys()]
      .filter(([, keys]) => keys.some((key) => namesAPlugin(key)))
      .map(([file]) => file);
    expect(naming).toEqual([]);
  });

  /*
   * The narrowing, per package: a package resolves a plugin's view half only
   * where its tsconfig carries the view pattern, so these lists are the
   * packages that may. Widening one is a boundary decision, not a fix.
   */
  it('give the plugin domain pattern to the packages that resolve the plugin list', () => {
    expect(tsconfigsWith('@project/plugin-*/domain')).toEqual([
      'packages/aggregate/tsconfig.json',
      'packages/app/tsconfig.json',
      'packages/core/tsconfig.json',
      'packages/graph/tsconfig.json',
      'packages/http/tsconfig.json',
      'packages/persistence/tsconfig.json',
      'packages/plugins/tsconfig.json',
      'packages/react-flow-adapter/tsconfig.json',
      'packages/ui/tsconfig.json',
      'tsconfig.base.json',
    ]);
  });

  it('give the plugin view pattern only to the packages that may draw a plugin', () => {
    expect(tsconfigsWith('@project/plugin-*/view')).toEqual([
      'packages/app/tsconfig.json',
      'packages/plugins/tsconfig.json',
      'packages/react-flow-adapter/tsconfig.json',
      'packages/ui/tsconfig.json',
      'tsconfig.base.json',
    ]);
  });

  it('name no individual plugin in Vitest or the server builds', () => {
    const finds = [...vitestAliases, ...workspaceAliases()].map(({ find }) => find);
    expect(finds.filter((find) => namesAPlugin(find))).toEqual([]);
    expect(workspacePackages.filter((entry) => namesAPlugin(entry))).toEqual([]);
  });
});
