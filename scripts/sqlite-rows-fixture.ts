/**
 * Writes the rows the TypeScript host stored in a SQLite file as SQL, which
 * `crates/host/tests/sqlite.rs` › `given_rows_the_typescript_host_wrote`
 * replays over a freshly migrated file to hold the Rust SQLite repository to
 * reading them (Storage ST-125). Regenerate the fixture with:
 *
 *   SQLITE_PATH=<dir>/cube.db pnpm db:migrate:sqlite
 *   SQLITE_PATH=<dir>/cube.db pnpm cube import packages/app/fixture --store sqlite
 *   pnpm exec tsx scripts/sqlite-rows-fixture.ts <dir>/cube.db \
 *     crates/host/tests/fixtures/typescript-sqlite-rows.sql
 */
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** Each table, in an order its foreign keys accept, and the key it is listed by. */
const TABLES: readonly { readonly table: string; readonly key: string }[] = [
  { table: 'spaces', key: 'id' },
  { table: 'resources', key: 'id' },
  { table: 'repository_state', key: 'singleton_id' },
  { table: 'assets', key: 'hash' },
];

const [source, target] = process.argv.slice(2);
if (source === undefined || target === undefined) {
  throw new Error('Usage: tsx scripts/sqlite-rows-fixture.ts <sqlite file> <output .sql file>');
}

const database = new DatabaseSync(source, { readOnly: true });
/** A table's columns, in the order the schema lists them. */
const columnsOf = (table: string): readonly string[] =>
  database
    .prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`)
    .all(table)
    .map((column) => String(column['name']));

// SQLite's own `quote()` writes each value as the literal that reads it back,
// a blob as `X'…'`.
const statements = TABLES.flatMap(({ table, key }) => {
  const columns = columnsOf(table);
  const quoted = columns.map((column) => `quote("${column}")`).join(', ');
  const names = columns.map((column) => `"${column}"`).join(', ');
  return database
    .prepare(`SELECT ${quoted} FROM "${table}" ORDER BY "${key}"`)
    .all()
    .map((row) => {
      const values = Object.values(row).map(String).join(', ');
      return `INSERT INTO "${table}" (${names}) VALUES (${values});`;
    });
});
database.close();

writeFileSync(
  target,
  [
    '-- The rows the TypeScript host wrote importing packages/app/fixture into a',
    '-- migrated SQLite file, written by scripts/sqlite-rows-fixture.ts, which says',
    '-- how to regenerate them.',
    ...statements,
    '',
  ].join('\n'),
);
