# 07 — Port the PostgreSQL concurrency and schema cases

**Status:** resolved

**Blocked by:** 06.

**What to build:** Rust ports, on PostgreSQL, of the 19 names `case-map.md` assigns here: every case of `test/integration/postgres-space-repository.test.ts` outside its contract call (13), `postgres-aggregate-initialization.test.ts` (5, one with three values) and `test/unit/postgres-aggregate-lock-key.test.ts` (1).

- [x] Each case has a port with its `// Case:` line, asserting the TypeScript answer and the stored rows afterwards; its pending exemption is deleted.
- [x] A port that needs the other operation to be waiting **observes it waiting**, by polling `pg_locks`, `pg_blocking_pids` or `pg_stat_activity.wait_event_type` as `postgres-aggregate-initialization.test.ts` does, never by sleeping (the TypeScript cases in `postgres-space-repository.test.ts` sleep; their ports don't). Pausing an operation at a step uses 04's instrumentation; a blocker is a raw transaction on another connection.
- [x] "refuses a write of text that is not JSON into spaces.document" and "prevents direct deletion of the Meta Space while repository state names it" are ported as schema tests (a raw statement refused).
- [x] The lock-key case: the key Rust takes in each mode is `(1213812818, 1)`, read from 04's lock recording, and a Rust test fails if `src/prisma/sql-store.ts` stops naming that key (read as text).
- [x] Beside a raw session standing in for a TypeScript host: a Rust aggregate commit waits while it holds the lock exclusively; a Rust fast path waits while it holds it exclusively; a Rust fast path proceeds while it holds it shared.
- [x] A raw writer outside the lock wins a primary-key race against a Rust initialization on `spaces` and on `repository_state` (not only `resources`, `:375`), and Rust re-reads and classifies (04).

**Named mutants (each killed by this ticket's tests):** advisory key or mode differing from TypeScript's; fast path takes no lock or the exclusive lock (the raw-session tests); revision compared from the decision read (port of `:812`); `23505` on `spaces_pkey` or `repository_state_pkey` rethrown instead of re-read; `23505` on `resources_pkey` during creation not answered as the ownership refusal (port of `:375`); replacement skipping the per-row relock (ports of `:416`, `:725`).

## Comments

- Built in `crates/host/tests/postgres_concurrency.rs`, which the CI step's `binary(/^postgres/)` filter runs. All 19 names carry their `// Case:` line; the `it.each` case carries it on each of its three values. The pending exemptions live in #540's `test/unit/repository-contract-rust-ports.test.ts`, which has not landed on this branch, so deleting them falls to 03 when it does.
- Every wait is observed by polling `pg_stat_activity.wait_event_type = 'Lock'` for the database, never by a sleep. An operation is paused with 04's probe, once, at the step nearest the TypeScript boundary: `meta-read` at `Step::MetaRead`, `spaces-read` at `Step::CompleteRead`, `meta-delete` at `Step::Truncation`. Each is under the exclusive aggregate lock, so the second runtime always waits.
- The lock key is read from `pg_locks` while an operation is held at `Step::Locked`: `1213812818 1 2 ExclusiveLock` for `load_aggregate` and `ShareLock` for the fast path. A test with no server reads `src/prisma/sql-store.ts` and fails unless both of its statements name `host::AGGREGATE_LOCK_KEY`.
- `jsonb` keeps an object's keys shorter first, so a stored Space Resource's content reads back as `map`, `graph`, `spaceId`. The fixtures write it in that order. TypeScript's `toEqual` ignores key order, and the Export orders content keys by the plugin, so this is no difference on disk.
- The row-lock ports for `:812`, `:855`, `:416` and `:725` start the blocker's write before the operation, so the operation's read is guaranteed to see the old revision. The race is then caught at the row lock, as the TypeScript comments explain.
- Mutants checked by hand, each killed:
  - The fast path taking the exclusive lock: the shared-holder test times out and the lock-key test reads `ExclusiveLock`.
  - The fast path taking no lock: the exclusive-holder test finishes before the holder commits.
  - Replacement skipping the per-row relock: the ports of `:416` and `:725`.
  - `23505` rethrown instead of re-read: all three primary-key races fail.
  - The Meta relock answering the first identity it read (deferred from 04): the ports of `:535` and `:604`.
  - Revision compared from the decision read: the port of `:812`. The lock answers `1` and the write commits over it.
  - The conflict answered with the Space read inside the aborted transaction (deferred from 04): survives. Run on 2026-11-26 against the whole host suite, every ignored PostgreSQL test included, on PostgreSQL 16. It is equivalent on PostgreSQL. The locking transaction is `READ COMMITTED` (`crates/host/src/sql/postgres.rs:245-248`), so a statement after the row lock sees the other writer's committed row, as the fresh read does. The transaction still holds the stale Space's row lock and the aggregate lock, and the commit has written nothing to that Space yet, since `write_changes` takes every row lock before any write. The only observable difference is that the probe never reaches `Step::SpaceRead`.
  - Resource rows judged against the decision read (deferred from 04): survives every PostgreSQL test. It is killed by `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision` › `refuses_an_update_writing_a_resource_another_space_owns` (the assertion at `:1629`), since the code path is shared. No PostgreSQL test kills it until 06 runs table case `:2444`.
