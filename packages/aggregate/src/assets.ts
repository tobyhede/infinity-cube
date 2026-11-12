import {
  admitAsset,
  extensionForMediaType,
  isAssetHash,
  mediaTypeForExtension,
  type AssetHash,
  type StoredAsset,
} from '@project/persistence';
import { AggregateDirectoryError } from './space-directory';

/**
 * The directory inside an Aggregate directory that carries the bytes of the
 * stored assets its Resources reference (ADR 0142, ADR 0118).
 */
export const ASSETS_DIRECTORY_NAME = 'assets';

/**
 * The hash a file name in `assets/` is named by, or `undefined` when Importing
 * does not own the file: the name is a valid hash, alone or followed by a dot
 * and any extension.
 */
export const assetFileHash = (name: string): AssetHash | undefined => {
  const dot = name.indexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  return isAssetHash(stem) ? stem : undefined;
};

/**
 * The hash a path relative to an Aggregate directory is named by, when the
 * path is a file in `assets/` whose name `assetFileHash` owns; otherwise
 * `undefined`.
 */
export const assetPathHash = (relativePath: string): AssetHash | undefined => {
  const prefix = `${ASSETS_DIRECTORY_NAME}/`;
  return relativePath.startsWith(prefix)
    ? assetFileHash(relativePath.slice(prefix.length))
    : undefined;
};

/** The extension of a file name `assetFileHash` owns, without its dot, or `''` when it has none. */
export const assetFileExtension = (name: string): string => {
  const dot = name.indexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1);
};

/**
 * The file name Export gives an asset it has no file to keep the name of: its
 * hash, which is also the last segment of its URL, and the extension the host
 * table gives its media type. The same bytes always have the same name, so
 * they are written once and never churn.
 */
export const assetFileName = ({ hash, mediaType }: StoredAsset): string =>
  `${hash}.${extensionForMediaType(mediaType)}`;

/**
 * Admit one asset file's bytes, typed by its extension through the host table,
 * and insist it is named for its content. Every asset an Aggregate directory
 * carries is admitted through this; any media type is, and only the size cap
 * refuses one.
 */
export const admitAssetFile = async (
  path: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<StoredAsset> => {
  const admission = await admitAsset(bytes, mediaTypeForExtension(assetFileExtension(name)));
  if (admission.kind === 'refused') {
    throw new AggregateDirectoryError('parsing', [
      `${path}: not an asset the host stores (${admission.code})`,
    ]);
  }
  const expected = admission.asset.hash;
  if (assetFileHash(name) !== expected) {
    throw new AggregateDirectoryError('parsing', [
      `${path}: an asset file must be named for its content, ${expected}`,
    ]);
  }
  return admission.asset;
};
