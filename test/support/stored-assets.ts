import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { admitAsset, assetPath, type StoredAsset } from '@project/persistence';

/**
 * Bytes that start as a PNG: the signature and a tail that tells one test
 * picture from another. The asset store reads no bytes, so a picture's pixels
 * are not what these tests are about.
 */
export const pngBytes = (tail = 0): Uint8Array<ArrayBuffer> =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, tail]);

/** Bytes that start as a JPEG. */
export const jpegBytes = (tail = 0): Uint8Array<ArrayBuffer> =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, tail]);

/** The media type these helpers' bytes are stored under unless a test names one. */
const typeOf = (bytes: Uint8Array): string => {
  if (bytes[0] === 0x89) return 'image/png';
  if (bytes[0] === 0xff) return 'image/jpeg';
  return 'application/octet-stream';
};

/** The asset storing makes of these bytes under `mediaType`, or a thrown error when it would refuse them. */
export const admitted = async (
  bytes: Uint8Array<ArrayBuffer>,
  mediaType: string = typeOf(bytes),
): Promise<StoredAsset> => {
  const admission = await admitAsset(bytes, mediaType);
  if (admission.kind !== 'admitted') throw new Error(`Not an asset: ${admission.code}`);
  return admission.asset;
};

/** An Image Resource document showing a stored asset by its URL. */
export const showing = (asset: StoredAsset, title = 'Picture') => ({
  title,
  kind: 'image' as const,
  content: { url: assetPath(asset.hash) },
});

/**
 * Every regular file under `directory`, by its path relative to it, with its
 * bytes: what "byte-for-byte the same directory" is compared over.
 */
export const directoryTree = async (directory: string): Promise<Record<string, Buffer>> => {
  const tree: Record<string, Buffer> = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    tree[relative(directory, path)] = await readFile(path);
  }
  return tree;
};
