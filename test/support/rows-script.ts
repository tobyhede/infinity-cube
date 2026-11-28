/**
 * The script `conformance/rows/script.json` (Storage ST-125), run on any
 * repository: what each runtime runs on a migrated store so that each can
 * read the rows the other wrote, and on its memory store for what those rows
 * must read as.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { SpaceRepository } from '@project/aggregate';
import { admitAsset, decodeCommitRequest, type StoredAsset } from '@project/persistence';

/** The repository's root directory. */
export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

/** A Space the script initializes with: its id, and the rest for the wire's decoder. */
const scriptSpaceSchema = z.object({ id: uuidSchema }).passthrough();

type ScriptSpace = z.infer<typeof scriptSpaceSchema>;

/** The script's steps, each snapshot and commit left for the wire's own decoder. */
const scriptSchema = z
  .object({
    initialize: z.object({ metaSpaceId: uuidSchema, spaces: z.array(scriptSpaceSchema) }).strict(),
    steps: z.array(
      z.union([
        z
          .object({
            asset: z.union([
              z.object({ mediaType: z.string(), text: z.string(), hash: z.string() }).strict(),
              z.object({ mediaType: z.string(), hex: z.string(), hash: z.string() }).strict(),
            ]),
          })
          .strict(),
        z.object({ commit: z.unknown() }).strict(),
        z
          .object({
            markExported: z
              .object({ spaceId: uuidSchema, revision: z.string().regex(/^(0|[1-9][0-9]*)$/) })
              .strict(),
          })
          .strict(),
      ]),
    ),
  })
  .strict();

const script = () =>
  scriptSchema.parse(
    JSON.parse(readFileSync(join(repositoryRoot, 'conformance/rows/script.json'), 'utf8')),
  );

/** Each asset the script stores, as it stores it. */
export const scriptAssets = async (): Promise<readonly StoredAsset[]> =>
  Promise.all(
    script()
      .steps.flatMap((step) => ('asset' in step ? [step.asset] : []))
      .map(async (asset) => {
        const admitted = await admitAsset(
          'text' in asset ? new TextEncoder().encode(asset.text) : Uint8Array.fromHex(asset.hex),
          asset.mediaType,
        );
        if (admitted.kind !== 'admitted') throw new Error(`the script's asset is refused`);
        if (admitted.asset.hash !== asset.hash) {
          throw new Error(
            `the script names ${asset.hash} for an asset whose hash is ${admitted.asset.hash}`,
          );
        }
        return admitted.asset;
      }),
  );

/** A snapshot as the wire decodes it, read through a create change. */
const snapshotOf = (space: ScriptSpace): SpaceSnapshot => {
  const [change] = decodeCommitRequest({
    changes: [{ kind: 'create', spaceId: space.id, snapshot: space }],
  }).changes;
  if (change.kind !== 'create') throw new Error('a create change');
  return change.snapshot;
};

/** Run the script on `repository`, failing unless each step lands. */
export const runRowsScript = async (repository: SpaceRepository): Promise<void> => {
  const { initialize, steps } = script();
  const initialized = await repository.initializeAggregate({
    metaSpaceId: initialize.metaSpaceId,
    spaces: initialize.spaces.map(snapshotOf),
  });
  if (initialized.kind !== 'initialized') {
    throw new Error(`the script initializes an empty store: ${initialized.kind}`);
  }
  const assets = (await scriptAssets())[Symbol.iterator]();
  for (const [index, step] of steps.entries()) {
    if ('asset' in step) {
      const asset = assets.next();
      if (asset.done === true) throw new Error('an asset for each asset step');
      const stored = await repository.storeAsset(asset.value);
      if (stored !== 'stored') throw new Error(`step ${index} stores its asset: ${stored}`);
    } else if ('markExported' in step) {
      const { spaceId, revision } = step.markExported;
      await repository.markExported(spaceId, BigInt(revision));
    } else {
      const answer = await repository.commit(decodeCommitRequest(step.commit));
      if (answer.kind !== 'committed') {
        throw new Error(`step ${index} commits: ${JSON.stringify(answer)}`);
      }
    }
  }
};
