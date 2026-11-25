# 05 — The PostgreSQL store of statements and its test support

**Status:** blocked (needs-info: Q5–Q10)

**Blocked by:** 04.

**What to build:** `crates/host/src/sql/postgres.rs`: PostgreSQL's `SqlStore` beneath the one SQL repository (ST-3), over the schema `migrations-sql/postgres/` produces, and the test support every later ticket uses.

- [ ] Statements for every `SqlStore` method: ids and `meta_space_id` bound and read as `uuid`; documents written as `jsonb` from the codec's compact text and read back as text; `created_at` kept by an upsert and `updated_at` set to `now()` on every write of a row (`src/prisma/contract.prisma:13,33`; the columns have no default after `migrations-sql/postgres/202607290142_drop_updated_at_defaults.sql`); the aggregate lock as `pg_advisory_xact_lock(1213812818, 1)` and `pg_advisory_xact_lock_shared(1213812818, 1)` (`src/prisma/sql-store.ts:242,255`); row locks by `UPDATE … RETURNING` the prior revision, as TypeScript's `writeDocumentUnderLock` and `relock` (`src/persistence/sql-store.ts:436-439,487-494`).
- [ ] Every transaction sets READ COMMITTED (Q3) and no lock or statement timeout (Q4).
- [ ] `classify` as Q5 decides, with a unit test per SQLSTATE in and out of the allowlist and per `io::ErrorKind`, so a mutant answering every error unavailable, or any one code wrongly, fails.
- [ ] The pool as Q8 decides; the store reopens connections after an outage.
- [ ] Test support (`crates/host/tests/postgres_support/`): a database per test, cloned from one template migrated with `sqlx`'s migrator from `migrations-sql/postgres/`, dropped afterwards; the server named by one variable; the guard Q9 describes (a test that fails when `CI` is set and the variable is not). Tests are `#[ignore]`d and the `rust` job runs them with `--run-ignored only`, failing if nextest reports zero run; the `crap-rust` job starts Compose's PostgreSQL and runs them too.
- [ ] Ports, carrying their `// Case:` lines: `prisma-postgres.test.ts` › "writes and reads a typed space document with its resource" and "advances updatedAt when a space is updated".
- [ ] A test with a pool of one connection: a commit that takes the fast path and is handed to the aggregate decision completes (it holds one connection at a time).
- [ ] `sqlx` gains the `postgres` feature (and `tls-rustls` if Q10 says so) in `[workspace.dependencies]`; clippy and nextest stay green under the workspace lints.

**Named mutants:** `updated_at` not set on update; `created_at` overwritten by an upsert; advisory key or mode differing from TypeScript's; READ COMMITTED replaced by SERIALIZABLE or REPEATABLE READ; `40001` or `ECONNREFUSED` classified unclassified; `28P01` or `3D000` classified unavailable; every error classified unavailable; `23505` on `resources_pkey` not answered as the ownership refusal; the guard test removed (CI must still fail when the variable is unset, because the zero-run check does).
