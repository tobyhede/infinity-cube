import type { ImageMediaType } from './admission';

/**
 * A picture's size in pixels, read from the header its format writes ahead of
 * the pixels, so the size an Image Resource records is the picture's own and
 * no browser has to load it first (ADR 0106).
 */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

const bigEndian16 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);

const bigEndian32 = (bytes: Uint8Array, at: number): number =>
  bigEndian16(bytes, at) * 0x10000 + bigEndian16(bytes, at + 2);

const littleEndian16 = (bytes: Uint8Array, at: number): number =>
  (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);

const littleEndian24 = (bytes: Uint8Array, at: number): number =>
  littleEndian16(bytes, at) | ((bytes[at + 2] ?? 0) << 16);

const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/** A size only when both sides are a positive count of pixels. */
const sized = (width: number, height: number): PictureSize | undefined =>
  width > 0 && height > 0 ? { width, height } : undefined;

/** PNG: the IHDR chunk follows the signature, width then height. */
const pngSize = (bytes: Uint8Array): PictureSize | undefined =>
  ascii(bytes, 12, 4) === 'IHDR'
    ? sized(bigEndian32(bytes, 16), bigEndian32(bytes, 20))
    : undefined;

/** GIF: the logical screen's width and height follow the six-byte signature. */
const gifSize = (bytes: Uint8Array): PictureSize | undefined =>
  bytes.byteLength < 10 ? undefined : sized(littleEndian16(bytes, 6), littleEndian16(bytes, 8));

/** The start-of-frame markers, which carry the frame's size; C4, C8 and CC are not frames. */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** Markers that stand alone, with no length after them. */
const standsAlone = (marker: number): boolean =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

/** JPEG: walk the segments to the first start of frame, which gives height then width. */
const jpegSize = (bytes: Uint8Array): PictureSize | undefined => {
  let at = 2;
  while (at + 3 < bytes.byteLength) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
    } else if (standsAlone(marker)) {
      at += 2;
    } else if (isStartOfFrame(marker)) {
      return sized(bigEndian16(bytes, at + 7), bigEndian16(bytes, at + 5));
    } else {
      at += 2 + bigEndian16(bytes, at + 2);
    }
  }
  return undefined;
};

/** WebP: the first chunk is lossy, lossless or extended, each writing its size its own way. */
const webpSize = (bytes: Uint8Array): PictureSize | undefined => {
  switch (ascii(bytes, 12, 4)) {
    case 'VP8 ':
      return sized(littleEndian16(bytes, 26) & 0x3fff, littleEndian16(bytes, 28) & 0x3fff);
    case 'VP8L': {
      const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = bytes.subarray(21, 25);
      return sized(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0xf) << 10) | (b2 << 2) | (b1 >> 6)));
    }
    case 'VP8X':
      return sized(1 + littleEndian24(bytes, 24), 1 + littleEndian24(bytes, 27));
    default:
      return undefined;
  }
};

/**
 * The size of a picture admitted as `mediaType`, from its bytes, or
 * `undefined` when its header does not say.
 */
export const pictureSize = (
  bytes: Uint8Array,
  mediaType: ImageMediaType,
): PictureSize | undefined => {
  switch (mediaType) {
    case 'image/png':
      return pngSize(bytes);
    case 'image/gif':
      return gifSize(bytes);
    case 'image/jpeg':
      return jpegSize(bytes);
    case 'image/webp':
      return webpSize(bytes);
  }
};
