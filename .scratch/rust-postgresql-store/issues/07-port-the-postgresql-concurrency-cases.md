# 07 — Port the PostgreSQL concurrency and schema cases

**Status:** ready-for-agent

**Blocked by:** 06.

**What to build:** Rust ports, on PostgreSQL, of the 19 names `case-map.md` assigns here: every case of `test/integration/postgres-space-repository.test.ts` outside its contract call (13), `postgres-aggregate-initialization.test.ts` (5, one with three values) and `test/unit/postgres-aggregate-lock-key.test.ts` (1).

- [ ] Each case has a port with its `// Case:` line, asserting the TypeScript answer and the stored rows afterwards; its pending exemption is deleted.
- [ ] A port that needs the other operation to be waiting **observes it waiting**, by polling `pg_locks`, `pg_blocking_pids` or `pg_stat_activity.wait_event_type` as `postgres-aggregate-initialization.test.ts` does, never by sleeping (the TypeScript cases in `postgres-space-repository.test.ts` sleep; their ports don't). Pausing an operation at a step uses 04's instrumentation; a blocker is a raw transaction on another connection.
- [ ] "refuses a write of text that is not JSON into spaces.document" and "prevents direct deletion of the Meta Space while repository state names it" are ported as schema tests (a raw statement refused).
- [ ] The lock-key case: the key Rust takes in each mode is `(1213812818, 1)`, read from 04's lock recording, and a Rust test fails if `src/prisma/sql-store.ts` stops naming that key (read as text).
- [ ] Beside a raw session standing in for a TypeScript host: a Rust aggregate commit waits while it holds the lock exclusively; a Rust fast path waits while it holds it exclusively; a Rust fast path proceeds while it holds it shared.
- [ ] A raw writer outside the lock wins a primary-key race against a Rust initialization on `spaces` and on `repository_state` (not only `resources`, `:375`), and Rust re-reads and classifies (04).

**Named mutants (each killed by this ticket's tests):** advisory key or mode differing from TypeScript's; fast path takes no lock or the exclusive lock (the raw-session tests); revision compared from the decision read (port of `:812`); `23505` on `spaces_pkey` or `repository_state_pkey` rethrown instead of re-read; `23505` on `resources_pkey` during creation not answered as the ownership refusal (port of `:375`); replacement skipping the per-row relock (ports of `:416`, `:725`).
