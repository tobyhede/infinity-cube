# 07 — Port the PostgreSQL concurrency and schema cases

**Status:** ready-for-agent once 06 lands

**Blocked by:** 06.

**What to build:** Rust ports, on PostgreSQL, of the 19 cases `case-map.md` assigns here: every case of `test/integration/postgres-space-repository.test.ts` outside its contract call (13), `postgres-aggregate-initialization.test.ts` (5, one of them looped) and `test/unit/postgres-aggregate-lock-key.test.ts` (1). Each runs its operations on separate pooled connections or separate repositories over one database, as TypeScript does, and pauses an operation at a named point through the `test-support` instrumentation (02) rather than by sleeping.

- [ ] Each case has a port with its `// Case:` line, asserting the TypeScript answer and the stored rows afterwards; its pending exemption is deleted.
- [ ] "refuses a write of text that is not JSON into spaces.document" and "prevents direct deletion of the Meta Space while repository state names it" are ported as schema tests (a raw statement refused), which is what makes their SQLite counterparts not apply here.
- [ ] The lock-key case is ported as: the key Rust takes in each mode is `(1213812818, 1)`, read from what the store sends, and a Rust test fails if `src/prisma/sql-store.ts` stops naming that key (read as text), so the two runtimes cannot drift apart.
- [ ] A Rust aggregate commit waits on the advisory lock held exclusively by another session (a raw connection standing in for a TypeScript host), and a Rust fast path proceeds beside a session holding it shared.

**Named mutants:** those 04 names, each re-run against these PostgreSQL ports; the PR records the PostgreSQL test that kills each.
