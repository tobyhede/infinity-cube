import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../packages/app/http-server-build.config';
import { z } from 'zod';
import { aliasListSchema, pluginPackages, resolveAlias } from '../support/plugin-packages';

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

  it('resolves every named `@project/*` alias to a real file regardless of cwd', () => {
    for (const { find, replacement } of alias) {
      if (find instanceof RegExp) continue;
      expect(isAbsolute(replacement), `${find} is absolute`).toBe(true);
      expect(existsSync(replacement), `${find} -> ${replacement}`).toBe(true);
    }
  });

  /*
   * A pattern entry's replacement names no file until a specifier fills it, so
   * it is checked through every `packages/plugin-*` package, found by walking
   * the directory rather than counted here.
   */
  it.each(pluginPackages())(
    'resolves the domain half of %s to a real file regardless of cwd',
    (name) => {
      const target = resolveAlias(alias, `@project/${name}/domain`);
      expect(target, `@project/${name}/domain matches an alias`).toBeDefined();
      expect(isAbsolute(target ?? ''), `${name} is absolute`).toBe(true);
      expect(existsSync(target ?? ''), `${name} -> ${String(target)}`).toBe(true);
    },
  );

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
