import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUuid } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDesktopHandler,
  sessionCookieName,
  type StaticFile,
} from '../../src/desktop/desktop-handler';
import { desktopContentSecurityPolicy } from '../../src/desktop/static-files';
import { startRun, type Run } from '../../src/run/run';

const FIXTURE = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));
const HOST = '127.0.0.1:43210';
const ORIGIN = `http://${HOST}`;
const SECRET = 'launch-secret-for-this-window';
const SESSION_COOKIE = sessionCookieName(HOST);
const PAGE = '<!doctype html><script>window.guard = 1;</script><div id="root"></div>';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

const BUILT_SCRIPT: StaticFile = {
  bytes: encode('console.log(1)'),
  contentType: 'text/javascript',
};
const BUILT_SCRIPT_PATH = '/assets/index-abc123.js';

const roots: string[] = [];
const runs: Run[] = [];

afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => run.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const handlerOnFixture = async (
  window: { host: string; secret: string } = {
    host: HOST,
    secret: SECRET,
  },
) => {
  const root = await mkdtemp(join(tmpdir(), 'infinity-cube-desktop-'));
  roots.push(root);
  const directory = join(root, 'talk');
  await cp(FIXTURE, directory, { recursive: true });
  const started = await startRun(directory, {
    newId: newUuid,
    schedule: () => () => undefined,
    report: () => undefined,
  });
  if (started.kind !== 'running') throw new Error(`Expected a run, got ${started.kind}`);
  runs.push(started.run);
  return createDesktopHandler({
    host: started.run.host,
    staticFile: (pathname) =>
      Promise.resolve(pathname === BUILT_SCRIPT_PATH ? BUILT_SCRIPT : undefined),
    page: { bytes: encode(PAGE), contentType: 'text/html; charset=utf-8' },
    contentSecurityPolicy: desktopContentSecurityPolicy(PAGE),
    secret: window.secret,
    expectedHost: () => window.host,
  });
};

const request = (
  path: string,
  init: { method?: string; host?: string; cookie?: string | null; body?: string } = {},
): Request => {
  const headers = new Headers({ host: init.host ?? HOST });
  const cookie = init.cookie === undefined ? `${SESSION_COOKIE}=${SECRET}` : init.cookie;
  if (cookie !== null) headers.set('cookie', cookie);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const requestInit: RequestInit = { method: init.method ?? 'GET', headers };
  if (init.body !== undefined) requestInit.body = init.body;
  return new Request(`${ORIGIN}${path}`, requestInit);
};

describe('The desktop sidecar handler', () => {
  it('refuses a request naming any other Host, before anything else', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request('/api/aggregate', { host: 'evil.example:43210' }));
    expect(response.status).toBe(421);
  });

  it('refuses a request without the session cookie, or with the wrong one', async () => {
    const handle = await handlerOnFixture();
    expect((await handle(request('/api/aggregate', { cookie: null }))).status).toBe(403);
    expect(
      (await handle(request('/api/aggregate', { cookie: `${SESSION_COOKIE}=guess` }))).status,
    ).toBe(403);
  });

  it('trades the launch secret for an HttpOnly, SameSite=Strict session cookie', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request(`/?launch=${SECRET}`, { cookie: null }));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('set-cookie')).toBe(
      `infinity-cube-session-43210=${SECRET}; HttpOnly; SameSite=Strict; Path=/`,
    );
  });

  it('refuses a launch link carrying another secret, and sets no cookie', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request('/?launch=not-the-secret', { cookie: null }));
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('answers the API from the run', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request('/api/aggregate'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: 'loaded' });
  });

  it('answers the root address with the run’s product answer, a redirect to a Space', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request('/'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/^\/spaces\/[A-Za-z0-9_-]+$/);
  });

  it('serves the page, with its Content Security Policy, for a product address that resolves', async () => {
    const handle = await handlerOnFixture();
    const location = (await handle(request('/'))).headers.get('location') ?? '';
    const response = await handle(request(location));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PAGE);
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toMatch(/script-src 'self' 'sha256-[^']+'/);
  });

  it('serves a built file as itself, cached for good', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request(BUILT_SCRIPT_PATH));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log(1)');
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it.each(['GET', 'POST'])(
    'answers %s of an asset path the build does not hold as the Fetch application does: 400 invalid-asset-hash (ST-76)',
    async (method) => {
      const handle = await handlerOnFixture();
      const response = await handle(request('/assets/not-a-hash', { method }));
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toBe('application/problem+json');
      expect(await response.json()).toMatchObject({
        type: 'urn:infinity-cube:problem:invalid-asset-hash',
      });
    },
  );

  it('answers a path the build does not hold with the page', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request('/somewhere/else'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PAGE);
  });

  it('refuses a write to a path that is neither the API nor a product address', async () => {
    const handle = await handlerOnFixture();
    const response = await handle(request('/somewhere/else', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(405);
  });

  it('keeps each window’s session when two talks share one cookie store', async () => {
    // A webview's cookie store scopes a host-only cookie by host and path, not
    // by port (RFC 6265 §8.5), and every talk window shares the default store.
    const jar = new Map<string, string>();
    const keep = (response: Response): void => {
      const [pair = ''] = (response.headers.get('set-cookie') ?? '').split(';');
      const separator = pair.indexOf('=');
      if (separator !== -1) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    };
    const sent = (): string => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const first = { host: '127.0.0.1:43211', secret: 'secret-of-the-first-window' };
    const second = { host: '127.0.0.1:43212', secret: 'secret-of-the-second-window' };
    const handleFirst = await handlerOnFixture(first);
    const handleSecond = await handlerOnFixture(second);
    const at = (window: { host: string }, path: string): Request =>
      new Request(`http://${window.host}${path}`, {
        headers: { host: window.host, cookie: sent() },
      });

    keep(await handleFirst(at(first, `/?launch=${first.secret}`)));
    keep(await handleSecond(at(second, `/?launch=${second.secret}`)));

    expect((await handleFirst(at(first, '/api/aggregate'))).status).toBe(200);
    expect((await handleSecond(at(second, '/api/aggregate'))).status).toBe(200);
  });
});
