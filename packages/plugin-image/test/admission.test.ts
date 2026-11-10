import { describe, expect, it } from 'vitest';
import {
  admitImage,
  describeImageRefusal,
  MAX_IMAGE_BYTES,
  pictureSize,
  refusalForDeclaredType,
} from '@project/plugin-image/domain';

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
});

describe('refusing a file by the type the browser declares', () => {
  it('refuses a declared SVG as SVG, as the host would', () => {
    expect(refusalForDeclaredType('image/svg+xml')).toBe('image-svg-unsupported');
  });
});

describe('reading a picture’s size from its header', () => {
  const u32 = (value: number) =>
    bytes(value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  const u16le = (value: number) => bytes(value & 255, value >>> 8);

  it('reads a PNG’s width and height from its IHDR chunk', () => {
    const header = joined(png.subarray(0, 8), u32(13), ascii('IHDR'), u32(400), u32(300));
    expect(pictureSize(header, 'image/png')).toEqual({ width: 400, height: 300 });
  });

  it('reads a GIF’s logical screen', () => {
    expect(pictureSize(joined(ascii('GIF89a'), u16le(5), u16le(1)), 'image/gif')).toEqual({
      width: 5,
      height: 1,
    });
  });

  it('reads a JPEG’s first frame past the segments before it', () => {
    const app0 = joined(bytes(0xff, 0xe0, 0x00, 0x04), bytes(0, 0));
    const frame = joined(bytes(0xff, 0xc0, 0x00, 0x11, 0x08), bytes(0x01, 0x2c), bytes(0x01, 0x90));
    expect(pictureSize(joined(bytes(0xff, 0xd8), app0, frame), 'image/jpeg')).toEqual({
      width: 400,
      height: 300,
    });
  });

  it('turns a JPEG’s frame as its Exif orientation says, as a browser draws it', () => {
    const frame = joined(bytes(0xff, 0xc0, 0x00, 0x11, 0x08), bytes(0x01, 0x2c), bytes(0x01, 0x90));
    const u16 = (value: number, little: boolean) =>
      little ? u16le(value) : bytes(value >>> 8, value & 255);
    const u32of = (value: number, little: boolean) =>
      little ? joined(u16le(value & 0xffff), u16le(value >>> 16)) : u32(value);
    const exif = (orientation: number, little: boolean) => {
      const tiff = joined(
        ascii(little ? 'II' : 'MM'),
        u16(0x2a, little),
        u32of(8, little),
        u16(1, little),
        u16(0x0112, little),
        u16(3, little),
        u32of(1, little),
        u16(orientation, little),
        bytes(0, 0),
        u32of(0, little),
      );
      const body = joined(ascii('Exif'), bytes(0, 0), tiff);
      return joined(bytes(0xff, 0xe1), u16(body.byteLength + 2, false), body);
    };
    const jpegWith = (orientation: number, little: boolean) =>
      pictureSize(joined(bytes(0xff, 0xd8), exif(orientation, little), frame), 'image/jpeg');
    expect(jpegWith(6, false)).toEqual({ width: 300, height: 400 });
    expect(jpegWith(8, true)).toEqual({ width: 300, height: 400 });
    expect(jpegWith(5, true)).toEqual({ width: 300, height: 400 });
    expect(jpegWith(3, false)).toEqual({ width: 400, height: 300 });
    expect(jpegWith(1, true)).toEqual({ width: 400, height: 300 });
  });

  it('reads each WebP form', () => {
    const riff = (chunk: string, body: Uint8Array) =>
      joined(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WEBP'), ascii(chunk), body);
    const lossy = riff('VP8 ', joined(new Uint8Array(10), u16le(400), u16le(300)));
    expect(pictureSize(lossy, 'image/webp')).toEqual({ width: 400, height: 300 });
    // Width and height less one, packed in 14 bits each from byte 21.
    const packed = 398 | (298 << 14);
    const lossless = riff(
      'VP8L',
      joined(
        new Uint8Array(5),
        bytes(packed & 255, (packed >>> 8) & 255, (packed >>> 16) & 255, packed >>> 24),
      ),
    );
    expect(pictureSize(lossless, 'image/webp')).toEqual({ width: 399, height: 299 });
    const extended = riff(
      'VP8X',
      joined(new Uint8Array(8), bytes(399 & 255, 399 >>> 8, 0), bytes(299 & 255, 299 >>> 8, 0)),
    );
    expect(pictureSize(extended, 'image/webp')).toEqual({ width: 400, height: 300 });
  });

  it('answers no size where the header does not say', () => {
    expect(pictureSize(png, 'image/png')).toBeUndefined();
    expect(pictureSize(jpeg, 'image/jpeg')).toBeUndefined();
    expect(pictureSize(webp, 'image/webp')).toBeUndefined();
  });
});

describe('saying why a file is refused', () => {
  it('names the file and the formats an Image Resource draws', () => {
    expect(describeImageRefusal('image-format-unsupported', 'notes.txt')).toBe(
      'notes.txt is not a PNG, JPEG, WebP or GIF image.',
    );
    expect(describeImageRefusal('image-svg-unsupported', 'a.svg')).toMatch(/^a\.svg is an SVG/u);
    expect(describeImageRefusal('image-too-large', 'big.png')).toMatch(/10 MB/u);
  });
});
