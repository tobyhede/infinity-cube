# 10 — Pin Rust's contention behaviour

**Status:** resolved

**Blocked by:** 02, 03.

**What to build:** Tests of how the Rust SQLite repository answers another process's lock, holding the behaviour ST-127 allows and 02 records, not TypeScript's.

- [x] For a shared, a reserved and an exclusive lock held by a second connection outside the repository, which SQLite locks against as it would a second process (accepted 2026-11-26), `load_space`, `commit` and `replace_aggregate` each answer as Rust does today: each answer and whether it waits out the busy timeout or fails at once is asserted, not left to ST-127, which allows both; a write against a reserved lock waits out the busy timeout, then answers unavailable (503) and leaves no partial write, and a read beside a shared or reserved lock succeeds without waiting.
- [x] Each timing assertion sets a short busy timeout of its own and allows at least ten times it, or uses paused time where the wait is Rust's own. One test pins the default busy timeout (5 s) by reading the connection's setting, not by waiting.
- [x] The reserved-lock write test asserts the wait, not only the unavailable answer, so it fails if writes open with a deferred `BEGIN` instead of `BEGIN IMMEDIATE`. Checked on #521 with a throwaway test (busy timeout 300 ms): today unavailable after 303 ms; with `sql/sqlite.rs`'s `BEGIN IMMEDIATE` changed to a deferred `begin()`, unavailable after 4 ms. The PR description records the mutant and the test that kills it.
- [x] A read that first meets another process's exclusive lock recovers once the lock is let go, as `test/integration/sqlite-contention.test.ts` holds; each other case of that file has a port or a written exemption (03).

## Comments

### Resolved (2026-11-26)

`crates/host/tests/sqlite_contention.rs` holds a lock on the live file through a connection of its own outside the repository, which SQLite locks against as it would another process's. What Rust does today, each asserted with a busy timeout of the test's own (200 ms; a wait is at least it and under ten times it, and "without waiting" is under a tenth of a 10 s timeout):

| Lock held | `load_space` | `commit` | `replace_aggregate` |
| --- | --- | --- | --- |
| shared | answers, without waiting | waits the timeout out, unreachable | waits the timeout out, unreachable |
| reserved | answers, without waiting | waits the timeout out, unreachable | waits the timeout out, unreachable |
| exclusive | waits the timeout out, unreachable | waits the timeout out, unreachable | waits the timeout out, unreachable |

Each failure leaves the aggregate as it was, and the next write lands once the lock is let go. Against a reserved lock the TypeScript writer fails at once; the Rust writer opens with `BEGIN IMMEDIATE` and waits. A read that is the repository's first statement and meets an exclusive lock fails unreachable and recovers once the lock is let go. Over HTTP, a POST and a GET against an exclusive lock each answer 503 `persistence-unavailable` once the timeout has run out, never 409, and the same commit lands once the lock is let go. `sql/sqlite.rs`'s `pins_the_default_busy_timeout` reads `PRAGMA busy_timeout` from the connection `open` makes: 5000.

Mutants of `crates/host/src/sql/sqlite.rs`: opening writes with a deferred `begin()` rather than `BEGIN IMMEDIATE` is killed by `fails_a_commit_against_a_reserved_lock_after_the_busy_timeout` and `fails_a_replacement_against_a_reserved_lock_after_the_busy_timeout`, each answering at once; a 4 s default busy timeout is killed by `pins_the_default_busy_timeout`.
