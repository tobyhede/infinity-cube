import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../packages/app/http-server-build.config';
import { z } from 'zod';
import { PLUGIN_DOMAIN_SPECIFIER } from '../../packages/app/plugin-specifiers';
import { aliasListSchema } from '../support/plugin-packages';

/**
 * The config is loaded by `pnpm --filter @project/app http-server:build`, whose
 * working directory happens to be the app package — so cwd-relative paths in it
 * resolve correctly through that one entry point and nowhere else. These tests
 * run from the repo root, which is exactly the discrepancy worth catching.
 */
describe('http server build config', () => {
  const resolved = z
    .object({
      resolve: z.object({ alias: aliasListSchema }),
      build: z.object({ ssr: z.string(), outDir: z.string() }),
    })
    .parse(config);
  const alias = resolved.resolve.alias;

  /*
   * Pinned whole: a package dropped from the list stops being inlined into the
   * server build, which no check over the remaining entries would notice. The
   * one pattern is every plugin's domain half, which
   * `test/unit/plugin-aliases.test.ts` resolves plugin by plugin.
   */
  it('aliases exactly the browser-safe packages the server reaches', () => {
    expect(alias.map(({ find }) => find)).toEqual([
      '@project/aggregate',
      '@project/core',
      '@project/graph',
      '@project/http',
      '@project/persistence',
      '@project/plugins/domain',
      PLUGIN_DOMAIN_SPECIFIER,
      '@project/resource-api/domain',
    ]);
  });

  it('resolves every named `@project/*` alias to a real file regardless of cwd', () => {
    for (const { find, replacement } of alias) {
      if (find instanceof RegExp) continue;
      expect(isAbsolute(replacement), `${find} is absolute`).toBe(true);
      expect(existsSync(replacement), `${find} -> ${replacement}`).toBe(true);
    }
  });

  it('points its SSR entry at a real module regardless of cwd', () => {
    const entry = resolved.build.ssr;
    expect(existsSync(entry), `ssr entry -> ${entry}`).toBe(true);
  });

  it('writes its artifact into the app package regardless of cwd', () => {
    // A cwd-relative outDir writes `dist-http/` wherever the build was started
    // from — the repo root for every entry point but the one filtered script.
    const outDir = resolved.build.outDir;
    expect(isAbsolute(outDir), `outDir is absolute -> ${outDir}`).toBe(true);
    expect(outDir).toBe(fileURLToPath(new URL('../../packages/app/dist-http', import.meta.url)));
  });
});
