import { readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { inlineScriptSources } from '../../packages/app/mount-headers';
import type { StaticFile } from './desktop-handler';
import { createHash } from 'node:crypto';

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const contentTypeOf = (path: string): string =>
  CONTENT_TYPES.get(extname(path).toLowerCase()) ?? 'application/octet-stream';

/**
 * The built file at a request's `pathname`, read from under `root` and never
 * from outside it: a path that would climb out answers `undefined`.
 */
export const builtFiles =
  (root: string) =>
  async (pathname: string): Promise<StaticFile | undefined> => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return undefined;
    }
    const base = resolve(root);
    const path = resolve(join(base, decoded));
    const inside = relative(base, path);
    if (inside === '' || inside.startsWith('..') || inside.startsWith(sep)) return undefined;
    // A path the build does not hold as a file, missing or not, is the
    // single-page fallback's, whatever stopped it being read.
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile()) return undefined;
    return { bytes: new Uint8Array(await readFile(path)), contentType: contentTypeOf(path) };
  };

const sha256 = (source: string): string =>
  `'sha256-${createHash('sha256').update(source).digest('base64')}'`;

/**
 * The desktop page's Content Security Policy: Mounting's (`mount-headers.ts`)
 * without the GitHub hosts, since the sidecar's own origin is the only one the
 * page fetches from. Each inline script the page carries is admitted by hash.
 */
export const desktopContentSecurityPolicy = (page: string): string =>
  [
    "default-src 'self'",
    ['script-src', "'self'", ...inlineScriptSources(page).map(sha256)].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
