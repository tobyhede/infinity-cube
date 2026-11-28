# 03 — The ports test knows the PostgreSQL adapter

**Status:** ready-for-agent

**Blocked by:** 02.
**Waits on:** #528's 03 (the repository ports test), which this extends.

**What to build:** A PostgreSQL adapter in the repository ports test #528's 03 writes, shaped as `test/unit/http-conformance-rust-ports.test.ts` holds its adapters (`PORTS`, `:126-198`): the table plus PostgreSQL's own files. Each later ticket adds the files it creates to the adapter's list in the same commit (`crates/host/tests/postgres*.rs` from 05, `crates/cli/tests/serve_postgres.rs` from 09), and 06 adds the check that a PostgreSQL test binary invokes `repository_cases!(`; until then the adapter's files are the table alone and every case is a pending exemption, so the test is green from its first commit.

- [ ] The adapter's cases are every case `case-map.md` lists for the PostgreSQL adapter, ported or exempt, counted one way: **every exempt case is in the adapter as an exemption**, never left out of it. That is 130 of the first map's 149 (the change-order case and the two env-path cases among them, as exemptions) plus all 20 of "Found by 00" (10 to port, and as exemptions `prisma-foundation.test.ts:73` and `:99`, the seven `infinity-cube-cli.test.ts` cases and `database-cli-targets.test.ts:112`), 150 names. The first map's other 19 rows are not exemptions: they are store-independent cases of `database-startup.test.ts`, run in no store, so they belong to no store's adapter (`case-map.md`, `spec.md` Audit).
- [ ] Cases are read **per describe block where a file holds more than one store's cases**: only the `postgresSqlStore.isUnavailable` describe of `sql-connection-failure.test.ts` (its "terminates on a cyclic cause chain" at `:175` shares a name with the SQLite describe's `:231`), the PostgreSQL describe of `database-startup.test.ts`, and the single PostgreSQL case of `vite-hono-host.test.ts`. `test(` calls are read as `it(` calls are.
- [ ] Per-value cases: an `it.each` name with `%s` or `$name`, and every case under a `describe.each` (`postgres-misconfiguration.test.ts:65`), list their values, and one Rust test per value carries `// Case: <name> (<value>)`.
- [ ] Four exemption kinds: **pending** (names the ticket in `case-map.md`), **does not apply** (names the reason from `spec.md`'s "Does not apply on PostgreSQL"), **owned elsewhere** (names the rust-host ticket that ports it: 16 for the two migration-history cases, 17 and 26 for the eight CLI import and export cases) and **accepted difference** (names the decision: change order; `EAI_AGAIN`, one value of `sql-connection-failure.test.ts:144`; the two `prisma-postgres-env-path.test.ts` cases about where the search starts, Q7). It fails on a case or value with neither port nor exemption, on a mark or exemption naming no case, and on a case both ported and exempt.

**Named mutants (on the ports test itself, each must fail its own unit tests, as the HTTP ports test's are):** reading names across describes (the duplicate goes unnoticed); dropping `describe.each` values; treating an accepted difference as a port; leaving an exempt case out of the adapter instead of listing it as an exemption (an exempt case's name dropped from the adapter must fail).

## Comments

**2026-11-28, implement-tickets run.** Built on PR #559 (`feat/rust-postgresql-store-03-ports-test-for-postgresql`, based on 02's branch, head `5dda88a7`). Every acceptance criterion is met by the build's own account, and `CI passed` is green. Review findings fixed in round 1 and confirmed by the audit: each per-value case's listed values are compared with its table (`misvalued`); `case-names.ts` treats `%#` and `%$` as row-index substitutes; and a lineage comment was removed. Nothing is open. What remains is the maintainer's: merge after #557. Do not rebuild this ticket. #561 (06) is based on this branch.

A follow-up outside this ticket's scope: the audit noted that SQLite's adapter has the same gap the `misvalued` check closes here, so a value added to a SQLite `VALUES` table is not caught. It needs its own ticket.

**2026-11-28, review and fixes.** PR #559 is at head `3277b5a7`, with ticket 02's head and `main` merged in, and `CI passed` is green.
- **Fixed.** The review found that the PostgreSQL adapter read no Rust file, so the `// Case:` marks already in the PostgreSQL test files were unheld, behind `pending` exemptions naming resolved tickets (05, 07, 08, 09, 12). The adapter now reads `crates/host/tests/postgres.rs`, `postgres_concurrency.rs`, `postgres_outages.rs`, `postgres_races.rs`, `postgres_url.rs` and `crates/host/src/sql/postgres/tests.rs`, and reads `crates/cli/tests/serve_postgres.rs` through its `// TypeScript case:` marker. The stale exemptions are removed, and each per-value mark names its value. The test's tally is 102 ported, 77 pending (06: 75, 10: 1, 11: 1), 10 owned elsewhere and 4 accepted differences.
- **Fixed.** A table written in a test file is read before a runtime value rule. The case reader refuses a table case whose title substitutes nothing. The two checkers are one generic checker, which SQLite's cases also run through. Three comments and one exemption reason that asserted what was no longer true are corrected.
- **Decided by the maintainer.** The "does not apply" exemption kind stays, empty.
- The SQLite gap the entry above names is ticket 16.
- **For whoever merges forward.** Ticket 06's branch edits the same ports test. It needs this head merged in, with the file reconciled by hand. The earlier merge of 02 into 03 left no conflict markers and still did not type-check.
