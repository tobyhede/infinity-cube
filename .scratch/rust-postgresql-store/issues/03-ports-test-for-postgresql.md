# 03 — The ports test knows the PostgreSQL adapter

**Status:** ready-for-agent once 02 lands

**Blocked by:** 02, and #528's 03 (the repository ports test), which this extends.

**What to build:** A PostgreSQL adapter in the repository ports test #528's 03 writes, shaped as `test/unit/http-conformance-rust-ports.test.ts` holds three adapters (`:125-185`): the table (`crates/host/tests/repository_contract/`) plus PostgreSQL's own files (`crates/host/tests/postgres*.rs`, `crates/host/src/sql/postgres.rs` unit tests, `crates/cli/tests/serve_postgres.rs`), listed in the test, and a check that the PostgreSQL test binary invokes `repository_cases!(`.

- [ ] The adapter's cases are those of `test/support/repository-contract.ts`, the six of `test/support/fast-path-races.ts`, and every `it` of `test/integration/postgres-space-repository.test.ts` (outside its contract call), `postgres-aggregate-initialization.test.ts`, `postgres-misconfiguration.test.ts`, `prisma-postgres.test.ts`, `test/unit/postgres-unreachable.test.ts`, `postgres-aggregate-lock-key.test.ts`, `prisma-postgres-env-path.test.ts`, the `postgresSqlStore.isUnavailable` describe of `test/unit/sql-connection-failure.test.ts` and the PostgreSQL describe of `test/unit/database-startup.test.ts`: 130 names today (`case-map.md`).
- [ ] An `it.each` case (`%s` in its name) lists its values, and one Rust test per value carries `// Case: <name> (<value>)`, as for the contract's loops.
- [ ] Exemptions are of the kinds #528's 03 defines: **pending** (names the ticket in `case-map.md` that ports it) or **does not apply** (names the reason from `spec.md`'s "Does not apply on PostgreSQL"). It fails on a case with neither port nor exemption, on a mark or exemption naming no case, and on a case both ported and exempt.
- [ ] Green from its first commit: every unported case is a pending exemption, and each later ticket deletes its lines as it ports them.
