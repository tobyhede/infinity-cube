import { timingSafeEqual } from 'node:crypto';
import { ASSET_COLLECTION_PATH, assetHashOfPath } from '@project/core';
import type { SpaceHostApplication } from '@project/aggregate';

/**
 * The request handler of the desktop sidecar (ADR 0155): a run's host and the
 * built application, answered as one Fetch function behind the sidecar's
 * lock-down.
 *
 * The sidecar listens on loopback, where any program on the machine, and any
 * web page through DNS rebinding, can reach it, and the HTTP application has
 * no authentication. So every request must name the sidecar's own `Host`, and
 * carry the session cookie the window was given by presenting the launch
 * secret once at `/?launch=<secret>`.
 */

/** A file of the built application, as the handler serves it. */
export interface StaticFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
}

export interface DesktopHandlerOptions {
  readonly host: SpaceHostApplication;
  /** The built file at `pathname`, or `undefined` when the build has none. */
  readonly staticFile: (pathname: string) => Promise<StaticFile | undefined>;
  /** The single-page fallback: the built `index.html`. */
  readonly page: StaticFile;
  /** The page's Content Security Policy. */
  readonly contentSecurityPolicy: string;
  /** Minted at launch; presented once by the window and then held as a cookie. */
  readonly secret: string;
  /** The `Host` every request must name: `127.0.0.1:<port>`. */
  readonly expectedHost: () => string;
}

export const SESSION_COOKIE = 'infinity-cube-session';

const LAUNCH_PARAMETER = 'launch';

const sameSecret = (presented: string, secret: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

const cookieValue = (header: string | null, name: string): string | undefined => {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
};

const refused = (status: 403 | 421, detail: string): Response =>
  new Response(`${detail}\n`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/**
 * Whether the Fetch application serves `pathname`: the API, or the stored
 * asset collection and a stored asset. The built application's own files are
 * also under `/assets/`, but never under a valid asset hash.
 */
const isApplicationPath = (pathname: string): boolean =>
  pathname === '/api' ||
  pathname.startsWith('/api/') ||
  pathname === ASSET_COLLECTION_PATH ||
  assetHashOfPath(pathname) !== undefined;

const isRead = (method: string): boolean => method === 'GET' || method === 'HEAD';

export const createDesktopHandler = (
  options: DesktopHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  const pageHeaders = {
    'Content-Type': options.page.contentType,
    'Content-Security-Policy': options.contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
  const servePage = (method: string): Response =>
    new Response(method === 'HEAD' ? null : options.page.bytes, {
      status: 200,
      headers: pageHeaders,
    });

  return async (request) => {
    if (request.headers.get('host') !== options.expectedHost()) {
      return refused(421, 'This server answers only its own window.');
    }
    const url = new URL(request.url);
    const launch = url.searchParams.get(LAUNCH_PARAMETER);
    if (url.pathname === '/' && launch !== null) {
      if (!sameSecret(launch, options.secret)) {
        return refused(403, 'This launch link is not this window’s.');
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': `${SESSION_COOKIE}=${options.secret}; HttpOnly; SameSite=Strict; Path=/`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const session = cookieValue(request.headers.get('cookie'), SESSION_COOKIE);
    if (session === undefined || !sameSecret(session, options.secret)) {
      return refused(403, 'Open this talk from InfinityCube.');
    }

    if (isApplicationPath(url.pathname)) return options.host.fetch(request);

    const product = await options.host.resolveProductRequest(
      url.pathname,
      request.method,
      request.headers.get('accept') ?? undefined,
    );
    if (product !== undefined) {
      return new Response(request.method === 'HEAD' ? null : (product.body ?? null), {
        status: product.status,
        headers: product.headers ?? {},
      });
    }

    if (!isRead(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const file = url.pathname === '/' ? undefined : await options.staticFile(url.pathname);
    if (file === undefined) return servePage(request.method);
    return new Response(request.method === 'HEAD' ? null : file.bytes, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'X-Content-Type-Options': 'nosniff',
        // The build names every file under `/assets/` by its content.
        'Cache-Control': url.pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      },
    });
  };
};
