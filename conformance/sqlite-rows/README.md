# SQLite rows conformance script

The steps each runtime runs on a migrated SQLite file so that each can read the rows the other wrote (Storage ST-125): initialize from Default Content under fixed ids, store four assets, and commit a Resource of a kind no plugin lists, an Ur, a Mermaid, an Image and a Reference Resource, Edges with no Title and with a hidden one, a created Space with the Space Resource linking it, a created and then deleted Space, and Edits to Resources in two Spaces. Snapshots and commits are in the wire's shape, so each runtime decodes them with its own commit decoder; each asset names its hash, which each runtime checks.

- `crates/host/tests/sqlite_rows.rs` runs it on the Rust SQLite repository and holds `crates/host/tests/fixtures/rust-sqlite-rows.sql` to the rows it writes (`INFINITY_CUBE_WRITE_ROWS=1 cargo nextest run -p host --test sqlite_rows` rewrites it), and replays `typescript-sqlite-rows.sql`.
- `test/support/sqlite-rows.ts` runs it on the TypeScript SQL repository: `scripts/sqlite-rows-fixture.ts` writes `crates/host/tests/fixtures/typescript-sqlite-rows.sql`, and `test/integration/sqlite-rows-across-runtimes.test.ts` (in `pnpm test:integration:sqlite`) holds that file current and replays the Rust rows.

Each dump writes every timestamp as one fixed value, since each run stores its own clock's. A change to the script changes both dumps in one change.
