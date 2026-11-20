# 14 — One set of plain-SQL migrations for both hosts

**Status:** resolved

**Blocked by:** 09.

**What to build:** The PostgreSQL (`migrations/`, Prisma) and SQLite (`migrations-sqlite/`) migrations as plain SQL files that Prisma, the SQLite migrator and `sqlx migrate` all apply, with a test that the schema each produces is the same. Ownership moves to Rust with 16.

- [x] Both TypeScript database suites green on the shared files.
- [x] `sqlx migrate` produces the same schema, checked in CI.

**As built.** The migration packages are history and are never rewritten (ADR 0085; `test/unit/current-domain-vocabulary.test.ts`), so the Prisma Next packages stay as they are and the shared files sit beside them in `sqlx`'s layout: `migrations-sql/postgres/` and `migrations-sql/sqlite/`, one file per package, named for it with the `T` dropped from its timestamp (sqlx reads a whole-number version). Each file is the statements its package's `ops.json` operations execute, in order (not the prechecks and postchecks Prisma Next runs around them), which `test/unit/shared-migrations.test.ts` holds; so the schema statements Prisma Next applies are these files', and the TypeScript suites, which migrate through Prisma Next, run on them unchanged. `crates/host/tests/shared_migrations.rs` applies the files with sqlx's `Migrator` (the library `sqlx migrate run` and `sqlx::migrate!` use, rather than the separately installed `sqlx-cli`) and Prisma Next's `migrate` to two fresh databases and compares their schemas: every `sqlite_schema` entry with its SQL on SQLite, and every relation, column, constraint and index in `public` on PostgreSQL, each tool's own bookkeeping tables left out. Both tests are `#[ignore]`d, since they run Prisma Next through pnpm and need a server, and CI's `rust` job runs them with `--run-ignored only` against PostgreSQL started through Compose, as the `postgres` job starts it. `sqlx` is a dev-dependency of `host` until 15 makes it a dependency; its SQLite driver links the same bundled `libsqlite3-sys` 0.40 as `rusqlite`.

**Departure from ADR 0155's wording.** The ADR says Prisma applies the plain SQL files; as built it applies its own packages, held to the files statement for statement, because those packages are never rewritten. Recorded as conflict S3 in `docs/requirements/conflicts/storage.md`, which the maintainer ruled on 20 November 2026 (option a, keep both held equal by tests), recorded as ADR 0165.

**Evidence.** Locally on PostgreSQL 16 (CI uses `compose.yaml`'s PostgreSQL 17) and a SQLite temp file: both Rust tests pass, and fail when a statement is appended to the last file of either tree; the unit test fails when a file differs from its package by one line. Under Node 26.8.1, the whole Vitest suite (373 files), `pnpm test:integration:sqlite` (141 tests) and `pnpm test:integration:postgres` pass, except `postgres-misconfiguration.test.ts`'s three wrong-password cases, which a local server trusting every connection cannot refuse.
