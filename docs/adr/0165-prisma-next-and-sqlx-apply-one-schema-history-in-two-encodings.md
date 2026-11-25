# Prisma Next and sqlx apply one schema history in two encodings, held equal by tests

Status: accepted
Date: 2026-11-20
Refines: 0155
Refined by: 0173
Related: 0030, 0085, 0095

ADR 0155 says both hosts share one database schema until PostgreSQL moves, through "plain SQL files that Prisma (PostgreSQL), the SQLite migrator and `sqlx` all apply, held to one schema by a test". Prisma Next applies a migration package's `ops.json`, not a SQL file, and the packages already in `migrations/app/` and `migrations-sqlite/app/` are history that is never rewritten (ADR 0085): a rewritten package passes against a database migrated from it and fails against a fresh one, and its hash no longer matches what Prisma Next recorded in a database it migrated. The maintainer ruled on 20 November 2026 (conflict Storage S3) that the history is kept in two encodings and held equal by tests.

## The decision

- **The plain-SQL files are `migrations-sql/postgres/` and `migrations-sql/sqlite/`**, in the layout `sqlx`'s migrator reads: one file per Prisma Next package, named for it with the `T` dropped from its timestamp, holding the statements that package's operations execute, in order. Prisma Next's prechecks and postchecks are not schema and are not in the file.
- **Prisma Next keeps applying its own packages**, and `sqlx` applies the files. `test/unit/shared-migrations.test.ts` holds each file to its package statement for statement, and `crates/host/tests/shared_migrations.rs` holds the schema each tool produces to the other's, on SQLite and on PostgreSQL.
- **A schema change adds a package and its file together**, until Rust owns the history when PostgreSQL moves to it (ADR 0155), and the Prisma Next packages go.

## Why

Both tools produce the same schema, which is what ADR 0155 wants one history for, and nothing already migrated breaks. Neither tool yet records the other's applied migrations, so serving a database the other migrated also needs that record seeded, which the Rust stores (rust-host 15, 16) take on.

## Rejected

- **Rewriting the existing packages so each executes its `.sql` file through `rawSql`.** It would make Prisma Next read the files literally, at the cost of the never-rewrite rule and of every database Prisma Next migrated before.
- **Writing only new packages as one `rawSql` reading the file.** The history would still be in two encodings, so the tests are needed anyway, and a second way of writing a package buys nothing they do not already hold.

## Consequences

Two copies of each statement live in the repository until PostgreSQL moves, and the unit test fails the moment they disagree. Storage ST-125 restates the rule.
