# 01 — Record the PostgreSQL decisions

**Status:** blocked (needs-info: the user's answers to `spec.md`'s Open questions, and 00)

**Blocked by:** 00; #528's 02 (the glossary terms and its ADR), which this extends rather than repeats.

**What to build:** The decisions the user answers, written where the next reader looks, before any code. The plan's tickets are then updated to the answers in the same change.

- [ ] One new ADR records the Rust PostgreSQL store's decisions and its accepted differences from TypeScript: the concurrency protocol (Q2), the isolation level (Q3), unbounded lock waits (Q4), classification and the resolver difference (Q5), a missing table (Q6), `DATABASE_URL` from the environment only (Q7), the pool (Q8), TLS (Q10) and `\u0000` (Q11). It is accepted and indexed, and `docs/requirements/storage.md`'s marker names it.
- [ ] Storage: ST-3's Rust paragraph names the PostgreSQL store; ST-5 names Rust's advisory lock as the same key and modes as TypeScript's; ST-7 names a missing table on PostgreSQL; a PostgreSQL host section beside "The SQLite host" holds `DATABASE_URL`, the pool, TLS and the lock waits, each **not built** until its ticket lands.
- [ ] An issue records `\u0000` as a defect in both runtimes (Q11), out of this plan's scope.
- [ ] `spec.md`'s Open questions become Decisions with their dates, and each ticket that changes with an answer is updated.
