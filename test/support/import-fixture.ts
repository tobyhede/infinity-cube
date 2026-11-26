import { fileURLToPath } from 'node:url';
import { newUuid, type SpaceSnapshot } from '@project/core';
import { readAggregate, referencedAssetHashes } from '../../src/aggregate-directory';
import { importAggregateContents } from '../../src/import/import-aggregate';
import type { SpaceRepository } from '@project/aggregate';
import { EMPTY_ASSET, type AssetHash, type LoadedSpace } from '@project/persistence';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));

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
