/**
 * The one asset store the host keeps beside Spaces and outside the aggregate
 * (ADR 0142, ADR 0106): what an asset is, how its bytes are named and
 * admitted, the one table between file extensions and media types, and what a
 * store of assets owes its callers. Browser-safe, because the route that
 * stores assets is `@project/http`'s and the directory reader is
 * `@project/aggregate`'s; each repository implements the store.
 */

import {
  assetRef,
  EMPTY_ASSET_HASH,
  isAssetHash as isAssetHashSpelling,
  type AssetRef,
} from '@project/core';

/** The largest asset the host stores, in bytes: 10 MiB. */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/** The SHA-256 of an asset's bytes as 43 characters of unpadded base64url. */
export type AssetHash = string & { readonly assetHash: unique symbol };

export const isAssetHash = (value: string): value is AssetHash => isAssetHashSpelling(value);

/** The media type of bytes nothing names more precisely. */
export const OCTET_STREAM = 'application/octet-stream';

export interface StoredAsset {
  readonly hash: AssetHash;
  /** A media type's essence, lower case and without parameters. */
  readonly mediaType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** Why storing bytes as an asset is refused, a named code the application puts into words. */
export const ASSET_TOO_LARGE = 'asset-too-large';

/** Why reading an asset answered no bytes: none are stored under its hash. */
export const ASSET_ABSENT = 'asset-absent';

/**
 * Assets, by content. Storing bytes already stored stores nothing and answers
 * `existing`, and the first stored media type stands; nothing is ever deleted,
 * because a URL can be copied anywhere and nothing can know an asset is
 * unused. A reset clears the store with everything else, and neither aggregate
 * lifecycle door touches it.
 *
 * `loadAsset` answers the asset of zero bytes for its hash whether or not it
 * was stored (`withEmptyAsset`).
 */
export interface AssetStore {
  storeAsset(asset: StoredAsset): Promise<'stored' | 'existing'>;
  loadAsset(hash: AssetHash): Promise<StoredAsset | undefined>;
}

/**
 * What a surface reaches the asset store through, in the browser (ADR 0142):
 * where an asset is drawn from, its bytes, and storing new ones. `read` and
 * `store` answer a refusal rather than throwing for what the store decides;
 * each throws only when the host cannot be reached.
 */
export interface AssetClient {
  url(ref: AssetRef): string;
  read(ref: AssetRef): Promise<Blob | { readonly refused: string }>;
  store(bytes: Blob): Promise<AssetRef | { readonly refused: string }>;
}

/** The hash content-addressing gives these bytes. */
export const assetHashOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<AssetHash> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = digest.toBase64({ alphabet: 'base64url', omitPadding: true });
  if (!isAssetHash(hash)) throw new Error('A SHA-256 digest did not spell an asset hash');
  return hash;
};

/** An asset's root-relative URL: what `content` records to reference it. */
export const assetPath = (hash: AssetHash): AssetRef => assetRef(hash);

const emptyAssetHash = (): AssetHash => {
  if (!isAssetHash(EMPTY_ASSET_HASH))
    throw new Error('The hash of zero bytes is not an asset hash');
  return EMPTY_ASSET_HASH;
};

/** The asset of zero bytes, which exists in every store and directory with no file needed. */
export const EMPTY_ASSET: StoredAsset = {
  hash: emptyAssetHash(),
  mediaType: OCTET_STREAM,
  bytes: new Uint8Array(0),
};

/**
 * What a store answers for `hash`, given what it holds: the asset of zero bytes
 * always exists, so a store that holds nothing under its hash answers it as
 * `application/octet-stream`.
 */
export const withEmptyAsset = (
  hash: AssetHash,
  held: StoredAsset | undefined,
): StoredAsset | undefined =>
  held ?? (hash === EMPTY_ASSET.hash ? { ...EMPTY_ASSET, bytes: new Uint8Array(0) } : undefined);

const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

/**
 * A declared media type's essence, lower case and without parameters, or
 * `application/octet-stream` when nothing usable is declared.
 */
export const normalizeMediaType = (declared: string): string => {
  const essence = (declared.split(';')[0] ?? '').trim().toLowerCase();
  return MEDIA_TYPE.test(essence) ? essence : OCTET_STREAM;
};

export type AssetAdmission =
  | { readonly kind: 'admitted'; readonly asset: StoredAsset }
  | { readonly kind: 'refused'; readonly code: typeof ASSET_TOO_LARGE };

/**
 * Admit bytes as an asset under the media type they were declared with. Any
 * media type is admitted, because a kind only a missing plugin understands can
 * bring one, and so are zero bytes; only the 10 MiB cap refuses. An admitted
 * asset owns a copy of the bytes, so its hash stays their SHA-256 whatever the
 * caller does with its own array.
 */
export const admitAsset = async (
  bytes: Uint8Array<ArrayBuffer>,
  declaredType: string,
): Promise<AssetAdmission> => {
  if (bytes.byteLength > MAX_ASSET_BYTES) return { kind: 'refused', code: ASSET_TOO_LARGE };
  const owned = bytes.slice();
  return {
    kind: 'admitted',
    asset: {
      hash: await assetHashOf(owned),
      mediaType: normalizeMediaType(declaredType),
      bytes: owned,
    },
  };
};

/**
 * The one table between file extensions and media types. Several extensions
 * may name one type; the first listed for a type is the one Export writes when
 * it has no file name to keep.
 */
const EXTENSION_MEDIA_TYPES: readonly (readonly [string, string])[] = [
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['avif', 'image/avif'],
  ['svg', 'image/svg+xml'],
  ['md', 'text/markdown'],
  ['txt', 'text/plain'],
  ['csv', 'text/csv'],
  ['html', 'text/html'],
  ['css', 'text/css'],
  ['js', 'text/javascript'],
  ['json', 'application/json'],
  ['pdf', 'application/pdf'],
  ['mp4', 'video/mp4'],
  ['webm', 'video/webm'],
  ['mp3', 'audio/mpeg'],
  ['woff2', 'font/woff2'],
  ['bin', OCTET_STREAM],
];

/** The media type a file's extension names; an unlisted extension, or none, is `application/octet-stream`. */
export const mediaTypeForExtension = (extension: string): string =>
  EXTENSION_MEDIA_TYPES.find(([listed]) => listed === extension.toLowerCase())?.[1] ?? OCTET_STREAM;

/** The extension a media type is written with; an unlisted type is `bin`. */
export const extensionForMediaType = (mediaType: string): string =>
  EXTENSION_MEDIA_TYPES.find(([, listed]) => listed === mediaType)?.[0] ?? 'bin';

/**
 * The only media types served inline from the application's origin: the four
 * picture types a browser draws without running anything. Every other asset is
 * served as `application/octet-stream`.
 */
const INLINE_MEDIA_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/**
 * The media type a stored asset is handed to the page under, wherever the page
 * reads it from: the host's `GET /assets/:hash` and a mount's object URLs
 * alike. A picture keeps its type; every other asset is inert bytes, so a
 * stored HTML or SVG file never runs as active content of the application's
 * origin.
 */
export const servedMediaType = (mediaType: string): string =>
  INLINE_MEDIA_TYPES.includes(mediaType) ? mediaType : OCTET_STREAM;

/**
 * The response header naming the media type an asset was stored as, beside a
 * `Content-Type` that names the type it is served as. A reader that wants the
 * bytes as their author typed them reads this one; a browser drawing the URL
 * reads `Content-Type` alone.
 */
export const ASSET_MEDIA_TYPE_HEADER = 'X-Asset-Media-Type';
