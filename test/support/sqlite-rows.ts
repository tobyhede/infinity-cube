/**
 * Rows read across runtimes (Storage ST-125) on SQLite: the rows of
 * a SQLite file written as SQL, each timestamp as one fixed value, as
 * `crates/host/tests/sqlite_rows.rs` writes them for the Rust host.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { repositoryRoot, runRowsScript } from './rows-script';
import { migrateSqliteFile } from './sqlite-harness';

/** The rows the TypeScript host writes running the script, checked in for the Rust host. */
export const TYPESCRIPT_ROWS = join(
  repositoryRoot,
  'crates/host/tests/fixtures/typescript-sqlite-rows.sql',
);

/** The rows the Rust host writes running the script, checked in for this host. */
export const RUST_ROWS = join(repositoryRoot, 'crates/host/tests/fixtures/rust-sqlite-rows.sql');

/** The command that rewrites {@link TYPESCRIPT_ROWS}. */
export const REGENERATE_TYPESCRIPT_ROWS = 'pnpm exec tsx scripts/sqlite-rows-fixture.ts';

/** Each table, in an order its foreign keys accept, and the key it is listed by. */
const TABLES: readonly { readonly table: string; readonly key: string }[] = [
  { table: 'spaces', key: 'id' },
  { table: 'resources', key: 'id' },
  { table: 'repository_state', key: 'singleton_id' },
  { table: 'assets', key: 'hash' },
];

/** What every timestamp is written as, since each run stores its own clock's. */
const TIMESTAMP = `'2000-01-01 00:00:00'`;

/**
 * The rows of the SQLite file `path` as SQL that inserts them, below
 * `header`. SQLite's own `quote()` writes each value as the literal that
 * reads it back, a blob as `X'…'`.
 */
export const dumpRows = (path: string, header: readonly string[]): string => {
  // A static `import 'node:sqlite'` fails to load under this Vitest's resolver.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const statements = TABLES.flatMap(({ table, key }) => {
      const columns = database
        .prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`)
        .all(table)
        .map((column) => String(column['name']));
      const names = columns.map((column) => `"${column}"`).join(', ');
      const values = columns
        .map((column) =>
          column === 'created_at' || column === 'updated_at'
            ? `quote(${TIMESTAMP})`
            : `quote("${column}")`,
        )
        .join(` || ', ' || `);
      return database
        .prepare(`SELECT ${values} AS row FROM "${table}" ORDER BY "${key}"`)
        .all()
        .map((row) => `INSERT INTO "${table}" (${names}) VALUES (${String(row['row'])});`);
    });
    return [...header, ...statements, ''].join('\n');
  } finally {
    database.close();
  }
};

/** The header {@link TYPESCRIPT_ROWS} carries. */
const TYPESCRIPT_HEADER = [
  '-- The rows the TypeScript host wrote running conformance/rows/script.json',
  '-- on a migrated SQLite file, each timestamp written as one fixed value, written',
  '-- by scripts/sqlite-rows-fixture.ts. Regenerate them with:',
  `--   ${REGENERATE_TYPESCRIPT_ROWS}`,
];

/**
 * The rows the TypeScript SQL repository writes running the script on a
 * freshly migrated file, as {@link TYPESCRIPT_ROWS} holds them.
 */
export const typescriptRows = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-sqlite-rows-'));
  try {
    const path = join(directory, 'infinity-cube.db');
    migrateSqliteFile(path);
    const database = createSqliteDatabase(path);
    try {
      await runRowsScript(new SqlSpaceRepository(sqliteSqlStore(database)));
    } finally {
      await database.close();
    }
    return dumpRows(path, TYPESCRIPT_HEADER);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
