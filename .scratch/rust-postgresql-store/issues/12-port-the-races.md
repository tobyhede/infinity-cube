# 12 — Port the fast-path races and the concurrent operations

**Status:** resolved

**Blocked by:** 07.

**What to build:** Rust ports of `test/support/fast-path-races.ts`'s six cases on PostgreSQL, run as TypeScript runs them there with `runsCommitsConcurrently: true` (`test/integration/fast-path-races.test.ts:12-19`), and the concurrent operations #528's 13 keeps for SQLite after 02.

- [x] Each race has a port with its `// Case:` line, pausing the first operation at the step TypeScript's `instrumentStore` does (`fast-path-races.ts:33`) through 04's instrumentation and observing the second waiting through `pg_locks`, and asserting the order the second observes.
- [x] "lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently" asserts the second commit completes while the first is paused.
- [x] Concurrent commits to different Spaces, two adding the same Resource id, two creating the same Space id, and a replacement started beside a commit, each ending in a state one sequential order produces, read back through a new pool; and the same between two repositories over one database.

**Named mutants (each killed by this ticket's tests):** a process mutex around PostgreSQL operations; the fast path's lock exclusive; the fast path's lock dropped (the recreation race, `fast-path-races.ts:373`).

## Comments

- The ports are in `crates/host/tests/postgres_races.rs`, each with its `// Case:` line. Its name puts it under CI's PostgreSQL filter (`binary(/^postgres/)`).
- Where each race pauses, beside where `instrumentStore` holds the TypeScript store:
  - The fast path pauses at `Step::RowLock(A)`, after it has read and decided and before its first write. TypeScript holds it after `loadWithResources`.
  - The Graph deletion pauses at `Step::CompleteRead`, under the exclusive lock and before it reads every Space. TypeScript holds it after `loadEvery`. Either way it holds the exclusive lock, so the Edit waits in both runtimes.
  - The uncommitted fast path pauses at `Step::ResourceReread(A)`, once it has written A's row and before it commits. TypeScript holds it after `deleteExcept`.
- Both operations of a race run on one repository, as TypeScript's two repositories share one pool. The pause filters on its step, so the second operation passes the probe. The second is seen waiting in `pg_stat_activity`. In the side-by-side case, B must commit within 30 s while A is held.
- The operations started together run on one repository and again on two repositories over one database. Each answer is read back through a new pool. A loser's answer is compared with what the memory store answers when the same commit runs after the winner, from the same seed.
  - Two Spaces adding one Resource id: on PostgreSQL the loser gets the same `AggregateRefused` (`duplicate-resource-id`) a sequential run gives, and one row holds the Resource.
  - Two commits creating one Space id: the loser gets the sequential answer, a conflict on the created Space.
  - Five runs in a row passed.
- Named mutants, each run by hand against `sql.rs` or `sql/postgres.rs` and then restored:
  - A process-wide mutex around `commit`: four races fail, the side-by-side case among them.
  - The fast path's lock taken exclusive in the PostgreSQL statement, while the probe still reports shared: the side-by-side case fails.
  - The fast path's lock dropped: four races fail, the recreation race among them.
