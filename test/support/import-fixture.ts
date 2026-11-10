import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUuid, type SpaceSnapshot } from '@project/core';
import {
  readAggregate,
  readSingleSpace,
  referencedAssetHashes,
} from '../../src/aggregate-directory';
import { importAggregateContents } from '../../src/import/import-aggregate';
import { type SpaceRepository, identifySpace } from '@project/aggregate';
import {
  admitAsset,
  EMPTY_ASSET,
  mediaTypeForExtension,
  type AssetHash,
  type LoadedSpace,
} from '@project/persistence';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));

const seededSpace = (
  initialized: Awaited<ReturnType<SpaceRepository['initializeAggregate']>>,
  directory: string,
  spaceId: string,
): LoadedSpace => {
  if (initialized.kind !== 'initialized') {
    // `existing` and `already-initialized` both mean the repository was seeded
    // before this call, which is a fault in the test's setup rather than in the
    // directory; `aggregate-refused` means the directory itself does not load.
    const because =
      initialized.kind === 'aggregate-refused'
        ? initialized.errors.map(({ kind }) => kind).join(', ')
        : 'the repository was already initialized';
    throw new Error(`Directory ${directory} did not seed: ${initialized.kind} (${because})`);
  }
  const fixture = initialized.aggregate.spaces.find(({ snapshot: { id } }) => id === spaceId);
  if (fixture === undefined) {
    throw new Error(`Directory ${directory} seeded no Space for ${spaceId}`);
  }
  return fixture;
};

/**
 * Import one Space directory through the production file importer, and seed it
 * through the lifecycle door every other caller uses (ADR 0078).
 *
 * The Meta identity is **named** here rather than inferred: the one Space this
 * reads is the aggregate's root, and `initializeAggregate` is told so. Taking
 * Meta from array position is the inference ADR 0078 refuses.
 *
 * `newUuid` rather than an injected generator because nothing here asserts on an
 * identity: the ids the directory leaves out are filled in so the snapshot can
 * be stored at all, and a test that wants to name one identifies its own
 * snapshot (ADR 0109).
 */
export const importSpaceDirectory = async (
  repository: SpaceRepository,
  directory: string,
): Promise<LoadedSpace> => {
  await storeSpaceDirectoryAssets(repository, directory);
  const input = await readSingleSpace(directory);
  const snapshot = identifySpace(input, newUuid);
  const initialized = await repository.initializeAggregate({
    metaSpaceId: snapshot.id,
    spaces: [snapshot],
  });
  return seededSpace(initialized, directory, snapshot.id);
};

/**
 * Store every file in a single Space directory's own `assets/`, as Import
 * stores an aggregate's (ADR 0142), so a generated Space directory's Markdown
 * text is there to read. A missing `assets/` stores nothing.
 */
const storeSpaceDirectoryAssets = async (
  repository: SpaceRepository,
  directory: string,
): Promise<void> => {
  const assets = join(directory, 'assets');
  const names = await readdir(assets).catch(() => []);
  for (const name of names.sort()) {
    const bytes = new Uint8Array(await readFile(join(assets, name)));
    const admitted = await admitAsset(bytes, mediaTypeForExtension(extname(name).slice(1)));
    if (admitted.kind === 'admitted') await repository.storeAsset(admitted.asset);
  }
};

/**
 * Every asset URL the Spaces reference that the fixture's `assets/` does not
 * carry, found by the same walk Export uses to decide which assets to carry.
 * The asset of zero bytes needs no file.
 */
const uncarriedAssetUrls = (
  spaces: readonly SpaceSnapshot[],
  carried: ReadonlySet<AssetHash>,
): readonly string[] =>
  referencedAssetHashes(spaces)
    .filter((hash) => hash !== EMPTY_ASSET.hash && !carried.has(hash))
    .map((hash) => `/assets/${hash}`);

/**
 * Import the tracked fixture as a complete Meta-rooted aggregate, through the
 * same `readAggregate` and import path public import uses, its `assets/`
 * included (ADR 0118).
 *
 * Returns the Meta Space so callers that open the fixture still receive the
 * Map fixture they address.
 *
 * Stricter than public import in one way: a fixture naming an `/assets/<hash>`
 * its own `assets/` does not carry is refused before anything is stored, so the
 * fixture and its files cannot drift apart (ADR 0054). Public import accepts
 * such a reference as absent bytes.
 *
 * `directory` defaults to the tracked fixture; a test names a copy to seed an
 * altered fixture without touching tracked files.
 */
export const importFixture = async (
  repository: SpaceRepository,
  { directory = fixtureDirectory }: { readonly directory?: string } = {},
): Promise<LoadedSpace> => {
  const source = await readAggregate(directory, newUuid);
  const carried = new Set(source.assets.map(({ hash }) => hash));
  const uncarried = uncarriedAssetUrls(source.spaces, carried);
  if (uncarried.length > 0) {
    throw new Error(
      `Fixture ${directory} names assets its assets/ does not carry: ${uncarried.join(', ')}`,
    );
  }
  const imported = await importAggregateContents(source, repository, { replace: false });
  if (imported.kind !== 'imported') {
    const because =
      imported.kind === 'aggregate-refused'
        ? imported.errors.map(({ kind }) => kind).join(', ')
        : 'the repository was already initialized';
    throw new Error(`Directory ${directory} did not seed: ${imported.kind} (${because})`);
  }
  const meta = imported.spaces.find(({ snapshot: { id } }) => id === source.metaSpaceId);
  if (meta === undefined) throw new Error(`Directory ${directory} seeded no Meta Space`);
  return meta;
};
