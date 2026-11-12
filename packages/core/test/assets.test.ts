import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assetRef,
  assetRefHash,
  assetRefSchema,
  assetReferences,
  EMPTY_ASSET_HASH,
  EMPTY_ASSET_REF,
  isAssetHash,
  isAssetRef,
} from '../src/assets';

const A = `/assets/${'A'.repeat(43)}` as const;
const B = `/assets/${'A'.repeat(42)}E` as const;

describe('an asset reference', () => {
  it('is /assets/ and a canonical hash, as a whole string', () => {
    expect(isAssetRef(A)).toBe(true);
    expect(isAssetRef(EMPTY_ASSET_REF)).toBe(true);
    for (const value of [
      '/assets/',
      '/assets',
      `${A}.png`,
      `${A}/`,
      ` ${A}`,
      `see ${A}`,
      `https://example.com${A}`,
      `/assets/${'A'.repeat(42)}B`,
      '/assets/index-Bq3xY1aZ.js',
      `/images/${'A'.repeat(43)}`,
      42,
      null,
    ]) {
      expect(isAssetRef(value)).toBe(false);
    }
  });

  it('parses through the schema a plugin and the walk share', () => {
    expect(assetRefSchema.parse(A)).toBe(A);
    expect(assetRefSchema.safeParse(`${A}.png`).success).toBe(false);
  });

  it('round-trips its hash', () => {
    expect(assetRefHash(assetRef(EMPTY_ASSET_HASH))).toBe(EMPTY_ASSET_HASH);
    expect(isAssetHash(EMPTY_ASSET_HASH)).toBe(true);
  });
});

describe('the walk for asset references', () => {
  it('finds whole string values at any depth of arrays and objects, once each', () => {
    const content = {
      url: A,
      nested: { deeper: [{ src: B }, A], caption: `not ${A}` },
      list: [B, 'plain', 3, true, null],
    };

    expect(assetReferences(content)).toEqual([A, B]);
  });

  it('finds references in content no kind declares, and in Map-like content', () => {
    const unknownPluginContent = { blocks: [{ kind: 'figure', file: A }] };
    const mapContent = { open: true, shape: 'rounded', background: B };

    expect(assetReferences(unknownPluginContent)).toEqual([A]);
    expect(assetReferences(mapContent)).toEqual([B]);
  });

  it('reads no object key as a reference', () => {
    expect(assetReferences({ [A]: 'value' })).toEqual([]);
  });

  it('finds a reference standing alone', () => {
    expect(assetReferences(A)).toEqual([A]);
    expect(assetReferences(undefined)).toEqual([]);
  });

  it('finds exactly the references a value holds, wherever they are placed', () => {
    const refs = [A, B, EMPTY_ASSET_REF];
    fc.assert(
      fc.property(fc.subarray(refs), fc.jsonValue({ maxDepth: 3 }), (chosen, noise) => {
        const value = { noise, held: chosen.map((ref) => ({ inner: [ref] })) };
        const found = assetReferences(value);
        for (const ref of chosen) expect(found).toContain(ref);
        for (const ref of found) expect(isAssetRef(ref)).toBe(true);
      }),
    );
  });
});
