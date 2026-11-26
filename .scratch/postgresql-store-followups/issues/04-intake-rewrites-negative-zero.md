# 04: Should intake rewrite `-0` to `0` so every store agrees?

**Status:** needs-info

**Blocked by:** None.

**What to build:** `jsonb` stores numbers by value, so a committed `-0` loads back as `0` on PostgreSQL in both runtimes, while SQLite and memory keep `-0` (ADR 0177; `.scratch/rust-postgresql-store/spec.md`, Q14). The browser cannot send `-0` (`JSON.stringify` writes `0`), so only a hand-written file reaches it. If every store should give the same answer, intake rewrites `-0` to `0` in both runtimes.

- [ ] The maintainer says whether stores must agree here; if so, both intakes rewrite `-0`, and the conformance corpus pins it.
