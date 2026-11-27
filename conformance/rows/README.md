# Rows conformance script

The steps each runtime runs on a migrated SQLite file or PostgreSQL database so that each can read the rows the other wrote (Storage ST-125): initialize from Default Content under fixed ids, store six assets, two of them bytes that are not UTF-8 written as `hex`, and commit a Resource of a kind no plugin lists (its content's keys in an order `jsonb` does not keep), an Ur, a Mermaid, two Image Resources (one with a Title holding a newline and characters outside ASCII and the Basic Multilingual Plane), a Reference Resource, Edges with no Title and with a hidden one, a created Space with the Space Resource linking it, a created and then deleted Space, two Spaces marked exported at the revisions they hold, and then Edits to Resources in those two Spaces. Snapshots and commits are in the wire's shape, so each runtime decodes them with its own commit decoder; each asset names its hash, which each runtime checks. `test/support/rows-script.ts` and `crates/host/tests/rows_support/` run it.

SQLite:

- `crates/host/tests/sqlite_rows.rs` runs it on the Rust SQLite repository and holds `crates/host/tests/fixtures/rust-sqlite-rows.sql` to the rows it writes (`INFINITY_CUBE_WRITE_ROWS=1 cargo nextest run -p host --test sqlite_rows` rewrites it), and replays `typescript-sqlite-rows.sql`.
- `test/support/sqlite-rows.ts` runs it on the TypeScript SQL repository: `scripts/sqlite-rows-fixture.ts` writes `crates/host/tests/fixtures/typescript-sqlite-rows.sql`, and `test/integration/sqlite-rows-across-runtimes.test.ts` (in `pnpm test:integration:sqlite`) holds that file current and replays the Rust rows.

PostgreSQL, each run on a database of its own created on the test server and dropped after:

- `crates/host/tests/postgres_rows.rs` runs it on the Rust PostgreSQL repository and holds `crates/host/tests/fixtures/rust-postgres-rows.sql` to the rows it writes (`INFINITY_CUBE_WRITE_ROWS=1 INFINITY_CUBE_POSTGRES_TEST_URL=<server> cargo nextest run -p host --test postgres_rows --run-ignored only` rewrites it), and replays `typescript-postgres-rows.sql`. CI's `rust` job runs it with the other `postgres*` binaries.
- `test/support/postgres-rows.ts` runs it on the TypeScript SQL repository: `scripts/postgres-rows-fixture.ts` writes `crates/host/tests/fixtures/typescript-postgres-rows.sql` on the server `DATABASE_URL` names, and `test/integration/postgres-rows-across-runtimes.test.ts` (in `pnpm test:integration:postgres`) holds that file current, holds the Rust rows to it, and replays the Rust rows.

Each dump writes every timestamp as one fixed value, since each run stores its own clock's. A PostgreSQL dump writes each `jsonb` document as the server's own text for it, so keys are in the order `jsonb` keeps them; a Rust read of PostgreSQL rows is compared with its memory store with the order of an object's keys left out, as TypeScript's `toEqual` compares. A change to the script changes every dump in one change.
