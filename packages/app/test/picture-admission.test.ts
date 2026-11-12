import type { AssetRef } from '@project/core';
import { servedMediaType, type AssetClient, type AssetRefusal } from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import {
  admitImage,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  refusalForDeclaredType,
  storePicture,
} from '../src/picture-admission';

const bytes = (...values: readonly number[]): Uint8Array<ArrayBuffer> => Uint8Array.from(values);
const ascii = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const joined = (...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

/** The shortest prefix each format is recognised by, followed by arbitrary content. */
const png = joined(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ascii('IHDR'));
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const gif = ascii('GIF89a\u0001\u0000');
const webp = joined(ascii('RIFF'), bytes(0x24, 0, 0, 0), ascii('WEBPVP8 '));

describe('admitting an image', () => {
  it.each([
    ['PNG', png, 'image/png'],
    ['JPEG', jpeg, 'image/jpeg'],
    ['GIF', gif, 'image/gif'],
    ['WebP', webp, 'image/webp'],
  ] as const)('admits %s by its bytes', (_, content, type) => {
    expect(admitImage(content)).toEqual({ kind: 'admitted', mediaType: type });
  });

  it.each([
    ['empty bytes', new Uint8Array()],
    ['text', ascii('hello, world')],
    ['a truncated PNG signature', bytes(0x89, 0x50, 0x4e, 0x47)],
    ['a RIFF container that is not WebP', joined(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WAVE'))],
    ['a PDF', ascii('%PDF-1.7')],
    ['markup whose root element is not svg', ascii('<html><svg/></html>')],
  ])('refuses %s as an unsupported format', (_, content) => {
    expect(admitImage(content)).toEqual({
      kind: 'refused',
      code: 'image-format-unsupported',
    });
  });

  it.each([
    ['a bare SVG', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['an SVG with a declaration', '<?xml version="1.0"?>\n<svg></svg>'],
    ['an SVG after a byte-order mark and whitespace', '\uFEFF  \n<SVG></SVG>'],
    ['an SVG after a doctype', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ""><svg/>'],
    ['an SVG after a long comment', `<?xml version="1.0"?>\n<!--${'x'.repeat(4096)}-->\n<svg/>`],
    [
      'an SVG after a doctype with a long internal subset',
      `<!DOCTYPE svg [\n${'<!ENTITY e "x">\n'.repeat(512)}]>\n<svg/>`,
    ],
    [
      'an SVG after a doctype whose identifier holds a bracket',
      '<!DOCTYPE svg SYSTEM "a[b"><svg/>',
    ],
    ['an SVG after a doctype whose identifier holds a >', "<!DOCTYPE svg SYSTEM 'a>b'><svg/>"],
    ['an SVG after an entity value holding a bracket', '<!DOCTYPE svg [<!ENTITY e "]>">]><svg/>'],
    ['an SVG after a subset comment holding a quote', "<!DOCTYPE svg [<!-- it's ] -->]><svg/>"],
    ['an SVG after a subset instruction holding a bracket', '<!DOCTYPE svg [<?pi ]?>]><svg/>'],
  ])('refuses %s with its own code', (_, text) => {
    expect(admitImage(ascii(text))).toEqual({
      kind: 'refused',
      code: 'image-svg-unsupported',
    });
  });

  it('admits an image of exactly the size limit and refuses one byte more', () => {
    const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
    atLimit.set(png);
    const overLimit = new Uint8Array(MAX_IMAGE_BYTES + 1);
    overLimit.set(png);

    expect(admitImage(atLimit)).toMatchObject({ kind: 'admitted' });
    expect(admitImage(overLimit)).toEqual({
      kind: 'refused',
      code: 'image-too-large',
    });
  });

  it('is ten MiB', () => {
    expect(MAX_IMAGE_BYTES).toBe(10_485_760);
  });

  it('admits only formats the host serves under their own type, so every stored picture draws', () => {
    expect(IMAGE_MEDIA_TYPES.map(servedMediaType)).toEqual([...IMAGE_MEDIA_TYPES]);
  });
});

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

describe('refusing a file by the type the browser declares', () => {
  it('refuses a declared SVG as SVG, as the host would', () => {
    expect(refusalForDeclaredType('image/svg+xml')).toBe('image-svg-unsupported');
  });
});
