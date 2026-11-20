import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { z } from 'zod';
import vitestConfig from '../../vitest.config';
import { workspaceAliases, workspacePackages } from '../../packages/app/workspace-aliases';
import {
  type AliasEntry,
  aliasListSchema,
  PACKAGES_DIRECTORY,
  PLUGIN_HALVES,
  missingPluginHalves,
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

/** Names an individual plugin, as opposed to the `plugin-*` pattern or the `plugins` list. */
const NAMES_A_PLUGIN = /@project\/plugin-(?!\*)[^/]+/u;

const vitestAliases: readonly AliasEntry[] = z
  .object({ resolve: z.object({ alias: aliasListSchema }) })
  .parse(vitestConfig).resolve.alias;

/** The part of a tsconfig these checks read. */
const tsconfigPathsSchema = z.object({
  compilerOptions: z.object({ paths: z.record(z.array(z.string())).optional() }).optional(),
});

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A `packages/` directory holding `files`, each created empty. */
const packagesWith = (files: readonly string[]): string => {
  const directory = mkdtempSync(join(tmpdir(), 'plugin-packages-'));
  temporaryDirectories.push(directory);
  for (const file of files) {
    mkdirSync(join(directory, file, '..'), { recursive: true });
    writeFileSync(join(directory, file), '');
  }
  return directory;
};

describe('the plugin package walk', () => {
  it('finds the plugin packages and not the list', () => {
    const plugins = pluginPackages();
    expect(plugins).toContain('plugin-ur');
    expect(plugins).not.toContain('plugins');
  });

  it('finds both halves in every plugin package', () => {
    expect(missingPluginHalves()).toEqual([]);
  });

  it('reports a plugin package that lacks a half', () => {
    const packages = packagesWith([
      'plugin-whole/src/domain.ts',
      'plugin-whole/src/view.tsx',
      'plugin-no-view/src/domain.ts',
      'plugin-no-domain/src/view.tsx',
      'plugins/src/domain.ts',
    ]);
    expect(missingPluginHalves(packages)).toEqual([
      'plugin-no-domain/src/domain.ts',
      'plugin-no-view/src/view.tsx',
    ]);
  });
});

describe('resolving a plugin through the aliases', () => {
  it.each(pluginPackages())('resolves both halves of %s through Vitest', (name) => {
    for (const [half, file] of Object.entries(PLUGIN_HALVES)) {
      expect(resolveAlias(vitestAliases, `@project/${name}/${half}`)).toBe(
        join(PACKAGES_DIRECTORY, name, file),
      );
    }
  });

  it.each(pluginPackages())('resolves the domain half of %s through the server builds', (name) => {
    expect(resolveAlias(workspaceAliases(), `@project/${name}/domain`)).toBe(
      join(PACKAGES_DIRECTORY, name, PLUGIN_HALVES.domain),
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

/** Each tracked tsconfig's `paths` keys, by file. */
const tsconfigPathKeys = (): ReadonlyMap<string, readonly string[]> =>
  new Map(
    trackedFiles()
      .filter((file) => /(?:^|\/)tsconfig[^/]*\.json$/u.test(file))
      .map((file) => [
        file,
        Object.keys(
          tsconfigPathsSchema.parse(
            ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8')).config,
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
  it('name no individual plugin in any tsconfig', () => {
    const naming = [...tsconfigPathKeys()]
      .filter(([, keys]) => keys.some((key) => NAMES_A_PLUGIN.test(key)))
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
    const finds = [...vitestAliases, ...workspaceAliases()].map(({ find }) => String(find));
    expect(finds.filter((find) => NAMES_A_PLUGIN.test(find))).toEqual([]);
    expect(workspacePackages.map(String).filter((entry) => NAMES_A_PLUGIN.test(entry))).toEqual([]);
  });
});
