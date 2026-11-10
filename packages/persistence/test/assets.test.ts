import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  admitAsset,
  assetHashOf,
  assetPath,
  EMPTY_ASSET,
  extensionForMediaType,
  MAX_ASSET_BYTES,
  mediaTypeForExtension,
  normalizeMediaType,
  servedMediaType,
  withEmptyAsset,
} from '../src/assets';

/** SHA-256 spelled as unpadded base64url, computed by Node's own hash rather than the module's. */
const expectedHash = (content: Uint8Array): string =>
  createHash('sha256').update(content).digest('base64url');

const text = new TextEncoder().encode('# Notes\n');

describe('admitting an asset', () => {
  it.each([
    ['text', text, 'text/markdown', 'text/markdown'],
    [
      'binary bytes',
      Uint8Array.from([0, 255, 16]),
      'application/x-made-up',
      'application/x-made-up',
    ],
    ['an SVG', new TextEncoder().encode('<svg/>'), 'image/svg+xml', 'image/svg+xml'],
    ['zero bytes', new Uint8Array(), '', 'application/octet-stream'],
  ] as const)(
    'admits %s under its declared type, named by its SHA-256',
    async (_, bytes, declared, type) => {
      await expect(admitAsset(bytes, declared)).resolves.toEqual({
        kind: 'admitted',
        asset: { hash: expectedHash(bytes), mediaType: type, bytes },
      });
    },
  );

  it('keeps an admitted asset named by its bytes when the caller later changes theirs', async () => {
    const content = text.slice();
    const admission = await admitAsset(content, 'text/plain');
    content.fill(0);
    if (admission.kind !== 'admitted') throw new Error('expected the text to be admitted');
    expect(admission.asset.hash).toBe(expectedHash(text));
    expect(admission.asset.bytes).toEqual(text);
  });

  it('admits exactly the size limit and refuses one byte more', async () => {
    await expect(admitAsset(new Uint8Array(MAX_ASSET_BYTES), '')).resolves.toMatchObject({
      kind: 'admitted',
    });
    await expect(admitAsset(new Uint8Array(MAX_ASSET_BYTES + 1), '')).resolves.toEqual({
      kind: 'refused',
      code: 'asset-too-large',
    });
    expect(MAX_ASSET_BYTES).toBe(10_485_760);
  });

  it('is addressed under /assets', async () => {
    expect(assetPath(await assetHashOf(text))).toBe(`/assets/${expectedHash(text)}`);
  });
});

describe('a declared media type', () => {
  it.each([
    ['text/Markdown; charset=utf-8', 'text/markdown'],
    ['IMAGE/PNG', 'image/png'],
    ['', 'application/octet-stream'],
    ['not a type', 'application/octet-stream'],
    ['text/', 'application/octet-stream'],
  ])('reads %j as %s', (declared, type) => {
    expect(normalizeMediaType(declared)).toBe(type);
  });
});

describe('the host table of extensions and media types', () => {
  it.each([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['PNG', 'image/png'],
    ['md', 'text/markdown'],
    ['mermaid', 'application/octet-stream'],
    ['', 'application/octet-stream'],
  ])('maps .%s to %s', (extension, type) => {
    expect(mediaTypeForExtension(extension)).toBe(type);
  });

  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['text/markdown', 'md'],
    ['application/octet-stream', 'bin'],
    ['application/x-made-up', 'bin'],
  ])('writes %s with .%s', (type, extension) => {
    expect(extensionForMediaType(type)).toBe(extension);
  });
});

describe('the media type an asset is served under', () => {
  it.each([
    ['image/png', 'image/png'],
    ['image/jpeg', 'image/jpeg'],
    ['image/webp', 'image/webp'],
    ['image/gif', 'image/gif'],
    ['image/svg+xml', 'application/octet-stream'],
    ['text/html', 'application/octet-stream'],
    ['text/markdown', 'application/octet-stream'],
  ])('serves %s as %s', (stored, served) => {
    expect(servedMediaType(stored)).toBe(served);
  });
});

describe('the asset of zero bytes', () => {
  it('is named by the SHA-256 of nothing', async () => {
    await expect(assetHashOf(new Uint8Array())).resolves.toBe(EMPTY_ASSET.hash);
    expect(EMPTY_ASSET.bytes.byteLength).toBe(0);
  });

  it('is answered by a store holding nothing under its hash, and nothing else is', async () => {
    expect(withEmptyAsset(EMPTY_ASSET.hash, undefined)).toEqual(EMPTY_ASSET);
    expect(withEmptyAsset(await assetHashOf(text), undefined)).toBeUndefined();
    const stored = { ...EMPTY_ASSET, mediaType: 'text/plain' };
    expect(withEmptyAsset(EMPTY_ASSET.hash, stored)).toBe(stored);
  });
});
