# 10 — Rows read across runtimes, and the restart proof on Rust

**Status:** ready-for-agent

**Blocked by:** 09.
**Waits on:** #528's 08 (its fixture scripts and currency checks, which this extends to PostgreSQL). Edits CI's `postgres` job as rust-host 16 does; rebase on whichever lands first.

**What to build:** Checks that a PostgreSQL database written by either runtime reads correctly in the other, in both directions, and the PostgreSQL restart proof on `serve --store postgres`.

- [x] A Rust test replays a checked-in dump of rows the TypeScript repository wrote to PostgreSQL (written by a script, as `scripts/sqlite-rows-fixture.ts` writes SQLite's) and asserts `load_aggregate`, `list_spaces` and `load_asset` absolutely; a check regenerates the dump and fails CI, naming the command, when it is stale.
- [x] A test in `pnpm test:integration:postgres` loads a dump the Rust repository wrote (by the script of commits #528's 08 runs) and compares what TypeScript reads with the same script run on the TypeScript memory store, with the same currency check.
- [x] Both dumps hold a Resource of a kind no plugin lists, an Ur and a Mermaid Resource, an Edge with no Title drawn, and content whose keys `jsonb` reorders.
- [x] `pnpm e2e:postgres` (`test/e2e/postgres-persistence.spec.ts:46`, ported here) starts its hosts by command as the SQLite proof does (`test/support/restart-proof-host.ts`), and CI's `postgres` job runs it on the Vite host and on `serve --store postgres` built in that job.
- [x] `AGENTS.md` (E2E) and Storage's restart-proof text say the PostgreSQL proof runs on both hosts.

**Named mutants (each killed by this ticket's tests):** Rust writing a document key TypeScript does not read; Rust writing `revision` as a number rather than text; the restart proof's command host ignored (still starting Vite).

## Comments

- Built first: the restart proof on both hosts. `test/e2e/postgres-persistence.spec.ts` starts its hosts as the SQLite proof does, through `startRestartProofHost` in `test/support/restart-proof-host.ts`, which both proofs now share. `test/unit/restart-proof-host.test.ts` › "starts the command named, and never the Vite host" kills the named mutant "the command host ignored": that test's Vite starter rejects.
- CI's `postgres` job builds the CLI and the browser application after the Vite proof and runs the proof again on `serve --store postgres --built packages/app/dist`, with a cache key of its own. The job's timeout is now 30 minutes, as the `sqlite` job's is for the same cold build.
- Run locally under Node 26, on a database migrated from `migrations-sql/postgres/`: the proof passed on the Vite host and on the Rust host.
- Still to build: the two row dumps and their currency checks (the first three boxes). They extend the scripts that `rust-sqlite-test-coverage` 08 is to write for SQLite: a check that regenerates the TypeScript-written dump, a Rust script of commits writing a dump, and a TypeScript test reading it. That ticket is still `ready-for-agent`, so nothing exists yet to extend.

**2026-11-28, implement-tickets run.** Built on PR #556 (`feat/rust-postgresql-store-10-rows-across-runtimes-and-the-restart-proof`, based on `main`, head `d3730821`), including the row dumps and currency checks listed above as still to build. Every acceptance criterion is met by the build's own account, and `CI passed` is green. Review findings fixed in round 1 and confirmed by the audit: the revision check reads only the stored text (`3e413e91`); `test/support/postgres-rows.ts` and `build-tooling.md` record why the raw `pg` driver is used (`8b269c8e`); and the shared script now marks two Spaces exported (`d3730821`). Nothing is open.

Two things to record here, which the run could not write into tickets:
- **Equivalent mutant.** In `crates/host/tests/postgres_rows.rs`, binding the revision as `int8` rather than `f64` stores the same text, so no test can tell them apart. The `f64` binding is still killed through the stored value.
- **A choice for the maintainer.** `@types/pg` is pinned at 8.23.1, because DefinitelyTyped never published an 8.22.x to match `pg` 8.22. The alternative is 8.21.0. `build-tooling.md` records the choice.

What remains is the maintainer's: mark the PR ready and merge it. Do not rebuild this ticket.

**2026-11-28, review and fixes.** PR #556 is at head `6b0480f1`, with `main` merged in, and `CI passed` is green. The review confirmed the first three boxes from the code and CI, and they are now checked.
- **Fixed.** The Rust read of TypeScript's rows was compared only with the Rust memory store. `crates/host/tests/rows_support/mod.rs` now asserts literal values: each Space's revision and exported revision, the listed Spaces, the unlisted kind's content, the chart's placement field by field (an absent Edit size among them), and the Edges' Titles. These fail under a mutation that drops a placement's size.
- **Fixed.** `README.md` says the role `DATABASE_URL` names must be allowed to create databases, beside the PostgreSQL integration steps. `main` has since moved the command reference out of `AGENTS.md`.
- **Decided and made.** `@types/pg` is pinned at 8.21.0, the newest published release not above `pg` 8.22.0, which follows `@prisma-next/driver-postgres`. This settles the choice the entry above leaves to the maintainer.
- **Decided and made.** The TypeScript half of the rows test gets the same literal assertions.
