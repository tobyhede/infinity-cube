import { describe, expect, it } from 'vitest';
import { isAssetRef, type AssetRef } from '@project/core';
import type { AssetClient } from '@project/persistence';
import { browserPluginAssets } from '../src/space';

const REF: AssetRef = `/assets/${'A'.repeat(43)}`;

/** An asset store answering each read and store with `refused`. */
const refusing = (refused: string): AssetClient => ({
  url: (ref) => ref,
  read: () => Promise.resolve({ refused }),
  store: () => Promise.resolve({ refused }),
});

describe("a plugin's asset store", () => {
  it.each([
    ['asset-too-large', /larger than 10 MB/u],
    ['asset-absent', /not stored here/u],
  ])('words the store’s %s refusal before a plugin reads it', async (code, sentence) => {
    const assets = browserPluginAssets(refusing(code));

    const stored = await assets.store?.(new Blob(['x']));
    const read = await assets.read(REF);

    if (stored === undefined || isAssetRef(stored)) throw new Error('Expected a refusal.');
    if (!('refused' in read)) throw new Error('Expected a refusal.');
    for (const { refused } of [stored, read]) {
      expect(refused).toMatch(sentence);
      expect(refused).not.toContain(code);
    }
  });

  it('words a refusal it has no sentence for without naming its code', async () => {
    const read = await browserPluginAssets(refusing('asset-unheard-of')).read(REF);

    if (!('refused' in read)) throw new Error('Expected a refusal.');
    expect(read.refused).toMatch(/\S/u);
    expect(read.refused).not.toContain('asset-unheard-of');
  });

  it('answers what the store holds unchanged', async () => {
    const bytes = new Blob(['held']);
    const assets = browserPluginAssets({
      url: (ref) => `blob:${ref}`,
      read: () => Promise.resolve(bytes),
      store: () => Promise.resolve(REF),
    });

    expect(assets.url(REF)).toBe(`blob:${REF}`);
    await expect(assets.read(REF)).resolves.toBe(bytes);
    await expect(assets.store?.(bytes)).resolves.toBe(REF);
  });
});
