import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aggregateFileSchema, spaceFileSchema, uuidSchema } from '@project/core';
import { MAX_COMMIT_BODY_BYTES } from '@project/http';
import {
  ASSET_MEDIA_TYPE_HEADER,
  COMMIT_OUTCOME_WIRE,
  decodeCommitConflict,
  decodeCommitRefusal,
  decodeCommitResponse,
  decodeLoadedAggregate,
  decodeSpaceSummaries,
  decodeStoredAssetUrl,
  encodeCommitRequest,
  MAX_ASSET_BYTES,
} from '@project/persistence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptSources } from '../../packages/app/mount-headers';
import { FIXTURE, STAND_IN_BUILD } from './fixture';
import { send, type BuiltApplication, type ConformanceHost } from './host';
import {
  assetHash,
  expectApiPolicy,
  expectHtmlProblem,
  expectJson,
  expectProblem,
  loadSpace,
  META,
  postCommit,
  renameChange,
  renameCommitText,
  spaceAddress,
} from './wire';

/**
 * The cases that need nothing but a host to send requests to: every route,
 * every commit outcome, the product addresses, body limits, transport policy
 * headers and the single-page fallback. They run as well against a
 * `Request -> Response` function as against a host process, so a scheme
 * handler is held to them without a listener.
 *
 * One host serves every case in the group, on a fresh copy of the fixture.
 * A case that commits reads the revision it commits against first, and the
 * commits rename only the Meta Space, whose title no other case takes from the
 * fixture, so the cases do not depend on each other's order.
 */

export interface OpenedHost {
  readonly host: ConformanceHost;
  readonly close: () => Promise<void>;
}

export interface WireConformanceOptions {
  /** A name for the host in test titles. */
  readonly name: string;
  /** Opens the host on a fresh copy of the fixture, past any lock it keeps. */
  readonly open: () => Promise<OpenedHost>;
  /** How long `open` may take; a host process takes longer than the default hook timeout. */
  readonly openTimeoutMs?: number;
  readonly builtApplication: BuiltApplication;
}

const UNKNOWN_SPACE = uuidSchema.parse('00000000-0000-4000-8000-00000000dead');
/** A Space id no fixture Space has, for a commit that creates one. */
const NEW_SPACE = uuidSchema.parse('00000000-0000-4000-8000-0000000c0f01');
const UNSTORED_HASH = 'A'.repeat(43);
/**
 * The `errors` of a commit that parses as JSON but is refused as a whole
 * (`decodeCommitBody` and the `rejected` outcome, `packages/http/src/index.ts`).
 */
const WHOLE_BODY_INVALID = [{ code: 'invalid-value', pointer: '' }] as const;

const fixtureTitles = async (): Promise<readonly { id: string; title: string }[]> => {
  const { metaSpaceId } = aggregateFileSchema.parse(
    JSON.parse(await readFile(join(FIXTURE, 'aggregate.json'), 'utf8')),
  );
  expect(metaSpaceId).toBe(META);
  // Every Space directory of the fixture: the entries named by a Space id.
  const ids = (await readdir(FIXTURE, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && uuidSchema.safeParse(entry.name).success)
    .map((entry) => entry.name);
  expect(ids).toContain(META);
  return Promise.all(
    ids.map(async (id) => ({
      id,
      title: spaceFileSchema.parse(
        JSON.parse(await readFile(join(FIXTURE, id, 'space.json'), 'utf8')),
      ).title,
    })),
  );
};

/**
 * A Content Security Policy as each directive's sources, in no order. A
 * browser obeys the first of two directives of one name and ignores the
 * second, so a policy that repeats one fails here rather than comparing by
 * whichever came last.
 */
const directivesOf = (policy: string): Map<string, string[]> => {
  const directives = new Map<string, string[]>();
  for (const directive of policy.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name === undefined || name === '') continue;
    const normalized = name.toLowerCase();
    expect(directives.has(normalized), `the policy repeats ${normalized}: ${policy}`).toBe(false);
    directives.set(normalized, sources.sort());
  }
  return directives;
};

