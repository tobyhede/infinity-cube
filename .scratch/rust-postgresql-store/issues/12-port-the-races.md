# 12 — Port the fast-path races and the concurrent operations

**Status:** ready-for-agent once 07 lands

**Blocked by:** 07.

**What to build:** Rust ports of `test/support/fast-path-races.ts`'s six cases on PostgreSQL, run as TypeScript runs them there with `runsCommitsConcurrently: true` (`test/integration/fast-path-races.test.ts:12-19`), and the concurrent operations #528's 13 keeps for SQLite after 02.

- [ ] Each race has a port with its `// Case:` line, pausing the first operation at the step TypeScript's `instrumentStore` does (`fast-path-races.ts:33`) through 04's instrumentation and observing the second waiting through `pg_locks`, and asserting the order the second observes.
- [ ] "lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently" asserts the second commit completes while the first is paused.
- [ ] Concurrent commits to different Spaces, two adding the same Resource id, two creating the same Space id, and a replacement started beside a commit, each ending in a state one sequential order produces, read back through a new pool; and the same between two repositories over one database.

**Named mutants (each killed by this ticket's tests):** a process mutex around PostgreSQL operations; the fast path's lock exclusive; the fast path's lock dropped (the recreation race, `fast-path-races.ts:373`).
