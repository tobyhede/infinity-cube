/**
 * Which bytes an Image Resource's picture may be (ADR 0106, ADR 0142): the
 * Image plugin's rule, applied before the bytes are stored as an asset. The
 * asset store admits any media type, so this is where a picture is told from
 * anything else, from its bytes alone, and SVG is refused as active content.
 */

/** The largest picture an Image Resource stores, in bytes: 10 MiB, the asset store's own cap. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** The picture formats an Image Resource draws, each identified from the bytes. */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/** Whether a media type is a picture format an Image Resource draws. */
export const isImageMediaType = (value: string): value is ImageMediaType =>
  IMAGE_MEDIA_TYPES.some((type) => type === value);

/**
 * Why bytes are not stored, each a named code the application puts into words.
 * SVG has its own because it is not refused as unrecognised: it is left for its
 * own decision (ADR 0106).
 */
const IMAGE_REFUSALS = [
  'image-too-large',
  'image-format-unsupported',
  'image-svg-unsupported',
] as const;
export type ImageRefusal = (typeof IMAGE_REFUSALS)[number];

/** Whether a problem code is one of the refusals storing an image answers. */
export const isImageRefusal = (code: string): code is ImageRefusal =>
  IMAGE_REFUSALS.some((refusal) => refusal === code);

/**
 * The refusal the browser can answer from the media type it declares for a
 * file, before sending it, or `undefined` when only the bytes can tell.
 *
 * A declared type comes from the file's name or the platform, not its bytes,
 * so this only refuses a type it knows is not a picture it draws: a declared image type
 * or no type at all is read, and `admitImage` decides from the bytes.
 */
export const refusalForDeclaredType = (type: string): ImageRefusal | undefined => {
  if (type === '' || isImageMediaType(type)) return undefined;
  return type === 'image/svg+xml' ? 'image-svg-unsupported' : 'image-format-unsupported';
};

export type ImageAdmission =
  | { readonly kind: 'admitted'; readonly mediaType: ImageMediaType }
  | { readonly kind: 'refused'; readonly code: ImageRefusal };

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean =>
  prefix.every((value, index) => bytes[offset + index] === value);

const asciiCodes = (text: string): readonly number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF87_SIGNATURE = asciiCodes('GIF87a');
const GIF89_SIGNATURE = asciiCodes('GIF89a');
const RIFF_SIGNATURE = asciiCodes('RIFF');
const WEBP_FORM = asciiCodes('WEBP');

/** Where the markup opened at `from` ends, past `close`, or -1 when it never closes. */
const pastClose = (text: string, from: number, close: string): number => {
  const end = text.indexOf(close, from);
  return end === -1 ? -1 : end + close.length;
};

/**
 * Where a doctype opened at `from` ends, past any internal subset it carries,
 * or -1 when it never closes. One forward pass: a quoted literal, and inside the
 * subset a comment or processing instruction, is stepped over whole, so a `[`,
 * `]`, `>` or quote inside one neither opens nor closes anything.
 */
const pastDoctype = (text: string, from: number): number => {
  let at = from;
  let inSubset = false;
  while (at !== -1 && at < text.length) {
    const character = text.charAt(at);
    if (character === '"' || character === "'") at = pastClose(text, at + 1, character);
    else if (inSubset && text.startsWith('<!--', at)) at = pastClose(text, at + 4, '-->');
    else if (inSubset && text.startsWith('<?', at)) at = pastClose(text, at + 2, '?>');
    else if (!inSubset && character === '[') {
      inSubset = true;
      at += 1;
    } else if (inSubset && character === ']') {
      inSubset = false;
      at += 1;
    } else if (!inSubset && character === '>') return at + 1;
    else at += 1;
  }
  return -1;
};

/**
 * Whether the bytes read as an SVG document: its root element is `svg`, after
 * whatever prolog precedes it — whitespace, declarations and processing
 * instructions, comments and a doctype — however long that prolog is. The
 * decoder drops a leading byte-order mark.
 */
const isSvg = (bytes: Uint8Array): boolean => {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  let at = 0;
  while (at !== -1 && at < text.length) {
    if (/\s/u.test(text.charAt(at))) at += 1;
    else if (text.startsWith('<?', at)) at = pastClose(text, at + 2, '?>');
    else if (text.startsWith('<!--', at)) at = pastClose(text, at + 4, '-->');
    else if (text.slice(at, at + 9).toUpperCase() === '<!DOCTYPE') at = pastDoctype(text, at + 9);
    else return /^<svg[\s/>]/iu.test(text.slice(at, at + 5));
  }
  return false;
};

const mediaTypeOf = (bytes: Uint8Array): ImageMediaType | 'svg' | undefined => {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(bytes, GIF87_SIGNATURE) || startsWith(bytes, GIF89_SIGNATURE)) return 'image/gif';
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_FORM, 8)) return 'image/webp';
  if (isSvg(bytes)) return 'svg';
  return undefined;
};

/**
 * Decide whether bytes are a picture, from the bytes alone: a declared type is
 * never consulted, so a PNG sent as `text/plain` is a PNG and an SVG sent as
 * `image/png` is an SVG.
 */
export const admitImage = (bytes: Uint8Array): ImageAdmission => {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { kind: 'refused', code: 'image-too-large' };
  const mediaType = mediaTypeOf(bytes);
  if (mediaType === 'svg') return { kind: 'refused', code: 'image-svg-unsupported' };
  if (mediaType === undefined) return { kind: 'refused', code: 'image-format-unsupported' };
  return { kind: 'admitted', mediaType };
};

/** What an author calls each picture format. A format added without a name fails here. */
const IMAGE_FORMAT_NAMES = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
} satisfies Record<ImageMediaType, string>;

const formatNames = IMAGE_MEDIA_TYPES.map((type) => IMAGE_FORMAT_NAMES[type]);

/** The picture formats as one phrase, in order: `PNG, JPEG, WebP or GIF`. */
const IMAGE_FORMATS = `${formatNames.slice(0, -1).join(', ')} or ${formatNames.slice(-1).join('')}`;

/** The limit as an author reads it: `MAX_IMAGE_BYTES` in units of 1024², written MB. */
const MAX_IMAGE_MEGABYTES = MAX_IMAGE_BYTES / (1024 * 1024);

/** Why a file named `name` is not a picture an Image Resource keeps, in the author's words. */
export const describeImageRefusal = (code: ImageRefusal, name: string): string => {
  switch (code) {
    case 'image-too-large':
      return `${name} is larger than ${MAX_IMAGE_MEGABYTES} MB, the largest image that can be stored.`;
    case 'image-format-unsupported':
      return `${name} is not a ${IMAGE_FORMATS} image.`;
    case 'image-svg-unsupported':
      return `${name} is an SVG image, which cannot be stored. Use ${IMAGE_FORMATS}.`;
  }
};
