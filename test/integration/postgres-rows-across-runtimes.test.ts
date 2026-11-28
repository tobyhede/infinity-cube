import { readFileSync } from 'node:fs';
import { MemorySpaceRepository, type SpaceRepository } from '@project/aggregate';
import { uuidSchema } from '@project/core';
import { describe, expect, it } from 'vitest';
import {
  execute,
  REGENERATE_TYPESCRIPT_ROWS,
  rowsOnly,
  RUST_ROWS,
  TYPESCRIPT_ROWS,
  typescriptRows,
  withFreshDatabase,
  withRepository,
} from '../support/postgres-rows';
import { runRowsScript, scriptAssets } from '../support/rows-script';

const META = 'e0000000-0000-4000-8000-000000000001';
const CHILD = 'e0000000-0000-4000-8000-000000000020';
const CHART = uuidSchema.parse('e0000000-0000-4000-8000-000000000007');

/**
 * What `conformance/rows/script.json` leaves stored, as literals, as
 * `assert_holds_what_the_script_names` in `crates/host/tests/rows_support/mod.rs`
 * holds the Rust host to it: comparing with the memory store alone passes when
 * the TypeScript intake both sides share loses a field.
 */
const expectWhatTheScriptNames = async (repository: SpaceRepository): Promise<void> => {
  const loaded = await repository.loadAggregate();
  if (loaded.kind !== 'loaded') throw new Error(`the aggregate is stored: ${loaded.kind}`);
  const { aggregate } = loaded;
  expect(aggregate.metaSpaceId, 'the Meta Space').toBe(META);
  expect(
    aggregate.spaces.map(({ snapshot, revision, exportedRevision }) => ({
      id: snapshot.id,
      revision,
      exportedRevision,
    })),
    'each Space, its revision and its exported revision',
  ).toStrictEqual([
    { id: META, revision: 5n, exportedRevision: 4n },
    { id: CHILD, revision: 1n, exportedRevision: 0n },
  ]);
  expect(await repository.listSpaces(), 'the Spaces listed').toStrictEqual([
    { id: META, title: 'New space' },
    { id: CHILD, title: 'Child' },
  ]);
  const space = aggregate.spaces[0]?.snapshot;
  expect(space?.resources[0]?.document.title, 'the Title the last commit changes').toBe(
    'Resource one',
  );
  const chart = space?.resources.find(({ id }) => id === CHART)?.document;
  expect(chart?.kind, 'the kind of the Resource of an unlisted kind').toBe('vnd.example.chart');
  expect(chart?.content, 'its content, as the last commit leaves it').toStrictEqual({
    made: '/assets/zeS2_lTSbTYWCPNCX7jFe0jur7WWD0CZHRP1pmaSfZs',
    raw: '/assets/QK_y6dLYki5Hr9RkjmlnSXFYeF-9Hahw5xECZr-USIA',
    series: [],
    label: 'edited',
  });
  const map = space?.document.maps?.[0];
  expect(Object.keys(map?.positions ?? {}), "the Map's placements").toHaveLength(8);
  expect(
    map?.positions[CHART],
    "the chart's position, size, absent Edit size and Map content",
  ).toStrictEqual({ x: 0, y: 300, size: { width: 320, height: 180 }, content: { zoom: 2 } });
  expect(map?.graphs[0]?.edges, 'the Edges, each Title and whether it is hidden').toStrictEqual([
    { from: 'e0000000-0000-4000-8000-000000000002', to: 'e0000000-0000-4000-8000-000000000005' },
    {
      from: 'e0000000-0000-4000-8000-000000000005',
      to: 'e0000000-0000-4000-8000-000000000006',
      title: 'draws',
      titleHidden: true,
    },
    { from: 'e0000000-0000-4000-8000-000000000006', to: CHART, title: 'charts' },
  ]);
};

// Rows read across runtimes on PostgreSQL (Storage ST-125), with
// `crates/host/tests/postgres_rows.rs` the Rust half: each runtime runs
// `conformance/rows/script.json` on a migrated database of its own and its
// rows are checked in, and each reads the other's.
describe('PostgreSQL rows across runtimes', () => {
  it('holds the checked-in TypeScript rows to what the script writes now', async () => {
    const rows = await typescriptRows();

    expect(
      readFileSync(TYPESCRIPT_ROWS, 'utf8') === rows,
      `${TYPESCRIPT_ROWS} is not the rows the script writes now; regenerate it with: ${REGENERATE_TYPESCRIPT_ROWS}`,
    ).toBe(true);
  });

  it('holds the Rust rows to the rows this host writes', () => {
    expect(rowsOnly(readFileSync(RUST_ROWS, 'utf8'))).toBe(
      rowsOnly(readFileSync(TYPESCRIPT_ROWS, 'utf8')),
    );
  });

  it('reads the rows the Rust host wrote as the memory store runs the script', async () => {
    await withFreshDatabase(async (url) => {
      await execute(url, readFileSync(RUST_ROWS, 'utf8'));
      const memory = new MemorySpaceRepository();
      await runRowsScript(memory);

      await withRepository(url, async (postgres) => {
        await expectWhatTheScriptNames(postgres);
        expect(await postgres.loadAggregate()).toEqual(await memory.loadAggregate());
        expect(await postgres.listSpaces()).toEqual(await memory.listSpaces());
        const assets = await scriptAssets();
        expect(assets.length).toBeGreaterThan(0);
        for (const asset of assets) {
          const stored = await postgres.loadAsset(asset.hash);
          expect(stored).toEqual(asset);
          expect(stored).toEqual(await memory.loadAsset(asset.hash));
        }
      });
    });
  });
});
