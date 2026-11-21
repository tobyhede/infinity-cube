import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * The plain-SQL migrations in `migrations-sql/` are the one schema history
 * both hosts apply (ADR 0155): Prisma Next applies each package's `ops.json`,
 * and the Rust host applies the `.sql` files through `sqlx`. This holds each
 * file to the statements its package's operations execute, in order; the
 * prechecks and postchecks Prisma Next runs around them are not schema and are
 * not in the file. That both produce the same schema is
 * `crates/host/tests/shared_migrations.rs`, which applies both to a database.
 */

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const TREES = [
  { database: 'PostgreSQL', prisma: 'migrations/app', sql: 'migrations-sql/postgres' },
  { database: 'SQLite', prisma: 'migrations-sqlite/app', sql: 'migrations-sql/sqlite' },
] as const;

const opsSchema = z.array(
  z.object({
    id: z.string(),
    execute: z.array(z.object({ sql: z.string(), params: z.array(z.unknown()).optional() })),
  }),
);

const listing = (directory: string): readonly string[] =>
  readdirSync(join(repositoryRoot, directory)).sort();

/** `20260728T1242_initial` is `202607281242_initial.sql`: sqlx reads a whole-number version. */
const sqlFileFor = (packageName: string): string => {
  const separator = packageName.indexOf('_');
  return `${packageName.slice(0, separator).replace('T', '')}${packageName.slice(separator)}.sql`;
};

const opsOf = (directory: string, packageName: string) =>
  opsSchema.parse(
    JSON.parse(readFileSync(join(repositoryRoot, directory, packageName, 'ops.json'), 'utf8')),
  );

describe.each(TREES)('the shared $database migrations', ({ prisma, sql }) => {
  const packages = listing(prisma);

  it('hold one plain-SQL file for each Prisma migration, in the same order', () => {
    expect(packages.length).toBeGreaterThan(0);
    expect(listing(sql)).toEqual(packages.map(sqlFileFor));
  });

  it.each(packages)('hold %s as the statements Prisma executes', (packageName) => {
    const statements = opsOf(prisma, packageName).flatMap(({ execute }) => execute);

    expect(statements.filter(({ params }) => (params ?? []).length > 0)).toEqual([]);
    expect(readFileSync(join(repositoryRoot, sql, sqlFileFor(packageName)), 'utf8')).toBe(
      `${statements.map((statement) => `${statement.sql};`).join('\n\n')}\n`,
    );
  });
});
