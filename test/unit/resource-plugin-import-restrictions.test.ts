import { readFile } from 'node:fs/promises';
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
const restrictedImportsSchema = z.tuple([
  z.unknown(),
  z.object({
    paths: z.array(z.unknown()),
    patterns: z.array(z.object({ regex: z.string().optional() }).passthrough()),
  }),
]);

const PLUGIN_FILES = [
  'packages/plugin-ur/src/domain.ts',
  'packages/plugin-ur/src/view.tsx',
  'packages/plugin-markdown/src/domain.ts',
  'packages/plugin-markdown/src/view.tsx',
  'packages/plugin-space/src/domain.ts',
  'packages/plugin-space/src/view.tsx',
];

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

  it.each(['./shapes', '../shapes'])(
    'keeps %s, a file outside its domain/, out of a plugin’s domain entry',
    async (specifier) => {
      expect(await lintImport(specifier, 'packages/plugin-ur/src/domain.ts')).not.toHaveLength(0);
    },
  );

  it('permits a plugin’s domain entry its own files under domain/', async () => {
    expect(await lintImport('./domain/rules', 'packages/plugin-ur/src/domain.ts')).toEqual([]);
  });

  it('zones every file under a plugin’s domain entry as the entry, kept inside domain/', async () => {
    // A file that does not exist cannot be linted under the project service, so its zone is read.
    const zone = async (file: string) =>
      restrictedImportsSchema.parse(
        lintConfigSchema.parse(await eslint.calculateConfigForFile(file)).rules[
          'no-restricted-imports'
        ],
      )[1];
    const entry = await zone('packages/plugin-ur/src/domain.ts');
    const nested = await zone('packages/plugin-ur/src/domain/rules.ts');
    expect(nested.paths).toEqual(entry.paths);
    expect(nested.patterns.slice(0, -1)).toEqual(entry.patterns.slice(0, -1));
    const staysInDomain = new RegExp(nested.patterns.at(-1)?.regex ?? '(?!)', 'u');
    expect(['../shapes', '../view'].filter((specifier) => staysInDomain.test(specifier))).toEqual([
      '../shapes',
      '../view',
    ]);
    expect(['./rules', '../domain/rules'].some((specifier) => staysInDomain.test(specifier))).toBe(
      false,
    );
  });

  it.each(PLUGIN_FILES)('keeps the host half of the view out of %s', async (file) => {
    expect(await lintImport('@project/resource-api/view/host', file)).not.toHaveLength(0);
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

/** Every module specifier a source file imports or re-exports. */
const specifiersOf = (source: string): readonly string[] =>
  [...source.matchAll(/\b(?:from|import)\s+'([^']+)'/gu)].flatMap(([, specifier]) =>
    specifier === undefined ? [] : [specifier],
  );

describe('the Space plugin’s imports', () => {
  /**
   * The Space Resource reaches the Map embedding, the selection commit and its
   * Claim through the Resource API alone (ADR 0142): its sources name no
   * package of ours but that, whatever the lint zone would admit.
   */
  it.each(['packages/plugin-space/src/domain.ts', 'packages/plugin-space/src/view.tsx'])(
    'imports only the Resource API and its own third-party dependencies in %s',
    async (file) => {
      const outside = specifiersOf(await readFile(file, 'utf8')).filter(
        (specifier) =>
          ![
            '@project/resource-api/domain',
            '@project/resource-api/view',
            'react',
            'lucide-react',
            'zod',
          ].includes(specifier) && !specifier.startsWith('./'),
      );
      expect(outside).toEqual([]);
    },
  );
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
