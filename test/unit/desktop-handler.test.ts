import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUuid } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  createDesktopHandler,
  type StaticFile,
} from '../../src/desktop/desktop-handler';
import { desktopContentSecurityPolicy } from '../../src/desktop/static-files';
import { startRun, type Run } from '../../src/run/run';

const FIXTURE = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));
const HOST = '127.0.0.1:43210';
const ORIGIN = `http://${HOST}`;
const SECRET = 'launch-secret-for-this-window';
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

const handlerOnFixture = async () => {
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
    secret: SECRET,
    expectedHost: () => HOST,
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
      `${SESSION_COOKIE}=${SECRET}; HttpOnly; SameSite=Strict; Path=/`,
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
});
