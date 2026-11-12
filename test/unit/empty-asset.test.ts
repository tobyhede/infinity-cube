import { describe, expect, it } from 'vitest';
import { EMPTY_ASSET_HASH, EMPTY_ASSET_REF } from '@project/core';
import { assetHashOf, EMPTY_ASSET } from '@project/persistence';
import { EMPTY_ASSET as PLUGIN_EMPTY_ASSET } from '@project/resource-api/domain';

/**
 * The asset of zero bytes is named in two packages that may not import each
 * other: `core`, which the stores derive theirs from, and the Resource API,
 * which a plugin reaches without `core`. Each writes the hash out, so this
 * holds both to the SHA-256 of nothing.
 */
describe('the empty asset', () => {
  it('is the hash of zero bytes wherever it is named', async () => {
    expect(await assetHashOf(new Uint8Array(0))).toBe(EMPTY_ASSET_HASH);
    expect(EMPTY_ASSET.hash).toBe(EMPTY_ASSET_HASH);
    expect(EMPTY_ASSET_REF).toBe(`/assets/${EMPTY_ASSET_HASH}`);
    expect(PLUGIN_EMPTY_ASSET).toBe(EMPTY_ASSET_REF);
  });
});
