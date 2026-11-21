# Shared plain-SQL migrations

The schema history both runtimes apply (ADR 0155, Storage ST-125): `postgres/` for PostgreSQL and `sqlite/` for SQLite, in the layout `sqlx`'s migrator reads, a whole-number version and a description per file.

Each file is one Prisma Next migration package — `migrations/app/<package>` or `migrations-sqlite/app/<package>` — named for it with the `T` dropped from its timestamp, and holds the statements that package's `ops.json` operations execute, in order, each ended by `;` and separated by a blank line; the prechecks and postchecks Prisma Next runs around them are left out. `test/unit/shared-migrations.test.ts` holds the two to one another, and `crates/host/tests/shared_migrations.rs` holds the schema `sqlx` produces from these files to the one Prisma Next produces from its packages.

A migration is history and is never rewritten: a schema change adds a package and its file together.
