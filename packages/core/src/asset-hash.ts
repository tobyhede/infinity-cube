/**
 * The name of an asset (ADR 0142, ADR 0106): the SHA-256 of its bytes spelled
 * as unpadded base64url. Forty-three characters, and only the canonical
 * spelling: the last one carries four bits of the digest and two zero bits, so
 * it is one of the sixteen characters whose low two bits are clear.
 *
 * This module imports nothing, so the Vite host can bundle it by relative path
 * to tell an asset's URL from the built application's own scripts, which are
 * served under the same `/assets/`.
 */
const ASSET_HASH = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

/** Whether `value` is an asset's name: a SHA-256 as 43 characters of unpadded base64url. */
export const isAssetHash = (value: string): boolean => ASSET_HASH.test(value);

/** The collection every stored asset is addressed under: an asset's URL is `/assets/<hash>`. */
export const ASSET_COLLECTION_PATH = '/assets';

const ASSET_PATH_PREFIX = `${ASSET_COLLECTION_PATH}/`;

/**
 * The hash an asset URL names, or `undefined` when `url` is not one: the
 * collection, then one segment that is a valid hash, and nothing else.
 */
export const assetHashOfPath = (url: string): string | undefined => {
  if (!url.startsWith(ASSET_PATH_PREFIX)) return undefined;
  const hash = url.slice(ASSET_PATH_PREFIX.length);
  return isAssetHash(hash) ? hash : undefined;
};

/** The hash of zero bytes. The asset it names exists in every store and directory, with no file needed. */
export const EMPTY_ASSET_HASH = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
