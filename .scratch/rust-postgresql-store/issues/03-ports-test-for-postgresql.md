# 03 — The ports test knows the PostgreSQL adapter

**Status:** ready-for-agent once 02 lands

**Blocked by:** 02, and #528's 03 (the repository ports test), which this extends.

**What to build:** A PostgreSQL adapter in the repository ports test #528's 03 writes, shaped as `test/unit/http-conformance-rust-ports.test.ts` holds its adapters (`PORTS`, `:126-198`): the table plus PostgreSQL's own files. Each later ticket adds the files it creates to the adapter's list in the same commit (`crates/host/tests/postgres*.rs` from 05, `crates/cli/tests/serve_postgres.rs` from 09), and 06 adds the check that a PostgreSQL test binary invokes `repository_cases!(`; until then the adapter's files are the table alone and every case is a pending exemption, so the test is green from its first commit.

- [ ] The adapter's cases are every case `case-map.md` lists for the PostgreSQL adapter: 130 in the first map plus the 10 in "Found by 00" that are not exempt (the aggregate-commit differential, the three of `database-http-runtime.test.ts`, `vite-hono-host.test.ts:974`, four of `prisma-foundation.test.ts`, `postgres-persistence.spec.ts`), 140 names.
- [ ] Cases are read **per describe block where a file holds more than one store's cases**: only the `postgresSqlStore.isUnavailable` describe of `sql-connection-failure.test.ts` (its "terminates on a cyclic cause chain" at `:175` shares a name with the SQLite describe's `:231`), the PostgreSQL describe of `database-startup.test.ts`, and the single PostgreSQL case of `vite-hono-host.test.ts`. `test(` calls are read as `it(` calls are.
- [ ] Per-value cases: an `it.each` name with `%s` or `$name`, and every case under a `describe.each` (`postgres-misconfiguration.test.ts:65`), list their values, and one Rust test per value carries `// Case: <name> (<value>)`.
- [ ] Three exemption kinds: **pending** (names the ticket in `case-map.md`), **does not apply** (names the reason from `spec.md`'s "Does not apply on PostgreSQL") and **accepted difference** (names the decision: change order; `EAI_AGAIN`, one value of `sql-connection-failure.test.ts:144`; the two `prisma-postgres-env-path.test.ts` cases about where the search starts, Q7). It fails on a case or value with neither port nor exemption, on a mark or exemption naming no case, and on a case both ported and exempt.

**Named mutants (on the ports test itself, each must fail its own unit tests, as the HTTP ports test's are):** reading names across describes (the duplicate goes unnoticed); dropping `describe.each` values; treating an accepted difference as a port.
