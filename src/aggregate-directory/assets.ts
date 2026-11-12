import { compareOrdinal } from '@project/aggregate';
import { assetReferences, assetRefHash, type AssetRef, type SpaceSnapshot } from '@project/core';
import {
  EMPTY_ASSET,
  isAssetHash,
  type AssetHash,
  type AssetStore,
  type StoredAsset,
} from '@project/persistence';

/**
 * Every asset hash the aggregate references, once each, in ordinal order: each
 * whole string value that is an asset reference in a Resource's `content` or
 * in the Map content of any Map entry, whatever its kind and whether or not
 * any plugin reads it (ADR 0142). No kind is named, so a Resource whose plugin
 * is missing has its assets found as readily as any other.
 */
export const referencedAssetHashes = (spaces: readonly SpaceSnapshot[]): readonly AssetHash[] => {
  const hashes = new Set<AssetHash>();
  const collect = (refs: readonly AssetRef[]): void => {
    for (const ref of refs) {
      const hash = assetRefHash(ref);
      if (isAssetHash(hash)) hashes.add(hash);
    }
  };
  for (const { document, resources } of spaces) {
    for (const placed of document.maps ?? []) {
      for (const entry of Object.values(placed.positions)) collect(assetReferences(entry?.content));
    }
    for (const resource of resources) collect(assetReferences(resource.document.content));
  }
  return [...hashes].sort(compareOrdinal);
};

/** The referenced assets Export carries, and the referenced hashes it writes no file for. */
export interface ReferencedAssets {
  /** Each referenced asset whose bytes the store holds, in hash order. */
  readonly carried: readonly StoredAsset[];
  /**
   * Each referenced hash Export writes no file for: one whose bytes the store
   * does not hold, which is not an error (ADR 0118), and the asset of zero
   * bytes, which needs no file. A file of that name already in the directory
   * is kept rather than removed.
   */
  readonly kept: readonly AssetHash[];
}

/**
 * The assets the aggregate references, read from the store: Export carries
 * what is referenced and leaves out what is not, and the store never deletes
 * an asset (ADR 0106).
 */
export const loadReferencedAssets = async (
  store: Pick<AssetStore, 'loadAsset'>,
  spaces: readonly SpaceSnapshot[],
): Promise<ReferencedAssets> => {
  const hashes = referencedAssetHashes(spaces);
  const loaded = await Promise.all(
    hashes.map(async (hash) => ({ hash, asset: await store.loadAsset(hash) })),
  );
  const carried: StoredAsset[] = [];
  const kept: AssetHash[] = [];
  for (const { hash, asset } of loaded) {
    if (asset === undefined || hash === EMPTY_ASSET.hash) kept.push(hash);
    else carried.push(asset);
  }
  return { carried, kept };
};
