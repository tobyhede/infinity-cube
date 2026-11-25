# 11 — Property tests on PostgreSQL

**Status:** ready-for-agent

**Blocked by:** 06.
**Waits on:** #528's 07 (its generators), which this reuses.

**What to build:** #528's 07's generated commit sequences against PostgreSQL too, and the port of `aggregate-commit-differential.test.ts:21` ("gives memory and PostgreSQL the same public outcome over generated aggregate changes"). They compare stores, so they come after the table's absolute assertions and cannot replace them.

- [ ] Generated sequences (Space creation, linking, deletion, Resource moves in either order, revisions near the ceiling, Resources supplied out of id order, content whose keys `jsonb` reorders) give the same answer at every step and the same final aggregate on the memory store and on a PostgreSQL database reopened at the end; the ticket says which side normalises key and Resource order.
- [ ] Few enough cases to keep the `rust` job's PostgreSQL step under five minutes; the PR records the time.

**Named mutants:** none of its own: a property test that only compares stores is the wrong killer for a store defect (`spec.md`, Lessons). Its PR records which of 06's mutants it also kills, for information.
