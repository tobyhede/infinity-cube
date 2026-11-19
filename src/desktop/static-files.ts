import { readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import {
  builtMediaType,
  contentSecurityPolicy,
  inlineScriptSources,
} from '../../packages/app/mount-headers';
import type { StaticFile } from './desktop-handler';

/** Whether `path` lies strictly under `base`, both absolute. */
const isInside = (base: string, path: string): boolean => {
  const inside = relative(base, path);
  return inside !== '' && !inside.startsWith('..') && !inside.startsWith(sep);
};

/** The page's file in a build. */
const PAGE_FILE = 'index.html';

/**
 * The file at `pathname` in the build under `root`, read from under `root`
 * and never from outside it: a path that would climb out, by its name or
 * through a symbolic link, answers `undefined`.
 */
const readBuilt = async (
  root: string,
  pathname: string,
  servingPage: boolean,
): Promise<StaticFile | undefined> => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const base = resolve(root);
  const path = resolve(join(base, decoded));
  if (!isInside(base, path)) return undefined;
  // The page is `index.html` in the build, but by that name a request still
  // gets the page, served with its policy, never a file without one (ST-115).
  // Its case is ignored for a file system that ignores it.
  if (!servingPage && relative(base, path).toLowerCase() === PAGE_FILE) return undefined;
  // A path the build does not hold as a file, missing, a directory or
  // otherwise unreadable, is the single-page fallback's.
  try {
    const [realBase, realPath] = await Promise.all([realpath(base), realpath(path)]);
    if (!isInside(realBase, realPath)) return undefined;
    return { bytes: new Uint8Array(await readFile(realPath)), contentType: builtMediaType(path) };
  } catch {
    return undefined;
  }
};

/**
 * The built file a request's `pathname` names, read from under `root` and
 * never from outside it; the page's own file answers `undefined`, so the
 * request falls back to the page with its policy.
 */
export const builtFiles =
  (root: string) =>
  (pathname: string): Promise<StaticFile | undefined> =>
    readBuilt(root, pathname, false);

/** The build's page, its `index.html`, read as {@link builtFiles} reads a file. */
export const builtPage = (root: string): Promise<StaticFile | undefined> =>
  readBuilt(root, `/${PAGE_FILE}`, true);

/**
 * The desktop page's Content Security Policy: Mounting's (`mount-headers.ts`)
 * with no origin beyond its own to fetch from, since the sidecar's own origin
 * is the only one the page fetches from.
 */
export const desktopContentSecurityPolicy = (page: string): string =>
  contentSecurityPolicy(inlineScriptSources(page), []);
