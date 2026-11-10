import { EMPTY_ASSET_HASH, type UUID } from '@project/core';
import {
  decodeProblemDetails,
  isAssetHash,
  MAX_ASSET_BYTES,
  PersistenceUnavailableError,
  problemCatalogue,
  withEmptyAsset,
  type AssetHash,
  type AssetStore,
  type InfinityCubeProblemCode,
  type StoredAsset,
  type StoredSpaceRepository,
} from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import { createSpaceHttpApp } from '@project/http';

/** A request that initializes no Space mints nothing, so any mint is a failure here. */
const mintsNothing = (): UUID => {
  throw new Error('This request initializes no Space, so it mints no identity.');
};

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gif = new TextEncoder().encode('GIF89a\u0001\u0000');
const webp = Uint8Array.from([
  ...new TextEncoder().encode('RIFF'),
  0x24,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBPVP8 '),
]);
const text = new TextEncoder().encode('hello');
const binary = Uint8Array.from([0x00, 0x01, 0xff]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

/** Each fixture's SHA-256 as unpadded base64url, computed independently. */
const HASH_OF = new Map<Uint8Array, string>([
  [png, 'KJx3oXmDEwnD1FBZUrDl_2u5HAtMb2ip2ose1tOMXmQ'],
  [jpeg, '_BbX3O6croPvOSMiKoHM2P6WydJf239QTWbxAR4M2HA'],
  [gif, 'p6PtpkQdE3zM75cA-jeMAJnWRxRr6RZ973Bb-Gu2NOw'],
  [webp, 'wokEl2aqsUbIIOwKOzCPR0v1Iyf2TmoksIe80m-V1KA'],
  [text, 'LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ'],
  [binary, 'JqZrBh6PSPOZJ8MS8lKTlZcp7ulZeOKJLUnTUSpcwJI'],
  [svg, 'kA--k0JJrRIABL0krfZqrYgX2JWGJzwMxQ4Ye93rtgE'],
]);
const hashOf = (bytes: Uint8Array): string => {
  const hash = HASH_OF.get(bytes);
  if (hash === undefined) throw new Error('No independently computed hash for these bytes');
  return hash;
};

/** A hash that is well formed and names nothing stored. */
const UNKNOWN_HASH = 'A'.repeat(43);

/**
 * A repository whose Space members fail the test if reached — every asset
 * request is answered without reading a Space — over a store holding assets in
 * a `Map`, answering the asset of zero bytes as every store does.
 */
const repository = () => {
  const assets = new Map<AssetHash, StoredAsset>();
  const readsSpace = vi.fn(() => Promise.reject(new Error('An asset request read a Space')));
  const storeAsset = vi.fn((asset: StoredAsset) => {
    if (assets.has(asset.hash)) return Promise.resolve('existing' as const);
    assets.set(asset.hash, asset);
    return Promise.resolve('stored' as const);
  });
  const loadAsset = vi.fn((hash: AssetHash) =>
    Promise.resolve(withEmptyAsset(hash, assets.get(hash))),
  );
  const store: StoredSpaceRepository & AssetStore = {
    listSpaces: readsSpace,
    loadSpace: readsSpace,
    loadAggregate: readsSpace,
    commit: readsSpace,
    storeAsset,
    loadAsset,
  };
  return { store, assets, readsSpace, storeAsset, loadAsset };
};

const post = (app: ReturnType<typeof createSpaceHttpApp>, body: BodyInit, type?: string) =>
  app.request('/assets', {
    method: 'POST',
    headers: type === undefined ? {} : { 'Content-Type': type },
    body,
  });

const expectProblem = async (response: Response, code: InfinityCubeProblemCode) => {
  expect(response.status).toBe(problemCatalogue[code].status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  expect(decodeProblemDetails(await response.json()).type).toBe(problemCatalogue[code].type);
};

describe('storing an asset', () => {
  it.each([
    ['PNG', png, 'image/png'],
    ['JPEG', jpeg, 'image/jpeg'],
    ['GIF', gif, 'image/gif'],
    ['WebP', webp, 'image/webp'],
  ] as const)(
    'answers a stored %s picture at its content address, and serves it there inline',
    async (_, bytes, type) => {
      const { store, readsSpace } = repository();
      const app = createSpaceHttpApp(store, { newId: mintsNothing });

      const stored = await post(app, bytes, type);

      const url = `/assets/${hashOf(bytes)}`;
      expect(stored.status).toBe(201);
      expect(stored.headers.get('location')).toBe(url);
      expect(stored.headers.get('content-type')).toBe('application/json; charset=utf-8');
      await expect(stored.json()).resolves.toEqual({ url });

      const served = await app.request(url);
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe(type);
      expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(served.headers.get('x-content-type-options')).toBe('nosniff');
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
      expect(readsSpace).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['text', text, 'text/markdown; charset=utf-8', 'text/markdown'],
    ['binary bytes', binary, 'application/x-made-up', 'application/x-made-up'],
    ['an SVG', svg, 'image/svg+xml', 'image/svg+xml'],
    ['HTML', text, 'text/html', 'text/html'],
    ['bytes declared as nothing', binary, undefined, 'application/octet-stream'],
    ['bytes declared as nonsense', binary, 'not a type', 'application/octet-stream'],
  ] as const)(
    'admits %s under the declared media type, whatever it is',
    async (_, bytes, declared, mediaType) => {
      const { store, assets } = repository();
      const app = createSpaceHttpApp(store, { newId: mintsNothing });

      const stored = await post(app, bytes, declared);

      expect(stored.status).toBe(201);
      await expect(stored.json()).resolves.toEqual({ url: `/assets/${hashOf(bytes)}` });
      expect([...assets.values()].map((asset) => asset.mediaType)).toEqual([mediaType]);
    },
  );

  it('admits zero bytes, as the asset of zero bytes', async () => {
    const { store } = repository();
    const stored = await post(createSpaceHttpApp(store, { newId: mintsNothing }), new Uint8Array());

    await expect(stored.json()).resolves.toEqual({ url: `/assets/${EMPTY_ASSET_HASH}` });
  });

  it('answers the same URL for the same bytes, stores them once, and keeps the first type', async () => {
    const { store, assets } = repository();
    const app = createSpaceHttpApp(store, { newId: mintsNothing });

    const first = await post(app, png, 'image/png');
    const second = await post(app, png, 'text/plain');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers.get('location')).toBe(`/assets/${hashOf(png)}`);
    await expect(second.json()).resolves.toEqual({ url: `/assets/${hashOf(png)}` });
    expect(assets.size).toBe(1);
    expect((await app.request(`/assets/${hashOf(png)}`)).headers.get('content-type')).toBe(
      'image/png',
    );
  });

  it('refuses a body over 10 MiB by counting what arrives, storing nothing', async () => {
    const { store, storeAsset } = repository();
    const oversized = new Uint8Array(MAX_ASSET_BYTES + 1);

    await expectProblem(
      await post(createSpaceHttpApp(store, { newId: mintsNothing }), oversized),
      'asset-too-large',
    );
    expect(storeAsset).not.toHaveBeenCalled();
  });

  it('stores an asset of exactly 10 MiB', async () => {
    const { store } = repository();
    const atLimit = new Uint8Array(MAX_ASSET_BYTES);

    expect((await post(createSpaceHttpApp(store, { newId: mintsNothing }), atLimit)).status).toBe(
      201,
    );
  });

  it('refuses an encoded body rather than storing the encoding', async () => {
    const { store, storeAsset } = repository();
    const response = await createSpaceHttpApp(store, { newId: mintsNothing }).request('/assets', {
      method: 'POST',
      headers: { 'Content-Encoding': 'gzip' },
      body: png,
    });
    await expectProblem(response, 'unsupported-media-type');
    expect(storeAsset).not.toHaveBeenCalled();
  });

  it('answers an unreachable store as unavailable', async () => {
    const { store } = repository();
    store.storeAsset = () => Promise.reject(new PersistenceUnavailableError('down'));
    const logError = vi.fn();

    await expectProblem(
      await post(createSpaceHttpApp(store, { newId: mintsNothing, logError }), png),
      'persistence-unavailable',
    );
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('serving an asset', () => {
  it.each([
    ['an SVG', svg, 'image/svg+xml'],
    ['HTML', text, 'text/html'],
    ['JavaScript', text, 'text/javascript'],
    ['text', text, 'text/markdown'],
    ['binary bytes', binary, 'application/x-made-up'],
  ] as const)(
    'serves %s as application/octet-stream, never as active content',
    async (_, bytes, type) => {
      const { store } = repository();
      const app = createSpaceHttpApp(store, { newId: mintsNothing });
      await post(app, bytes, type);

      const served = await app.request(`/assets/${hashOf(bytes)}`);

      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe('application/octet-stream');
      expect(served.headers.get('x-content-type-options')).toBe('nosniff');
      expect(served.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
    },
  );

  it('serves the asset of zero bytes though nothing stored it', async () => {
    const { store } = repository();

    const served = await createSpaceHttpApp(store, { newId: mintsNothing }).request(
      `/assets/${EMPTY_ASSET_HASH}`,
    );

    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('application/octet-stream');
    expect((await served.arrayBuffer()).byteLength).toBe(0);
  });

  it('answers 404 for a well-formed hash nothing is stored at', async () => {
    const { store, readsSpace } = repository();
    expect(isAssetHash(UNKNOWN_HASH)).toBe(true);

    await expectProblem(
      await createSpaceHttpApp(store, { newId: mintsNothing }).request(`/assets/${UNKNOWN_HASH}`),
      'not-found',
    );
    expect(readsSpace).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'A'.repeat(42)],
    ['padded', `${'A'.repeat(43)}=`],
    ['outside base64url', `${'A'.repeat(42)}+`],
    ['a non-canonical final digit', `${'A'.repeat(42)}B`],
    ['a built script', 'index-Bq3xY1.js'],
    ['a UUID', '00000000-0000-4000-8000-000000000001'],
  ])('answers 400 for a hash that is %s, without reading anything', async (_, hash) => {
    const { store, readsSpace, loadAsset } = repository();

    await expectProblem(
      await createSpaceHttpApp(store, { newId: mintsNothing }).request(
        `/assets/${encodeURIComponent(hash)}`,
      ),
      'invalid-asset-hash',
    );
    expect(loadAsset).not.toHaveBeenCalled();
    expect(readsSpace).not.toHaveBeenCalled();
  });

  it('answers HEAD with the headers GET would carry', async () => {
    const { store } = repository();
    const app = createSpaceHttpApp(store, { newId: mintsNothing });
    await post(app, png, 'image/png');

    const response = await app.request(`/assets/${hashOf(png)}`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it.each([
    ['the collection', '/assets', 'GET', 'POST'],
    ['an asset', `/assets/${UNKNOWN_HASH}`, 'DELETE', 'GET, HEAD'],
    ['an asset', `/assets/${UNKNOWN_HASH}`, 'PUT', 'GET, HEAD'],
  ])('answers 405 for %s under %s, naming what is allowed', async (_, path, method, allow) => {
    const { store } = repository();
    const response = await createSpaceHttpApp(store, { newId: mintsNothing }).request(path, {
      method,
    });

    await expectProblem(response, 'method-not-allowed');
    expect(response.headers.get('allow')).toBe(allow);
  });

  it('answers 400 for a malformed hash whatever the method', async () => {
    const { store } = repository();
    await expectProblem(
      await createSpaceHttpApp(store, { newId: mintsNothing }).request('/assets/nope', {
        method: 'DELETE',
      }),
      'invalid-asset-hash',
    );
  });
});
