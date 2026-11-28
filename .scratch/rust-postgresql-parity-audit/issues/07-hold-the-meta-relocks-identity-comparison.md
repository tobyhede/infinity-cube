# 07 — Hold the Meta relock's identity comparison by a test

**Status:** ready-for-agent

**Blocked by:** nothing.

**Kind:** mutation survivor. Not a correctness gap at `32d316f3`: `relock_meta` compares the identity it was handed (`crates/host/src/sql/postgres.rs:362-375`). No test fails if it stops.

## What is wrong

Fresh mutant A02 (`../mutants.md`) replaces `meta_space_id = $1` in `relock_meta` with `$1 IS NOT NULL`, so any Meta row is taken as the one `lock_meta_identity` read (`crates/host/src/sql.rs:612-632`). Every PostgreSQL test passes.

Under `READ COMMITTED` each statement takes a new snapshot. When a replacement commits after `lock_meta_identity` reads the identity (`Step::MetaRead`, `sql.rs:616`) and before the relock starts, the relock sees the new row. Unmutated, the comparison matches nothing, so the relock answers "moved", reads again and locks the new identity. Under A02 it matches the new row and hands back the retired identity, and the aggregate commit, `load_aggregate` or replacement goes on deciding against a Meta Space that no longer exists.

The tests arrange only the other overlap: `holding_the_meta_row` (`crates/host/tests/postgres_concurrency.rs:1073-1078`) holds the row so the relock waits on it, then `retiring` (`:1057-1071`) deletes it, which `FOR UPDATE` skips either way.

Reachable only through a writer outside the repository's decisions: every in-repository replacement holds the exclusive aggregate lock, as do the operations that call `lock_meta_identity`.

A probe test showed it (`../evidence.md` › `A02 probe`): an aggregate commit paused at `Step::MetaRead` while an outside session commits `retiring(OTHER_SPACE_ID, ...)` commits unmutated, and under A02 answers `AggregateRefused` with `MetaSpaceMissing` naming the retired Meta Space.

## What to build

- [ ] A test in `crates/host/tests/postgres_concurrency.rs` › `given_overlapping_replacements`: an aggregate commit paused by the probe at `Step::MetaRead`, an outside connection committing `retiring(...)`, then the commit released; it answers `Committed`, judged against the identity the replacement established, and the stored Space carries the commit.
- [ ] The same for a replacement paused at `Step::MetaRead`: expecting the retired identity, it answers a `Conflict` carrying the new one, and the stored aggregate is the one the outside replacement left.
- [ ] Both fail with A02 applied.

**Named mutants:** A02.
