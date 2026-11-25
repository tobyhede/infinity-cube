# 10 — Pin Rust's contention behaviour

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 02.

**What to build:** Tests of how the Rust SQLite repository answers another process's lock, holding the behaviour ST-127 allows and 02 records, not TypeScript's.

- [ ] For a shared, a reserved and an exclusive lock held by a second process, `load_space`, `commit` and `replace_aggregate` each answer as Rust does today: each answer and whether it waits out the busy timeout or fails at once is asserted, not left to ST-127, which allows both; a write against a reserved lock waits out the busy timeout, then answers unavailable (503) and leaves no partial write, and a read beside a shared or reserved lock succeeds without waiting.
- [ ] Each timing assertion sets a short busy timeout of its own and allows at least ten times it, or uses paused time where the wait is Rust's own. One test pins the default busy timeout (5 s) by reading the connection's setting, not by waiting.
- [ ] The reserved-lock write test asserts the wait, not only the unavailable answer, so it fails if writes open with a deferred `BEGIN` instead of `BEGIN IMMEDIATE`. Checked on #521 with a throwaway test (busy timeout 300 ms): today unavailable after 303 ms; with `sql/sqlite.rs`'s `BEGIN IMMEDIATE` changed to a deferred `begin()`, unavailable after 4 ms. The PR description records the mutant and the test that kills it.
- [ ] A read that first meets another process's exclusive lock recovers once the lock is let go, as `test/integration/sqlite-contention.test.ts` holds; each other case of that file has a port or a written exemption (03).