/** Bytes no earlier request stored, so storing them is a first store. */
let uniqueAssets = 0;
const freshBytes = (size: number): Uint8Array<ArrayBuffer> => {
  uniqueAssets += 1;
  const bytes = new Uint8Array(size);
  const stamp = new TextEncoder().encode(`${String(uniqueAssets)}-`);
  bytes.set(stamp.subarray(0, Math.min(size, stamp.byteLength)));
  return bytes;
};

const postAsset = (
  host: ConformanceHost,
  bytes: Uint8Array<ArrayBuffer>,
  headers: Readonly<Record<string, string>>,
): Promise<Response> => send(host, '/assets', { method: 'POST', headers, body: bytes });

/** `body` padded with trailing whitespace, which JSON ignores, to exactly `size` bytes. */
const paddedTo = (body: string, size: number): Uint8Array<ArrayBuffer> => {
  const text = new TextEncoder().encode(body);
  expect(text.byteLength).toBeLessThanOrEqual(size);
  const padded = new Uint8Array(size).fill(0x20);
  padded.set(text);
  return padded;
};

export const describeWireConformance = (options: WireConformanceOptions): void => {
  describe(`HTTP conformance: routes, products and transport (${options.name})`, () => {
    let opened: OpenedHost | undefined;
    const host = (): ConformanceHost => {
      if (opened === undefined) throw new Error('The host did not open');
      return opened.host;
    };
    beforeAll(async () => {
      opened = await options.open();
    }, options.openTimeoutMs);
    afterAll(async () => {
      await opened?.close();
    });

    // Routes and answers: `packages/http/src/index.ts`, over the memory store
    // (`packages/aggregate/src/memory-space-repository.ts`).
    describe('the Space API', () => {
      it('lists every Space of the directory with its title', async () => {
        const response = await send(host(), '/api/spaces');
        expect(response.status).toBe(200);
        expectJson(response);
        expectApiPolicy(response);
        const summaries = decodeSpaceSummaries(await response.json());
        const byId = (left: { id: string }, right: { id: string }) =>
          left.id.localeCompare(right.id);
        // A commit case may have renamed the Meta Space: its title is the one it holds now.
        const metaTitle = (await loadSpace(host(), META)).snapshot.document.title;
        const expected = (await fixtureTitles()).map((space) =>
          space.id === META ? { ...space, title: metaTitle } : space,
        );
        expect([...summaries].sort(byId)).toEqual(expected.sort(byId));
      });

      it('answers one Space with its snapshot and revision', async () => {
        const loaded = await loadSpace(host(), META);
        expect(loaded.snapshot.id).toBe(META);
        expect(loaded.revision).toBeGreaterThanOrEqual(0n);
      });

      it('answers the aggregate with its Meta Space and every Space', async () => {
        const response = await send(host(), '/api/aggregate');
        expect(response.status).toBe(200);
        expectJson(response);
        expectApiPolicy(response);
        const loaded = decodeLoadedAggregate(await response.json());
        if (loaded.kind !== 'loaded') throw new Error('Expected a loaded aggregate');
        expect(loaded.aggregate.metaSpaceId).toBe(META);
        expect(loaded.aggregate.spaces).toHaveLength((await fixtureTitles()).length);
      });

      it('answers 404 not-found for a Space that does not exist', async () => {
        const response = await send(host(), `/api/spaces/${UNKNOWN_SPACE}`);
        expectApiPolicy(response);
        await expectProblem(response, 'not-found');
      });

      it('answers 400 invalid-space-id for an id that is not a UUID, whatever the method', async () => {
        await expectProblem(await send(host(), '/api/spaces/not-a-uuid'), 'invalid-space-id');
        await expectProblem(
          await send(host(), '/api/spaces/not-a-uuid', { method: 'PUT' }),
          'invalid-space-id',
        );
      });

      it.each([
        ['DELETE', '/api/spaces', 'GET, POST'],
        ['HEAD', '/api/spaces', 'GET, POST'],
        ['POST', '/api/aggregate', 'GET'],
        ['PUT', `/api/spaces/${META}`, 'GET'],
        ['HEAD', `/api/spaces/${META}`, 'GET'],
        ['GET', '/assets', 'POST'],
        ['DELETE', `/assets/${UNSTORED_HASH}`, 'GET, HEAD'],
      ])('answers 405 to %s %s, allowing %s', async (method, pathname, allow) => {
        const response = await send(host(), pathname, { method });
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe(allow);
        expectApiPolicy(response);
        if (method !== 'HEAD') await expectProblem(response, 'method-not-allowed');
      });

      it.each(['/api', '/api/nowhere', '/api/spaces/', `/api/spaces/${META}/more`])(
        'answers 404 not-found for %s, which is off the declared API',
        async (pathname) => {
          const response = await send(host(), pathname);
          expectApiPolicy(response);
          await expectProblem(response, 'not-found');
        },
      );
    });

    // Every status in `COMMIT_OUTCOME_WIRE` (`packages/persistence/src/http-protocol.ts`),
    // decided by `decideCommit` (`packages/persistence/src/commit-decision.ts`).
    describe('commits', () => {
      it(`answers ${String(COMMIT_OUTCOME_WIRE.committed.status)} committed with each Space's next revision`, async () => {
        const loaded = await loadSpace(host(), META);
        const response = await postCommit(host(), renameCommitText(loaded, 'Committed'));
        expect(response.status).toBe(COMMIT_OUTCOME_WIRE.committed.status);
        expectJson(response);
        expectApiPolicy(response);
        expect(decodeCommitResponse(await response.json())).toEqual({
          kind: 'committed',
          revisions: [{ spaceId: META, revision: loaded.revision + 1n }],
          deletedSpaceIds: [],
        });
        expect((await loadSpace(host(), META)).snapshot.document.title).toBe('Committed');
      });

      it(`answers ${String(COMMIT_OUTCOME_WIRE.conflict.status)} conflict with the current Space for a stale revision`, async () => {
        const stale = await loadSpace(host(), META);
        expect((await postCommit(host(), renameCommitText(stale, 'First'))).status).toBe(200);
        const response = await postCommit(host(), renameCommitText(stale, 'Second'));
        expect(response.status).toBe(COMMIT_OUTCOME_WIRE.conflict.status);
        expectJson(response);
        const conflict = decodeCommitConflict(await response.json());
        expect(conflict.conflicts).toHaveLength(1);
        expect(conflict.conflicts[0]?.spaceId).toBe(META);
        expect(conflict.conflicts[0]?.current?.revision).toBe(stale.revision + 1n);
        expect(conflict.conflicts[0]?.current?.snapshot.document.title).toBe('First');
      });

      it(`answers ${String(COMMIT_OUTCOME_WIRE['aggregate-refused'].status)} aggregate-refused for a Space no Space Resource references`, async () => {
        const body = JSON.stringify(
          encodeCommitRequest({
            changes: [
              {
                kind: 'create',
                spaceId: NEW_SPACE,
                snapshot: {
                  id: NEW_SPACE,
                  document: { version: 1, title: 'Unreferenced' },
                  resources: [],
                },
              },
            ],
          }),
        );
        const response = await postCommit(host(), body);
        expect(response.status).toBe(COMMIT_OUTCOME_WIRE['aggregate-refused'].status);
        expectJson(response);
        expect(decodeCommitRefusal(await response.json())).toEqual({
          kind: 'aggregate-refused',
          errors: [{ kind: 'ordinary-space-unreferenced', spaceId: NEW_SPACE }],
        });
        expect((await loadSpace(host(), META)).snapshot.id).toBe(META);
        await expectProblem(await send(host(), `/api/spaces/${NEW_SPACE}`), 'not-found');
      });

      it('answers 400 invalid-request for a commit the store will not judge', async () => {
        const loaded = await loadSpace(host(), META);
        const change = renameChange(loaded, 'Twice');
        const response = await postCommit(
          host(),
          JSON.stringify(encodeCommitRequest({ changes: [change, change] })),
        );
        expectApiPolicy(response);
        await expectProblem(response, 'invalid-request', WHOLE_BODY_INVALID);
      });

      it('answers 400 invalid-request for malformed JSON', async () => {
        await expectProblem(await postCommit(host(), '{'), 'invalid-request');
      });

      it('answers 400 invalid-request for a body that is not a commit', async () => {
        await expectProblem(
          await postCommit(host(), '{"changes":"none"}'),
          'invalid-request',
          WHOLE_BODY_INVALID,
        );
      });

      it('answers 415 unsupported-media-type for a commit sent with no Content-Type', async () => {
        const loaded = await loadSpace(host(), META);
        // Bytes, not a string, so the request carries no Content-Type of its own.
        const response = await send(host(), '/api/spaces', {
          method: 'POST',
          body: new TextEncoder().encode(renameCommitText(loaded, 'Untyped')),
        });
        await expectProblem(response, 'unsupported-media-type');
        expect((await loadSpace(host(), META)).revision).toBe(loaded.revision);
      });

      it.each(['text/plain', 'application/json; charset=iso-8859-1', 'application/json; x=1; x=2'])(
        'answers 415 unsupported-media-type for a commit sent as %s',
        async (contentType) => {
          const loaded = await loadSpace(host(), META);
          await expectProblem(
            await postCommit(host(), renameCommitText(loaded, 'Refused'), contentType),
            'unsupported-media-type',
          );
        },
      );

      it('answers 415 unsupported-media-type for an encoded commit', async () => {
        const loaded = await loadSpace(host(), META);
        const response = await send(host(), '/api/spaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
          body: renameCommitText(loaded, 'Encoded'),
        });
        await expectProblem(response, 'unsupported-media-type');
      });

      it('accepts a media type with spaces around its parameter (RFC 9110)', async () => {
        const loaded = await loadSpace(host(), META);
        const response = await postCommit(
          host(),
          renameCommitText(loaded, 'Spaced'),
          'application/json ; charset=UTF-8',
        );
        expect(response.status).toBe(200);
      });

      it(`commits a body of exactly ${String(MAX_COMMIT_BODY_BYTES)} bytes`, async () => {
        const loaded = await loadSpace(host(), META);
        const body = paddedTo(renameCommitText(loaded, 'At the limit'), MAX_COMMIT_BODY_BYTES);
        expect((await postCommit(host(), body)).status).toBe(200);
      });

      it(`answers 413 payload-too-large for a body of ${String(MAX_COMMIT_BODY_BYTES + 1)} bytes`, async () => {
        const loaded = await loadSpace(host(), META);
        const body = paddedTo(renameCommitText(loaded, 'Too large'), MAX_COMMIT_BODY_BYTES + 1);
        const response = await postCommit(host(), body);
        expectApiPolicy(response);
        await expectProblem(response, 'payload-too-large');
        expect((await loadSpace(host(), META)).revision).toBe(loaded.revision);
      });
    });

    // `POST /assets` and `GET /assets/:hash` (`packages/http/src/index.ts`),
    // admitted and hashed by `packages/persistence/src/assets.ts`.
    describe('assets', () => {
      it('stores an asset at its hash, 201 the first time and 200 after', async () => {
        const bytes = freshBytes(64);
        const url = `/assets/${assetHash(bytes)}`;
        const first = await postAsset(host(), bytes, { 'content-type': 'image/png' });
        expect(first.status).toBe(201);
        expect(first.headers.get('location')).toBe(url);
        expectJson(first);
        expectApiPolicy(first);
        expect(decodeStoredAssetUrl(await first.json())).toBe(url);
        const again = await postAsset(host(), bytes, { 'content-type': 'image/png' });
        expect(again.status).toBe(200);
        expect(decodeStoredAssetUrl(await again.json())).toBe(url);
      });

      it('serves a stored picture as itself, immutable and sandboxed', async () => {
        const bytes = freshBytes(32);
        await postAsset(host(), bytes, { 'content-type': 'image/png' });
        const response = await send(host(), `/assets/${assetHash(bytes)}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get(ASSET_MEDIA_TYPE_HEADER)).toBe('image/png');
        expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
      });

      it('serves any other stored type as inert bytes, naming the type it was stored as', async () => {
        const bytes = freshBytes(16);
        await postAsset(host(), bytes, { 'content-type': 'text/html' });
        const response = await send(host(), `/assets/${assetHash(bytes)}`);
        expect(response.headers.get('content-type')).toBe('application/octet-stream');
        expect(response.headers.get(ASSET_MEDIA_TYPE_HEADER)).toBe('text/html');
      });

      it('answers HEAD for a stored asset without its bytes', async () => {
        const bytes = freshBytes(16);
        await postAsset(host(), bytes, { 'content-type': 'image/png' });
        const response = await send(host(), `/assets/${assetHash(bytes)}`, { method: 'HEAD' });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect((await response.arrayBuffer()).byteLength).toBe(0);
      });

      it('answers 404 not-found for a hash no asset is stored at', async () => {
        await expectProblem(await send(host(), `/assets/${UNSTORED_HASH}`), 'not-found');
      });

      it('answers 415 unsupported-media-type for an encoded asset', async () => {
        const response = await postAsset(host(), freshBytes(8), {
          'content-type': 'image/png',
          'content-encoding': 'gzip',
        });
        await expectProblem(response, 'unsupported-media-type');
      });

      it(`stores an asset of exactly ${String(MAX_ASSET_BYTES)} bytes`, async () => {
        const response = await postAsset(host(), freshBytes(MAX_ASSET_BYTES), {
          'content-type': 'application/octet-stream',
        });
        expect(response.status).toBe(201);
      });

      it(`answers 413 asset-too-large for an asset of ${String(MAX_ASSET_BYTES + 1)} bytes`, async () => {
        const bytes = freshBytes(MAX_ASSET_BYTES + 1);
        const response = await postAsset(host(), bytes, {
          'content-type': 'application/octet-stream',
        });
        expectApiPolicy(response);
        await expectProblem(response, 'asset-too-large');
        await expectProblem(await send(host(), `/assets/${assetHash(bytes)}`), 'not-found');
      });
    });

    // Product addresses: `resolveProductRequest` (`packages/aggregate/src/space-host.ts`)
    // over `productAddress` (`packages/http/src/product-destination.ts`).
    describe('product addresses', () => {
      it.each(['GET', 'HEAD'])('redirects %s / to the Meta Space with 302', async (method) => {
        const response = await send(host(), '/', { method });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(spaceAddress(META));
      });

      it.each([
        ['/', 'POST'],
        [spaceAddress(META), 'POST'],
        [`${spaceAddress(META)}/notes`, 'DELETE'],
      ])(
        'answers 405 method-not-allowed to %s by %s, allowing GET and HEAD',
        async (pathname, method) => {
          const response = await send(host(), pathname, { method });
          expect(response.headers.get('allow')).toBe('GET, HEAD');
          await expectProblem(response, 'method-not-allowed');
        },
      );

      it.each([
        ['GET', '/spaces'],
        ['GET', '/spaces/not-an-id'],
        ['GET', `${spaceAddress(META)}/nowhere`],
        ['POST', '/spaces/not-an-id'],
      ])('answers 400 invalid-request to %s %s, which cannot be read', async (method, pathname) => {
        await expectProblem(await send(host(), pathname, { method }), 'invalid-request');
      });

      it('answers 404 not-found for an address naming no Space', async () => {
        await expectProblem(await send(host(), spaceAddress(UNKNOWN_SPACE)), 'not-found');
      });

      it('answers its refusals as HTML to a request that accepts it', async () => {
        const accept = { accept: 'text/html,application/xhtml+xml;q=0.9' };
        await expectHtmlProblem(await send(host(), '/spaces', { headers: accept }), 400);
        await expectHtmlProblem(
          await send(host(), spaceAddress(UNKNOWN_SPACE), { headers: accept }),
          404,
        );
        const refused = await send(host(), '/', { method: 'POST', headers: accept });
        expect(refused.headers.get('allow')).toBe('GET, HEAD');
        await expectHtmlProblem(refused, 405);
      });
    });

    // The shell and the built files around it: `src/desktop/desktop-handler.ts`
    // and `src/desktop/static-files.ts`.
    describe('the application shell', () => {
      const expectShell = async (response: Response): Promise<string> => {
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('cache-control')).toBe('no-store');
        const page = await response.text();
        // ST-115: Mounting's policy (ST-94) with no GitHub host, each inline
        // script of this page admitted by its hash.
        const policy = response.headers.get('content-security-policy') ?? '';
        expect(directivesOf(policy)).toEqual(
          directivesOf(contentSecurityPolicy(inlineScriptSources(page), [])),
        );
        expect(policy).not.toMatch(/github/i);
        if (options.builtApplication === 'stand-in') expect(page).toBe(STAND_IN_BUILD.page);
        return page;
      };

      it('serves the shell for a product address that resolves', async () => {
        const page = await expectShell(await send(host(), spaceAddress(META)));
        await expectShell(await send(host(), `${spaceAddress(META)}/notes`)).then((other) =>
          expect(other).toBe(page),
        );
      });

      it('falls back to the shell for an address that is not the application’s', async () => {
        const page = await expectShell(await send(host(), spaceAddress(META)));
        expect(await expectShell(await send(host(), '/somewhere/else'))).toBe(page);
      });

      it('answers HEAD for the shell without its body', async () => {
        const response = await send(host(), '/somewhere/else', { method: 'HEAD' });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect((await response.arrayBuffer()).byteLength).toBe(0);
      });

      it('answers 405 to a write to an address that is not the application’s', async () => {
        const response = await send(host(), '/somewhere/else', { method: 'POST', body: 'x' });
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
      });

      it.skipIf(options.builtApplication !== 'stand-in')(
        'serves a content-named built file as immutable',
        async () => {
          const response = await send(host(), STAND_IN_BUILD.script.pathname);
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
          expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
          expect(response.headers.get('x-content-type-options')).toBe('nosniff');
          expect(await response.text()).toBe(STAND_IN_BUILD.script.text);
        },
      );

      it.skipIf(options.builtApplication !== 'stand-in')(
        'serves another built file to be revalidated',
        async () => {
          const response = await send(host(), STAND_IN_BUILD.icon.pathname);
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toBe('image/svg+xml');
          expect(response.headers.get('cache-control')).toBe('no-cache');
          expect(await response.text()).toBe(STAND_IN_BUILD.icon.text);
        },
      );

      // ST-115: a request under `/assets/` that names no built file goes to the
      // Fetch application, which refuses a malformed hash (ST-76).
      it.each(['/assets/index-missing.js', `/assets/..%2f..%2f${STAND_IN_BUILD.outside.name}`])(
        'answers 400 invalid-asset-hash, and no file, for %s',
        async (pathname) => {
          await expectProblem(await send(host(), pathname), 'invalid-asset-hash');
        },
      );
    });
  });
};
