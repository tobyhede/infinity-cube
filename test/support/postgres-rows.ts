/**
 * Rows read across runtimes (Storage ST-125) on PostgreSQL: a database of
 * its own on the server `DATABASE_URL` names, migrated from the plain-SQL
 * files under `migrations-sql/postgres/` and dropped after, and its rows
 * written as SQL, each timestamp as one fixed value, as
 * `crates/host/tests/postgres_rows.rs` writes them for the Rust host.
 *
 * Each database is created beside the one `DATABASE_URL` names, never in
 * it, so neither the integration database nor a person's own content is
 * touched; the role `DATABASE_URL` names must be allowed to create
 * databases, as Compose's is.
 *
 * Creating, migrating, replaying into and dumping a database go through
 * `pg`, the driver the facade itself runs on, rather than the database
 * facade (`@prisma-next/postgres`). Prisma Next 0.16.0's facade builds query
 * plans over the contract's tables and offers raw SQL only as an expression
 * inside one (as `src/prisma/sql-store.ts` notes), so it cannot run `CREATE
 * DATABASE` or `DROP DATABASE`, a migration file or a dump of several
 * statements, or a read of `information_schema`. The repository under test
 * is still reached through the facade (`withRepository`).
 * `docs/agents/build-tooling.md` records the exception.
 */
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import postgres from '@prisma-next/postgres/runtime';
import type { SpaceRepository } from '@project/aggregate';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import { configuredDatabaseUrl, postgresOptionsFor } from '../../src/prisma/db';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { repositoryRoot, runRowsScript } from './rows-script';

/** The rows the TypeScript host writes running the script, checked in for the Rust host. */
export const TYPESCRIPT_ROWS = join(
  repositoryRoot,
  'crates/host/tests/fixtures/typescript-postgres-rows.sql',
);

/** The rows the Rust host writes running the script, checked in for this host. */
export const RUST_ROWS = join(repositoryRoot, 'crates/host/tests/fixtures/rust-postgres-rows.sql');

/** The command that rewrites {@link TYPESCRIPT_ROWS}. */
export const REGENERATE_TYPESCRIPT_ROWS = 'pnpm exec tsx scripts/postgres-rows-fixture.ts';

/** Each table, in an order its foreign keys accept, and the key it is listed by. */
const TABLES: readonly { readonly table: string; readonly key: string }[] = [
  { table: 'spaces', key: 'id' },
  { table: 'resources', key: 'id' },
  { table: 'repository_state', key: 'singleton_id' },
  { table: 'assets', key: 'hash' },
];

/** What every timestamp is written as, since each run stores its own clock's. */
const TIMESTAMP = `'2000-01-01 00:00:00+00'`;

/** The server `DATABASE_URL` names, or a failure naming the variable. */
const serverUrl = (): string => {
  const url = configuredDatabaseUrl();
  if (url === undefined) {
    throw new Error('DATABASE_URL must name a PostgreSQL server whose role may create databases');
  }
  return url;
};

/** `server` naming the database `name` instead of its own. */
const naming = (server: string, name: string): string => {
  const url = new URL(server);
  url.pathname = `/${name}`;
  url.searchParams.delete('dbname');
  return url.toString();
};

/** Run `statements` on the database `url` names, through a connection of its own. */
export const execute = async (url: string, statements: string): Promise<void> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statements);
  } finally {
    await client.end();
  }
};

/**
 * Run `work` with the URL of a new database on the server `DATABASE_URL`
 * names, migrated from `migrations-sql/postgres/` in order, and drop the
 * database after, whether or not `work` succeeds.
 */
export const withFreshDatabase = async <T>(work: (url: string) => Promise<T>): Promise<T> => {
  const server = serverUrl();
  const name = `cube_rows_${randomBytes(6).toString('hex')}`;
  await execute(server, `CREATE DATABASE ${name}`);
  try {
    const url = naming(server, name);
    const migrations = join(repositoryRoot, 'migrations-sql/postgres');
    for (const file of readdirSync(migrations).toSorted()) {
      await execute(url, readFileSync(join(migrations, file), 'utf8'));
    }
    return await work(url);
  } finally {
    await execute(server, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  }
};

/** Run `work` with the TypeScript SQL repository over the database `url` names. */
export const withRepository = async <T>(
  url: string,
  work: (repository: SpaceRepository) => Promise<T>,
): Promise<T> => {
  const database = postgres<Contract>(postgresOptionsFor(url));
  try {
    return await work(new SqlSpaceRepository(postgresSqlStore(database)));
  } finally {
    await database.close();
  }
};

/**
 * The expression that writes `column`, of `dataType`, as the SQL literal
 * that reads it back. A `jsonb` document is written as the server's own text
 * for it, keys in the order `jsonb` keeps them.
 */
const literal = (column: string, dataType: string): string => {
  if (column === 'created_at' || column === 'updated_at') return `quote_literal(${TIMESTAMP})`;
  if (dataType === 'bytea') {
    return `'decode(' || quote_literal(encode("${column}", 'hex')) || ', ''hex'')'`;
  }
  return `quote_nullable("${column}"::text)`;
};

/** The rows of the database `url` names as SQL that inserts them, below `header`. */
export const dumpRows = async (url: string, header: readonly string[]): Promise<string> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const statements: string[] = [];
    for (const { table, key } of TABLES) {
      const columns = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name::text, data_type::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      );
      const names = columns.rows.map(({ column_name }) => `"${column_name}"`).join(', ');
      const values = columns.rows
        .map(({ column_name, data_type }) => literal(column_name, data_type))
        .join(` || ', ' || `);
      const rows = await client.query<{ row: string }>(
        `SELECT ${values} AS row FROM public."${table}" ORDER BY "${key}"::text COLLATE "C"`,
      );
      statements.push(
        ...rows.rows.map(({ row }) => `INSERT INTO public."${table}" (${names}) VALUES (${row});`),
      );
    }
    return [...header, ...statements, ''].join('\n');
  } finally {
    await client.end();
  }
};

/** The header {@link TYPESCRIPT_ROWS} carries. */
const TYPESCRIPT_HEADER = [
  '-- The rows the TypeScript host wrote running conformance/rows/script.json on a',
  '-- migrated PostgreSQL database, each timestamp written as one fixed value,',
  '-- written by scripts/postgres-rows-fixture.ts. Regenerate them with:',
  `--   ${REGENERATE_TYPESCRIPT_ROWS}`,
];

/** Each line of `rows` but its header comments: the rows alone. */
export const rowsOnly = (rows: string): string =>
  rows
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n');

/**
 * The rows the TypeScript SQL repository writes running the script on a
 * freshly migrated database, as {@link TYPESCRIPT_ROWS} holds them.
 */
export const typescriptRows = async (): Promise<string> =>
  withFreshDatabase(async (url) => {
    await withRepository(url, runRowsScript);
    return dumpRows(url, TYPESCRIPT_HEADER);
  });
