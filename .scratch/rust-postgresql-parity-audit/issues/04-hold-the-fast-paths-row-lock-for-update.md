# 04 — Hold the fast path's row lock `FOR UPDATE` by a test

**Status:** ready-for-agent

**Blocked by:** nothing.

**Kind:** mutation survivor. Not a correctness gap at `32d316f3`: the code takes `FOR UPDATE` (`crates/host/src/sql/postgres.rs:395-404`). No test fails if it stops.

## What is wrong

Fresh mutant A05 (`../mutants.md`) makes `hold_space` take `FOR SHARE` instead of `FOR UPDATE`, and every PostgreSQL test passes. The code's own comment says why it matters: two fast-path commits on one Space would each hold a share lock, each then ask for the update lock in `lock_space` (`crates/host/src/sql.rs:760-763`), and PostgreSQL would abort one with `40P01`, which `classify` answers Unreachable (503). Under `FOR UPDATE` the second waits at `hold_space`, reads the first's revision and answers a conflict (409), as TypeScript does. So the mutant turns a conflict into a retried outage for overlapping Edits to one Space.

## What to build

- [ ] A test in `crates/host/tests/postgres_concurrency.rs`: two single-Space Edits to one Space at the same expected revision; the first paused by the probe at `Step::RowLock` (after `hold_space`, before `lock_space`); the second shown waiting on a row lock in `pg_locks` before the first is released; then one answers `Committed` and the other `Conflict` carrying the first's write, and neither answers `Unavailable`.
- [ ] The test fails with `FOR SHARE` (A05) and with no row lock (A04).

**Named mutants:** A05 (`FOR SHARE`), A04 (no row lock).

## Comments

**2026-11-28, re-read at `5a0956f8`.** Untouched.

`hold_space` still takes `FOR UPDATE` (`crates/host/src/sql/postgres.rs:396-399`). `crates/host/tests/postgres_concurrency.rs` changed since `32d316f3` only in three marks; no test pauses one single-Space Edit at `Step::RowLock` while a second Edit to the same Space waits. The `Step::RowLock` pauses in `postgres_races.rs` (`:402`, `:485`, `:583`) overlap an Edit with a Graph deletion, a replacement or an Edit to another Space. The mutants were not run again.
