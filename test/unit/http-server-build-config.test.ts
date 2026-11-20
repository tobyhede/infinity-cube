import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../packages/app/http-server-build.config';
import { type AliasEntry, pluginPackages, resolveAlias } from '../support/plugin-packages';

/**
 * The config is loaded by `pnpm --filter @project/app http-server:build`, whose
 * working directory happens to be the app package — so cwd-relative paths in it
 * resolve correctly through that one entry point and nowhere else. These tests
 * run from the repo root, which is exactly the discrepancy worth catching.
 */
describe('http server build config', () => {
  // SAFETY: Vite's `UserConfig` types `resolve`/`build` far more broadly than
  // this one config file actually uses — `http-server-build.config.ts` is a
  // literal object naming exactly `resolve.alias` (an array of `{ find,
  // replacement }` entries) and `build.ssr`/`build.outDir` (both strings), so
  // narrowing to just what this file reads doesn't claim anything the config
  // doesn't provide.
  const resolved = config as {
    resolve?: { alias?: readonly AliasEntry[] };
    build?: { ssr?: string; outDir?: string };
  };

  /*
   * A pattern entry's replacement names no file until a specifier fills it, so
   * each is checked through the plugins it resolves: every `packages/plugin-*`
   * package, found by walking the directory rather than counted here.
   */
  it('resolves every `@project/*` alias to a real file regardless of cwd', () => {
    const alias = resolved.resolve?.alias ?? [];
    const targets = [
      ...alias.flatMap(({ find, replacement }) =>
        typeof find === 'string' ? [[find, replacement] as const] : [],
      ),
      ...pluginPackages().map((name) => {
        const specifier = `@project/${name}/domain`;
        return [specifier, resolveAlias(alias, specifier) ?? ''] as const;
      }),
    ];
    expect(targets.length).toBeGreaterThan(pluginPackages().length);
    for (const [name, target] of targets) {
      expect(isAbsolute(target), `${name} is absolute`).toBe(true);
      expect(existsSync(target), `${name} -> ${target}`).toBe(true);
    }
  });

  it('points its SSR entry at a real module regardless of cwd', () => {
    const entry = resolved.build?.ssr;
    expect(typeof entry).toBe('string');
    expect(existsSync(entry!), `ssr entry -> ${String(entry)}`).toBe(true);
  });

  it('writes its artifact into the app package regardless of cwd', () => {
    // A cwd-relative outDir writes `dist-http/` wherever the build was started
    // from — the repo root for every entry point but the one filtered script.
    const outDir = resolved.build?.outDir;
    expect(typeof outDir).toBe('string');
    expect(isAbsolute(outDir!), `outDir is absolute -> ${String(outDir)}`).toBe(true);
    expect(outDir).toBe(fileURLToPath(new URL('../../packages/app/dist-http', import.meta.url)));
  });
});
