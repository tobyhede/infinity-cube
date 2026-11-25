# 01 — Record the PostgreSQL decisions

**Status:** blocked (needs-info: the user's answers to `spec.md`'s Open questions)

**Blocked by:** #528's 02 (the glossary terms and its ADR), which this extends rather than repeats.

**What to build:** The decisions the user answers, written where the next reader looks, before any code; the tickets updated to the answers in the same change.

- [ ] One new ADR records the Rust PostgreSQL store's decisions and its accepted differences from TypeScript: the concurrency protocol (Q2), READ COMMITTED for locking transactions and REPEATABLE READ READ ONLY for multi-statement unlocked reads (Q3), unbounded lock waits (Q4), classification and the resolver difference (Q5), a missing table (Q6, with its different problem detail), `DATABASE_URL` from the environment only (Q7), the pool and its acquire-timeout 503s (Q8), TLS roots (Q10), `\u0000` (Q11) and `-0` (Q14). It is accepted and indexed, and `docs/requirements/storage.md`'s marker names it.
- [ ] Storage: ST-3's Rust paragraph names the PostgreSQL store; ST-5 names Rust's advisory lock as the same key and modes as TypeScript's; ST-7 names a missing table on PostgreSQL; a PostgreSQL host section beside "The SQLite host" holds `DATABASE_URL`, the pool, TLS and the lock waits, each **not built** until its ticket lands.
- [ ] An issue records `\u0000` as a defect in both runtimes (Q11), out of this plan's scope.
- [ ] If Q1 is answered yes, #528's 03, 04, 05, 06, 12 and 13 are set to blocked on 02 in the same change, naming why.
- [ ] `spec.md`'s Open questions become Decisions with their dates.

**Named mutants:** none; documentation only.
