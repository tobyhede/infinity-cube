import { join, resolve } from 'node:path';
import {
  AGGREGATE_FILE_NAME,
  compareOrdinal,
  assetFileHash,
  assetFileName,
  ASSETS_DIRECTORY_NAME,
  readAggregateFrom,
  scanAggregateFrom,
  spaceDirectoryId,
  type AggregateDirectoryContents,
} from '@project/aggregate';
import { AGGREGATE_FILE_VERSION, type AggregateFile, type UUID } from '@project/core';
import type { AssetHash, LoadedAggregate, StoredAsset } from '@project/persistence';
import { directorySource } from './directory-source';
import { writeInPlace, type DirectoryFiles } from './write-in-place';
import { spaceDirectoryFiles } from './write-space-directory';

/**
 * Read a canonical aggregate directory from disk into the complete Meta-rooted
 * input the persistence lifecycle takes, beside every asset `assets/` carries:
 * `readAggregateFrom` over the directory as a `directorySource`.
 */
export const readAggregate = (
  inputPath: string,
  newId: () => UUID,
): Promise<AggregateDirectoryContents> =>
  readAggregateFrom(directorySource(resolve(inputPath)), newId);

const aggregateFile = (metaSpaceId: UUID): AggregateFile => ({
  version: AGGREGATE_FILE_VERSION,
  metaSpaceId,
});

/** The asset among `paths` named by `hash`, by its name in `assets/`, if there is one. */
const assetFileNamed = (paths: readonly string[], hash: AssetHash): string | undefined =>
  paths
    .filter((path) => path.startsWith(`${ASSETS_DIRECTORY_NAME}/`))
    .map((path) => path.slice(ASSETS_DIRECTORY_NAME.length + 1))
    .find((name) => assetFileHash(name) === hash);

/**
 * Every file an aggregate and the stored assets it references serialise to,
 * by path relative to the Aggregate directory: `aggregate.json`, each Space's
 * directory named for its id, and `assets/<hash>.<ext>` (ADR 0142, ADR 0118),
 * each asset named by the host table from its media type.
 */
export const aggregateFiles = (
  aggregate: LoadedAggregate,
  assets: readonly StoredAsset[],
): DirectoryFiles => {
  const files = new Map<string, Uint8Array>([
    [
      AGGREGATE_FILE_NAME,
      Buffer.from(`${JSON.stringify(aggregateFile(aggregate.metaSpaceId), null, 2)}\n`),
    ],
  ]);
  for (const space of [...aggregate.spaces].sort((left, right) =>
    compareOrdinal(left.snapshot.id, right.snapshot.id),
  )) {
    for (const [path, text] of spaceDirectoryFiles(space)) {
      files.set(`${space.snapshot.id}/${path}`, Buffer.from(text));
    }
  }
  for (const asset of assets) {
    files.set(`${ASSETS_DIRECTORY_NAME}/${assetFileName(asset)}`, asset.bytes);
  }
  return files;
};

/**
 * `files` with each asset already in the directory, among `existing`, under
 * the name it has there, so Export writes back the extension Import read.
 */
export const keepingExistingAssetNames = (
  files: DirectoryFiles,
  existing: readonly string[],
): DirectoryFiles =>
  new Map(
    [...files].map(([path, bytes]) => {
      if (!path.startsWith(`${ASSETS_DIRECTORY_NAME}/`)) return [path, bytes] as const;
      const hash = assetFileHash(path.slice(ASSETS_DIRECTORY_NAME.length + 1));
      const kept = hash === undefined ? undefined : assetFileNamed(existing, hash);
      return [kept === undefined ? path : `${ASSETS_DIRECTORY_NAME}/${kept}`, bytes] as const;
    }),
  );

/**
 * Every file Import would read in `directory`, by path relative to it: what
 * Export owns there, and so what it removes when the aggregate no longer
 * serialises to it. `aggregate.json`, each discovered Space directory's
 * `space.json` and Resource files, and the files in `assets/` named by a valid
 * hash — and
 * nothing else, so a file Import does not read is never Export's to remove.
 * They are the files `scanAggregateFrom` finds there, in its order, and a
 * directory that does not exist holds none.
 */
export const scannedAggregateFiles = async (directory: string): Promise<readonly string[]> =>
  (await scanAggregateFrom(directorySource(directory))).files;

/**
 * Refuse a destination holding a Space directory import could not read back,
 * before anything is written.
 *
 * Import refuses a Space directory the author left here under a name that is
 * not its Space's id — an old flat-format Space, a hand-authored sample — so
 * every export into it would write a directory that cannot be imported.
 *
 * Checked here rather than answered by having the reader skip a directory it
 * cannot name: that skip is the guard which stops a renamed Space directory
 * importing as a fresh Space, and dropping it would trade a loud failure for a
 * silent duplication.
 */
export const assertExportableDestination = async (destination: string): Promise<void> => {
  const { spaceDirectories } = await scanAggregateFrom(directorySource(destination));
  const unreadable = spaceDirectories
    .filter((name) => spaceDirectoryId(name) === undefined)
    .map((name) => join(destination, name));
  if (unreadable.length === 0) return;
  throw new Error(
    [
      'Export destination holds a Space directory that is not named for its Space, so the export could not be read back:',
      ...unreadable,
      'Rename each to its Space id in lower case, or move it out of the destination.',
    ].join('\n'),
  );
};

/**
 * Write one Aggregate into a directory, in place: `aggregate.json` plus every
 * Space directory, removing the Space directories and Resource files Import
 * would read that the Aggregate no longer holds. Nothing is checked before
 * writing; `exportAggregate` is the write that checks.
 */
export const writeAggregateDirectory = async (
  aggregate: LoadedAggregate,
  directory: string,
): Promise<void> => {
  const owned = (await scannedAggregateFiles(directory)).filter(
    (path) => !path.startsWith(`${ASSETS_DIRECTORY_NAME}/`),
  );
  const files = aggregateFiles(aggregate, []);
  await writeInPlace(directory, files, owned);
};
