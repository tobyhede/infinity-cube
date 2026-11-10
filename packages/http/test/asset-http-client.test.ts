import { EMPTY_ASSET_REF, type AssetRef, type UUID } from '@project/core';
import {
  encodeProblemDetails,
  MAX_ASSET_BYTES,
  withEmptyAsset,
  type AssetHash,
  type AssetStore,
  type StoredAsset,
  type StoredSpaceRepository,
} from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { createSpaceHttpApp, httpAssetClient, HttpSpaceBackend } from '@project/http';

/** A request that initializes no Space mints nothing, so any mint is a failure here. */
const mintsNothing = (): UUID => {
  throw new Error('This request initializes no Space, so it mints no identity.');
};

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
/** `png`'s SHA-256 as unpadded base64url, computed independently. */
const PNG_URL = '/assets/KJx3oXmDEwnD1FBZUrDl_2u5HAtMb2ip2ose1tOMXmQ';
const text = new TextEncoder().encode('hello');
const TEXT_URL = '/assets/LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ';

/** The real Fetch application over an in-memory store, reached as the browser reaches it. */
const backendOverHost = () => {
  const assets = new Map<AssetHash, StoredAsset>();
  const readsSpace = () => Promise.reject(new Error('An asset request read a Space'));
  const store: StoredSpaceRepository & AssetStore = {
    listSpaces: readsSpace,
    loadSpace: readsSpace,
    loadAggregate: readsSpace,
    commit: readsSpace,
    storeAsset: (asset) => {
      if (assets.has(asset.hash)) return Promise.resolve('existing');
      assets.set(asset.hash, asset);
      return Promise.resolve('stored');
    },
    loadAsset: (hash) => Promise.resolve(withEmptyAsset(hash, assets.get(hash))),
  };
  const app = createSpaceHttpApp(store, { newId: mintsNothing });
  const backend = new HttpSpaceBackend('http://example.test', {
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  return { backend, assets };
};

describe('the asset client over HTTP', () => {
  it('stores bytes under the Blob type, answering the same reference every time', async () => {
    const { backend, assets } = backendOverHost();
    const client = httpAssetClient(backend);

    await expect(client.store(new Blob([png], { type: 'image/png' }))).resolves.toBe(PNG_URL);
    await expect(client.store(new Blob([png], { type: 'text/plain' }))).resolves.toBe(PNG_URL);
    expect([...assets.values()].map(({ mediaType }) => mediaType)).toEqual(['image/png']);
  });

  it('stores text and zero bytes, and reads each back', async () => {
    const { backend } = backendOverHost();
    const client = httpAssetClient(backend);

    const ref = await client.store(new Blob([text], { type: 'text/markdown' }));
    expect(ref).toBe(TEXT_URL);
    const read = await client.read(TEXT_URL);
    if (!(read instanceof Blob)) throw new Error('Expected the stored text');
    await expect(read.text()).resolves.toBe('hello');

    await expect(client.store(new Blob([]))).resolves.toBe(EMPTY_ASSET_REF);
    const empty = await client.read(EMPTY_ASSET_REF);
    if (!(empty instanceof Blob)) throw new Error('Expected the asset of zero bytes');
    expect(empty.size).toBe(0);
  });

  it('answers refused when the bytes are absent', async () => {
    const { backend } = backendOverHost();
    const absent: AssetRef = `/assets/${'A'.repeat(43)}`;

    await expect(httpAssetClient(backend).read(absent)).resolves.toEqual({
      refused: 'asset-absent',
    });
  });

  it('answers url as authored unless told where an asset is drawn from', () => {
    const { backend } = backendOverHost();

    expect(httpAssetClient(backend).url(PNG_URL)).toBe(PNG_URL);
    expect(httpAssetClient(backend, () => 'blob:drawn').url(PNG_URL)).toBe('blob:drawn');
  });

  it('answers asset-too-large for bytes over the limit without sending them', async () => {
    let sent = false;
    const backend = new HttpSpaceBackend('http://example.test', {
      fetch: () => {
        sent = true;
        return Promise.reject(new Error('An oversized asset was sent'));
      },
    });

    await expect(
      backend.storeAsset(new Blob([new Uint8Array(MAX_ASSET_BYTES + 1)])),
    ).resolves.toEqual({ refused: 'asset-too-large' });
    expect(sent).toBe(false);
  });

  it('throws on an answer that is neither a stored URL nor a refusal', async () => {
    const body = encodeProblemDetails('internal-error', 'Broken');
    const backend = new HttpSpaceBackend('http://example.test', {
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: body.status,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        ),
    });

    await expect(backend.storeAsset(new Blob([png]))).rejects.toThrow(/HTTP 500/u);
    await expect(backend.readAsset(PNG_URL)).rejects.toThrow(/HTTP 500/u);
  });

  it('throws on a stored answer naming something other than an asset reference', async () => {
    const backend = new HttpSpaceBackend('http://example.test', {
      fetch: () =>
        Promise.resolve(Response.json({ url: 'https://example.test/a.png' }, { status: 201 })),
    });

    await expect(backend.storeAsset(new Blob([png]))).rejects.toThrow();
  });
});
