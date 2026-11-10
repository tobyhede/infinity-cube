import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * ADR 0142: a Resource plugin imports no package of ours but the Resource API,
 * and the Resource API imports none of ours. Linted at real files of the Ur
 * plugin and the API, so these are the zones the rule actually applies.
 */
const eslint = new ESLint({ cwd: process.cwd(), overrideConfigFile: 'eslint.config.js' });

const lintImport = async (specifier: string, filePath: string): Promise<readonly string[]> => {
  const [result] = await eslint.lintText(`import value from '${specifier}'; void value;`, {
    filePath,
  });
  return (result?.messages ?? [])
    .filter(({ ruleId }) => ruleId === 'no-restricted-imports')
    .map(({ message }) => message);
};

const lintConfigSchema = z.object({ rules: z.record(z.unknown()) });

const PLUGIN_FILES = ['packages/plugin-ur/src/domain.ts', 'packages/plugin-ur/src/view.tsx'];

describe('Resource plugin import restrictions', () => {
  it.each(
    PLUGIN_FILES.flatMap((file) =>
      [
        '@project/core',
        '@project/ui',
        '@project/graph',
        '@project/persistence',
        '@project/react-flow-adapter',
        '@project/resource-api/domain/internal',
        '../../core/src/index',
      ].map((specifier) => [specifier, file] as const),
    ),
  )('rejects %s from %s', async (specifier, file) => {
    expect(await lintImport(specifier, file)).toHaveLength(1);
  });

  it.each(['@project/resource-api/domain', 'zod'])(
    'permits %s in a plugin’s domain half',
    async (specifier) => {
      expect(await lintImport(specifier, 'packages/plugin-ur/src/domain.ts')).toEqual([]);
    },
  );

  it.each(['@project/resource-api/view', '@project/resource-api/domain', 'react', 'lucide-react'])(
    'permits %s in a plugin’s view half',
    async (specifier) => {
      expect(await lintImport(specifier, 'packages/plugin-ur/src/view.tsx')).toEqual([]);
    },
  );

  it.each(['react', 'react-dom', '@project/resource-api/view', './view', '../view'])(
    'keeps %s out of a plugin’s domain half',
    async (specifier) => {
      expect(await lintImport(specifier, 'packages/plugin-ur/src/domain.ts')).not.toHaveLength(0);
    },
  );

  it('zones every file under a plugin’s domain entry as the entry itself', async () => {
    // A file that does not exist cannot be linted under the project service, so its zone is compared.
    const zone = async (file: string) =>
      lintConfigSchema.parse(await eslint.calculateConfigForFile(file)).rules[
        'no-restricted-imports'
      ];
    expect(await zone('packages/plugin-ur/src/domain/rules.ts')).toEqual(
      await zone('packages/plugin-ur/src/domain.ts'),
    );
  });

  it.each(PLUGIN_FILES)('keeps the test host out of %s', async (file) => {
    expect(await lintImport('@project/resource-api/view/testing', file)).not.toHaveLength(0);
  });

  it('permits the test host in a plugin’s tests', async () => {
    expect(
      await lintImport(
        '@project/resource-api/view/testing',
        'packages/plugin-ur/test/ur-plugin.test.tsx',
      ),
    ).toEqual([]);
  });
});

describe('Resource API import restrictions', () => {
  it.each(['@project/core', '@project/ui'])('rejects %s from the API', async (specifier) => {
    expect(await lintImport(specifier, 'packages/resource-api/src/view/index.tsx')).toHaveLength(1);
  });

  it.each(['react', '../view'])('rejects %s from the domain half', async (specifier) => {
    expect(
      await lintImport(specifier, 'packages/resource-api/src/domain/index.ts'),
    ).not.toHaveLength(0);
  });
});
