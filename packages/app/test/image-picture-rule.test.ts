import { MAX_ASSET_BYTES, servedMediaType } from '@project/persistence';
import { IMAGE_MEDIA_TYPES, MAX_IMAGE_BYTES } from '@project/plugin-image/domain';
import { describe, expect, it } from 'vitest';

describe("an Image Resource's picture rule, as the host stores and serves it", () => {
  it('caps a picture at the asset store cap', () => {
    expect(MAX_IMAGE_BYTES).toBe(MAX_ASSET_BYTES);
  });

  it('admits only formats the host serves under their own type, so every stored picture draws', () => {
    expect(IMAGE_MEDIA_TYPES.map(servedMediaType)).toEqual([...IMAGE_MEDIA_TYPES]);
  });
});
