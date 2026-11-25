# 01 — Record the PostgreSQL decisions

**Status:** ready-for-agent (the user answered every question on 2026-11-25)

**Blocked by:** nothing. It extends #528's 02 (its ADR) rather than repeating it; whichever lands second rebases onto the other.

**What to build:** The decisions `spec.md` records (Decisions for PostgreSQL), written where the next reader looks, before any code. The spec and tickets already carry the answers.

- [ ] One new ADR records the Rust PostgreSQL store's decisions and its accepted differences from TypeScript: the concurrency protocol (Q2), READ COMMITTED for locking transactions and REPEATABLE READ READ ONLY for multi-statement unlocked reads (Q3), unbounded lock waits as a recorded risk (Q4), classification and the resolver difference (Q5), a missing table (Q6, with its different problem detail), `DATABASE_URL` from the environment then the nearest `.env`, searched from the current directory (Q7), the pool and its acquire-timeout 503s (Q8), TLS roots (Q10), `\u0000` (Q11), `-0` (Q14), `sslmode` read as `pg` reads it (Q15), operations that run to completion when their request is dropped (Q16), and the term Unreachable (Q17). It is accepted and indexed, and `docs/requirements/storage.md`'s marker names it.
- [ ] Storage: ST-3's Rust paragraph names the PostgreSQL store; ST-5 names Rust's advisory lock as the same key and modes as TypeScript's; ST-7 names a missing table on PostgreSQL; a PostgreSQL host section beside "The SQLite host" holds `DATABASE_URL`, the pool, TLS and `sslmode`, the lock waits and dropped requests, each **not built** until its ticket lands.
- [ ] Issues, each out of this plan's scope: `\u0000` as a defect in both runtimes (Q11); TypeScript's `loadSpace` reading a Space and its Resources in separate statements, so a commit between them can tear the read (Q3); bounding lock waits in both runtimes (Q4); and, if the user wants every store to agree, intake rewriting `-0` to `0` (Q14).
- [x] `CONTEXT.md` has **Unreachable**, Invariant failure and Unclassified failure (added with this plan, #536).
- [ ] #528's 03, 04, 05, 06, 12 and 13 are set to blocked on 02 in the same change, naming why (Q1), and #528's 02 says Unreachable (Q17).

**Named mutants:** none; documentation only.
