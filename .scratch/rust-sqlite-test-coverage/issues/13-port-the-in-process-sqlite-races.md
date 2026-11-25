# 13 — Port the in-process SQLite races to Rust

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`.

**What to build:** Rust tests of concurrent operations on one SQLite repository in one process, the races `test/integration/sqlite-fast-path-races.test.ts` and `test/integration/sqlite-contention.test.ts` hold for TypeScript beyond the same-Space race Rust already tests (`crates/host/tests/sqlite.rs`, `given_contention`).

- [ ] Concurrent commits to different Spaces all commit, each Space at its next revision, read back after a reopen.
- [ ] Two concurrent commits adding the same Resource id: one commits, the other is refused, and the file holds one row for it.
- [ ] Two concurrent commits creating the same Space id: one commits, the other answers a conflict or refusal as `decide_commit` would sequentially.
- [ ] A `replace_aggregate` and a commit started together end in a state one of the two orders produces, never a mix.
- [ ] The fast-path races of `test/support/fast-path-races.ts` have Rust ports or written exemptions (03), among them a Map-internal Edit under the shared lock only, a Map-internal Edit and a Graph deletion serialised in either order, a replacement recreating a Space at revision 0 kept from landing between a fast-path read and its write, and a Space deletion kept from passing at a revision an uncommitted fast path has moved.
- [ ] Taken together these fail if the repository's serialising lock is removed and the pool holds more than one connection; the PR description records the mutant and the test that kills it. A deferred `BEGIN` cannot be seen in one process (one connection serialises every write); 10 holds it.
