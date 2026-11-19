import { uuidSchema, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { readAggregateFrom } from '../src/aggregate-file';
import { mapSource, type AggregateSource } from '../src/aggregate-source';
import { AggregateDirectoryError, parseSingleSpace } from '../src/space-directory';

const META = uuidSchema.parse('10000000-0000-4000-8000-000000000001');
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Every case below carries its ids, or fails before one would be minted. */
const mintsNothing = (): UUID => {
  throw new Error('minted an id');
};

/** The directory error reading `source` rejects with, or a failure saying it read instead. */
const directoryError = async (source: AggregateSource): Promise<AggregateDirectoryError> => {
  try {
    await readAggregateFrom(source, mintsNothing);
  } catch (error) {
    if (error instanceof AggregateDirectoryError) return error;
    throw error;
  }
  throw new Error('read the directory rather than refusing it');
};

describe('the directory reader locating its own faults', () => {
  it('names the Aggregate directory itself as . when it cannot be listed', async () => {
    const source: AggregateSource = {
      name: '/talk',
      concurrency: 1,
      list: () => Promise.resolve({ ok: false, reason: 'EACCES: permission denied' }),
      read: () => Promise.resolve({ ok: false, reason: 'never read' }),
    };

    const error = await directoryError(source);

    expect(error.kind).toBe('discovery');
    expect(error.refusals).toEqual([{ kind: 'unreadable', file: '.' }]);
  });

  it('locates an aggregate.json that is not an object at the file, with no field', async () => {
    const source = mapSource('/talk', new Map([['aggregate.json', encode('[]')]]));

    const error = await directoryError(source);

    expect(error.refusals).toEqual([{ kind: 'invalid-shape', file: 'aggregate.json' }]);
  });

  it('passes on, unchanged, an error identifying a Space raises that is not a refusal', async () => {
    const minting = new Error('the id generator failed');
    const source = mapSource(
      '/talk',
      new Map([
        ['aggregate.json', encode(JSON.stringify({ version: 1, metaSpaceId: META }))],
        [
          `${META}/space.json`,
          encode(
            JSON.stringify({
              version: 1,
              title: 'Talk',
              maps: [
                {
                  title: 'Working',
                  kind: 'positioned',
                  positions: {},
                  graphs: [{ title: 'Main', edges: [] }],
                },
              ],
            }),
          ),
        ],
      ]),
    );

    await expect(
      readAggregateFrom(source, () => {
        throw minting;
      }),
    ).rejects.toBe(minting);
  });
});

describe('parseSingleSpace', () => {
  /** The refusals `parseSingleSpace` throws for a version 2 space file at `spaceFile`, under `/talk`. */
  const refusalsOfRefusedDocument = (spaceFile: string) => {
    try {
      parseSingleSpace({
        spaceFile,
        spaceText: JSON.stringify({ version: 2, title: 'Pre-release talk' }),
        resources: [],
        relative: (path) => path.replace('/talk/', ''),
      });
    } catch (error) {
      if (error instanceof AggregateDirectoryError) return error.refusals;
      throw error;
    }
    throw new Error('parseSingleSpace accepted a version 2 space file');
  };

  it('names a refused space file by its path relative to the Aggregate directory', () => {
    expect(refusalsOfRefusedDocument('/talk/deep-dive/space.json')).toEqual([
      { kind: 'unsupported-version', file: 'deep-dive/space.json', field: 'version' },
    ]);
  });

  it('names a refused space file at the root of the Aggregate directory as the file alone', () => {
    expect(refusalsOfRefusedDocument('/talk/space.json')).toEqual([
      { kind: 'unsupported-version', file: 'space.json', field: 'version' },
    ]);
  });
});
