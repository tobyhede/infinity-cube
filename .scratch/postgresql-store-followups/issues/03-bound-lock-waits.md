# 03: Bound lock waits in both runtimes

**Status:** needs-triage

**Blocked by:** None.

**What to build:** Neither PostgreSQL store sets `lock_timeout` or `statement_timeout`, and neither driver enables TCP keepalive, so a stuck lock holder or a half-open connection hangs every writer in either runtime (ADR 0177, "Lock waits stay unbounded"; `.scratch/rust-postgresql-store/spec.md`, Q4). Bounding them is a decision for both runtimes together.

- [ ] The maintainer picks the bound(s) and how `57014` (query cancelled) and `55P03` past the bound are answered (Unreachable or Unclassified), recorded in an ADR.
- [ ] Both stores set them, each with a test that a held lock answers within the bound.
