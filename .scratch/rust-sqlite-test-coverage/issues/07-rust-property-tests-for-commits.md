# 07 — Rust property tests for commits

**Status:** ready-for-agent

**Blocked by:** 01, 04.

**What to build:** Property tests with `proptest`, already a `host` dev-dependency used only in `src/product.rs`. They compare the Rust stores with each other, and with `decide_commit`; they cannot catch a defect both Rust stores share through `decide_commit` (the revision ceiling was one), which is why 04's ports, holding TypeScript's answers, come first.

- [ ] Generated single-Space updates: the fast path (`decide_single_space`) either hands the update on or answers exactly as `decide_commit` does.
- [ ] Generated commit sequences, Space creation, linking, deletion, Resource moves in either order and revisions near the ceiling included, give the same answer at every step and the same final aggregate on the memory store and on a SQLite file reopened at the end.
- [ ] The five fixed differential scripts in `crates/host/tests/sqlite.rs` stay only where the generators do not reach their case, each saying which.
