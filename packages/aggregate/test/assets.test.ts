import { EMPTY_ASSET_HASH } from '@project/core';
import { describe, expect, it } from 'vitest';
import { assetPathHash } from '../src/assets';

describe('assetPathHash', () => {
  it('names the hash of a file in assets/ by its name, with or without an extension', () => {
    expect(assetPathHash(`assets/${EMPTY_ASSET_HASH}.png`)).toBe(EMPTY_ASSET_HASH);
    expect(assetPathHash(`assets/${EMPTY_ASSET_HASH}`)).toBe(EMPTY_ASSET_HASH);
  });

  it('names no hash for a path outside assets/ or a name that is not a hash', () => {
    expect(assetPathHash(`${EMPTY_ASSET_HASH}.png`)).toBeUndefined();
    expect(assetPathHash(`images/${EMPTY_ASSET_HASH}.png`)).toBeUndefined();
    expect(assetPathHash('assets/picture.png')).toBeUndefined();
  });
});
