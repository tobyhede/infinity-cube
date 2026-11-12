/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { ASSET_COLLECTION_PATH, assetHashOfPath, EMPTY_ASSET_HASH } from './asset-hash';

export {
  ASSET_COLLECTION_PATH,
  assetHashOfPath,
  EMPTY_ASSET_HASH,
  isAssetHash,
} from './asset-hash';

/**
 * A reference to a stored asset (ADR 0142): `/assets/` and the SHA-256 of its
 * bytes as 43 characters of unpadded base64url, held as a whole string value
 * in `content` or Map content.
 */
export type AssetRef = `/assets/${string}`;

/** Whether `value` is an asset reference: a whole string, and nothing around it. */
export const isAssetRef = (value: unknown): value is AssetRef =>
  typeof value === 'string' && assetHashOfPath(value) !== undefined;

/** The runtime parser the host's walk and a plugin's content schema share. */
export const assetRefSchema = z.custom<AssetRef>(isAssetRef, {
  message: 'An asset reference is /assets/ and the unpadded base64url SHA-256 of its bytes',
});

/** The reference an asset's hash gives it. */
export const assetRef = (hash: string): AssetRef => `${ASSET_COLLECTION_PATH}/${hash}`;

/** The hash an asset reference names. */
export const assetRefHash = (ref: AssetRef): string => ref.slice(ASSET_COLLECTION_PATH.length + 1);

/** The reference to the asset of zero bytes, which always exists. */
export const EMPTY_ASSET_REF: AssetRef = assetRef(EMPTY_ASSET_HASH);

/**
 * Every asset reference in a JSON value, once each, in the order first met:
 * each whole string value `assetRefSchema` accepts, at any depth of arrays and
 * objects. An object's keys are names, not values, and are not read.
 *
 * The walk reads no kind and no declaration, so it finds the references of a
 * Resource whose plugin is missing as readily as any other, and a string that
 * only looks like a reference is treated as one (ADR 0142).
 */
export const assetReferences = (value: unknown): readonly AssetRef[] => {
  const found = new Set<AssetRef>();
  const visit = (node: unknown): void => {
    if (isAssetRef(node)) found.add(node);
    else if (Array.isArray(node)) for (const item of node) visit(item);
    else if (typeof node === 'object' && node !== null) {
      for (const item of Object.values(node)) visit(item);
    }
  };
  visit(value);
  return [...found];
};
