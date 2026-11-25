# 10 — Pin Rust's contention behaviour

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 02.

**What to build:** Tests of how the Rust SQLite repository answers another process's lock, holding the behaviour ST-127 allows and 02 records, not TypeScript's.

- [ ] For a shared, a reserved and an exclusive lock held by a second process, `load_space`, `commit` and `replace_aggregate` each answer as Rust does today: a write against a reserved lock waits out the busy timeout, then answers unavailable (503) and leaves no partial write; the others as ST-127 says.
- [ ] Each timing assertion uses a margin wide enough for a loaded CI runner, or paused time where the wait is Rust's own.
- [ ] One test shows a `replace_aggregate` and a commit in the same process are serialised: neither sees the other half-done.
