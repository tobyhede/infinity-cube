# 16 — SQLite's per-value cases in the ports test

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** The repository ports test (`test/unit/repository-contract-rust-ports.test.ts`) holds each per-value case's listed values to the values the TypeScript test runs, for SQLite's cases as it does for PostgreSQL's own. Ticket 03's comments name this gap. Line numbers below are on 03's branch at `3277b5a7`.

Where it stands:

- For each PostgreSQL source case run once per value, `misvalued` (`:393`) compares the listed values with the `it.each` table the case runs over (`:927-934`). A value added to that table fails the test until it is listed and ported.
- The contract's per-value cases come from `for … of` loops in `test/support/repository-contract.ts`: `:529` (broken states), `:871` (the repeated identity) and `:2443` (the commits over recreated rows). The case reader names each such case once, with `*` for the substitution, and cannot read the loop's values. Their values are written by hand in `VALUES` (`:61-73`). The only check is the hard-coded count of 73 cases and 76 runs (`:811-815`), which a value added to a loop does not change. Both adapters take their contract values from `VALUES` (the PostgreSQL adapter at `:531-532`), and `misvalued` reads only PostgreSQL's source cases, so a contract loop's values are held for neither store.
- The SQLite files outside the contract are read by name alone (`OUTSIDE_CASES`, `:158`), and their values are written by hand in `OUTSIDE_VALUES` (`:77-82`). The check at `:817-820` holds only that each listed name exists. So:
  - `test/integration/sqlite-space-repository.test.ts:758` (`it.each`, two values) is listed per value, but its list is not compared with its table.
  - `test/integration/sqlite-http-runtime.test.ts:32`, "refuses to compose when SQLITE_PATH is %s" (`it.each`, three values: unset, empty, blank), is not listed. One Rust test carries its bare name (`crates/cli/tests/serve.rs:165`).
  - The `for … of` cases `sqlite-space-repository.test.ts:300-302` (two commit kinds by two orderings), `test/integration/sqlite-contention.test.ts:383` (two locks) and `:395` (the six rows of `BUSY_MATRIX`) are named with `*`. Their Rust ports carry the bare name once per test (`crates/host/tests/sqlite_races.rs:233-251`, and eight marks in `crates/host/tests/sqlite_contention.rs`), so the test counts one run each, however many tests mark it.

So a value added to a SQLite loop or table is caught by nothing.

- [ ] The contract's per-value cases get their values from the source: either the reader reads each `for … of` loop's literal values, or the contract declares each as a table (`it.each` or a named array) the reader reads. `VALUES` is then compared with what was read, as `misvalued` compares PostgreSQL's, or replaced by it.
- [ ] Adding a value to a contract loop (for example a third broken state at `repository-contract.ts:529`) fails the ports test for both adapters until a Rust test carries `// Case: <name> (<value>)` for it, or an exemption names it.
- [ ] The SQLite cases outside the contract are read with their tables, as PostgreSQL's sources are (`describedCasesIn`, not `casesOf`), and every per-value case among them has its values compared with its table.
- [ ] "refuses to compose when SQLITE_PATH is %s" is one case per value, with one Rust test per value, each carrying `// Case: refuses to compose when SQLITE_PATH is %s (<value>)`.
- [ ] The `for … of` cases outside the contract (`sqlite-space-repository.test.ts:300`, `sqlite-contention.test.ts:383` and `:395`) are per-value, with each Rust mark naming its value, or each is rewritten as an `it.each` the reader reads. A value added to any of them fails the ports test until it is ported.
- [ ] The test's counts (`:811-815`) are derived from what is read, or updated, and still pass.

**Named mutants (on the ports test itself, each must fail its own unit tests):** a contract loop's values not read (the reader returns the case once); a value added to a contract loop's source with no mark; a value dropped from a SQLite `it.each` table while still listed; the SQLite outside files read by name alone again (`casesOf` in place of `describedCasesIn`); a per-value mark accepted by its bare name.

## Comments
