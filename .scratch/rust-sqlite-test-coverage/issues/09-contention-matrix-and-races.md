# 09: SQLite contention matrix and races

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** The Rust SQLite repository's answers under contention match ST-127 for every lock another process can hold. Shared, reserved and exclusive locks are each tested against load, commit and replace, and each answer is timed against the busy timeout. Races inside the process are tested even where a mutex rules them out by construction, so the construction is held.

- [ ] A matrix test covers each lock level against `load_space`, `commit` and `replace_aggregate`, asserting the answer and that it arrives within the busy timeout plus a stated margin.
- [ ] A busy file answers 503 through `Application` within that bound.
- [ ] A replace racing a commit, and two commits racing on the fast path, each end in one of the allowed outcomes, with the final aggregate checked.
