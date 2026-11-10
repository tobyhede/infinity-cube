import type { AssetRef } from '@project/core';
import { servedMediaType, type AssetClient, type AssetRefusal } from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES, storePicture } from '../src/picture-admission';

const ascii = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ascii('IHDR')]);

describe('storing a picture as an asset', () => {
  const STORED: AssetRef = `/assets/${'A'.repeat(43)}`;

  const recordingAssets = (answer: AssetRef | AssetRefusal = STORED) => {
    const store = vi.fn((_bytes: Blob) => Promise.resolve(answer));
    const assets: AssetClient = {
      url: (ref) => ref,
      read: () => Promise.resolve({ refused: 'asset-absent' }),
      store,
    };
    return { assets, store };
  };

  it('stores a picture under the type its bytes are, whatever the file declared', async () => {
    const { assets, store } = recordingAssets();

    await expect(storePicture(assets, new Blob([png], { type: 'text/plain' }))).resolves.toEqual({
      kind: 'stored',
      url: STORED,
    });
    const [sent] = store.mock.calls[0] ?? [];
    expect(sent?.type).toBe('image/png');
    expect(new Uint8Array(await (sent ?? new Blob()).arrayBuffer())).toEqual(png);
  });

  it('answers the size its header gives, read as Replace reads it', async () => {
    const { assets } = recordingAssets();
    const sized = Uint8Array.from([
      ...png.subarray(0, 8),
      0,
      0,
      0,
      13,
      ...ascii('IHDR'),
      0,
      0,
      1,
      144,
      0,
      0,
      1,
      44,
    ]);

    await expect(storePicture(assets, new Blob([sized]))).resolves.toEqual({
      kind: 'stored',
      url: STORED,
      naturalSize: { width: 400, height: 300 },
    });
  });

  it('refuses what is not a picture without storing it', async () => {
    const { assets, store } = recordingAssets();

    await expect(storePicture(assets, new Blob([ascii('<svg/>')]))).resolves.toEqual({
      kind: 'refused',
      code: 'image-svg-unsupported',
    });
    await expect(storePicture(assets, new Blob([ascii('hello')]))).resolves.toEqual({
      kind: 'refused',
      code: 'image-format-unsupported',
    });
    expect(store).not.toHaveBeenCalled();
  });

  it('refuses a picture over the limit without reading or storing it', async () => {
    const { assets, store } = recordingAssets();

    await expect(
      storePicture(assets, new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)])),
    ).resolves.toEqual({ kind: 'refused', code: 'image-too-large' });
    expect(store).not.toHaveBeenCalled();
  });

  it("answers the host's size refusal as the picture's, so the author reads why", async () => {
    const { assets } = recordingAssets({ refused: 'asset-too-large' });

    await expect(storePicture(assets, new Blob([png]))).resolves.toEqual({
      kind: 'refused',
      code: 'image-too-large',
    });
  });

  it('throws when the asset store answers a refusal a picture cannot be given', async () => {
    const { assets } = recordingAssets({ refused: 'asset-absent' });

    await expect(storePicture(assets, new Blob([png]))).rejects.toThrow('asset-absent');
  });
});
