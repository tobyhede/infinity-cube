import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { trackedFiles } from '../support/structural-scan';

/**
 * The build lists its Resource plugins once, in `packages/plugins` (ADR 0142):
 * no other package's source imports a plugin, so a plugin is added or removed
 * in that one file. The rule is `@typescript-eslint/no-restricted-imports`;
 * this pins what it does, by linting probe source, and that no source has
 * reached round it.
 */
const RULE = '@typescript-eslint/no-restricted-imports';

const eslint = new ESLint({ cwd: process.cwd() });

/** Whether the rule refuses `line`, as an error, when linted as `file`. */
const refuses = async (line: string, file: string): Promise<boolean> => {
  const [result] = await eslint.lintText(`${line}\n`, { filePath: file });
  return (result?.messages ?? []).some(
    (message) => message.ruleId === RULE && message.severity === 2,
  );
};

const PLUGIN_IMPORT = "import { markdownPlugin } from '@project/plugin-markdown/domain';";
const LIST_IMPORT = "import { PLUGINS } from '@project/plugins/domain';";

describe('importing a Resource plugin', () => {
  it.each([
    'packages/core/src/schema.ts',
    'packages/ui/src/PluginResource.tsx',
    'packages/app/src/compose-app.ts',
    'packages/persistence/src/space-resource-planning.ts',
    'src/cli/run-process.ts',
  ])('is refused in %s', async (file) => {
    expect(await refuses(PLUGIN_IMPORT, file)).toBe(true);
  });

  it('is allowed in the plugin list', async () => {
    expect(await refuses(PLUGIN_IMPORT, 'packages/plugins/src/domain.ts')).toBe(false);
  });

  it('leaves the list itself to every package', async () => {
    expect(await refuses(LIST_IMPORT, 'packages/core/src/schema.ts')).toBe(false);
  });

  it('is in no tracked source outside the plugin packages and the list', () => {
    const importing = trackedFiles()
      .filter((file) => /^(?:packages\/[^/]+\/src|src)\/.*\.tsx?$/u.test(file))
      .filter((file) => !/^packages\/plugin(?:s|-[^/]+)\//u.test(file))
      .filter((file) => /from\s+'@project\/plugin-/u.test(readFileSync(file, 'utf8')));
    expect(importing).toEqual([]);
  });
});
