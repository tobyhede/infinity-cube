import { readFileSync } from 'node:fs';
import { MemorySpaceRepository } from '@project/aggregate';
import { describe, expect, it } from 'vitest';
import { openSqliteRepository } from '../support/sqlite-harness';
import { runRowsScript, scriptAssets } from '../support/rows-script';
import {
  REGENERATE_TYPESCRIPT_ROWS,
  RUST_ROWS,
  TYPESCRIPT_ROWS,
  typescriptRows,
} from '../support/sqlite-rows';

// Rows read across runtimes (Storage ST-125), with
// `crates/host/tests/sqlite_rows.rs` the Rust half: each runtime runs
// `conformance/rows/script.json` on a migrated file and its rows are
// checked in, and each reads the other's.
describe('SQLite rows across runtimes', () => {
  it('holds the checked-in TypeScript rows to what the script writes now', async () => {
    const rows = await typescriptRows();

    expect(
      readFileSync(TYPESCRIPT_ROWS, 'utf8') === rows,
      `${TYPESCRIPT_ROWS} is not the rows the script writes now; regenerate it with: ${REGENERATE_TYPESCRIPT_ROWS}`,
    ).toBe(true);
  });

  it('reads the rows the Rust host wrote as the memory store runs the script', async () => {
    const opened = await openSqliteRepository();
    try {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const database = new DatabaseSync(opened.path);
      try {
        database.exec(readFileSync(RUST_ROWS, 'utf8'));
      } finally {
        database.close();
      }
      const sqlite = await opened.reopenRepository();
      const memory = new MemorySpaceRepository();
      await runRowsScript(memory);

      expect(await sqlite.loadAggregate()).toEqual(await memory.loadAggregate());
      expect(await sqlite.listSpaces()).toEqual(await memory.listSpaces());
      const assets = await scriptAssets();
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) {
        const stored = await sqlite.loadAsset(asset.hash);
        expect(stored).toEqual(asset);
        expect(stored).toEqual(await memory.loadAsset(asset.hash));
      }
    } finally {
      await opened.close();
    }
  });
});
