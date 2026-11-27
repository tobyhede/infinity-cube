import { readFileSync } from 'node:fs';
import { MemorySpaceRepository } from '@project/aggregate';
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
