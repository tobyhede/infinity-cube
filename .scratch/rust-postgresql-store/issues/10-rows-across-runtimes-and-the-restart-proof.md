# 10 — Rows read across runtimes, and the restart proof on Rust

**Status:** ready-for-agent once 09 lands

**Blocked by:** 09; #528's 08 (its fixture scripts and currency checks, which this extends to PostgreSQL).

**What to build:** Checks that a PostgreSQL database written by either runtime reads correctly in the other, in both directions, and the PostgreSQL restart proof run on `serve --store postgres`.

- [ ] A Rust test replays a checked-in dump of rows the TypeScript repository wrote to PostgreSQL (written by a script, as `scripts/sqlite-rows-fixture.ts` writes SQLite's), and asserts `load_aggregate`, `list_spaces` and `load_asset` absolutely; a check regenerates the dump and fails CI, naming the command, when it is stale.
- [ ] A test in `pnpm test:integration:postgres` loads a dump the Rust repository wrote (by the same script of commits #528's 08 runs: initialize from Default Content, store an asset, create and link a Space, delete a Space, edit a Resource) and compares what TypeScript reads with the same script run on the TypeScript memory store, with the same currency check.
- [ ] Both dumps hold a Resource of a kind no plugin lists, an Ur and a Mermaid Resource, an Edge with no Title drawn, and content whose keys `jsonb` reorders.
- [ ] `pnpm e2e:postgres` starts its hosts by command as the SQLite proof does (`test/support/restart-proof-host.ts`), and CI's `postgres` job runs it on the Vite host and on `serve --store postgres` built in that job.
