# 01 — The ports test reads every PostgreSQL test file

**Status:** ready-for-agent

**Blocked by:** nothing.

**Kind:** parity gate. Not a correctness gap in the store: the independent case map (`../case-map.md`) finds every TypeScript PostgreSQL case ported or exempt for a true reason. The gap is that no check would notice if one stopped being.

## What is wrong

The spec's goal is that "every TypeScript PostgreSQL case has a Rust port on PostgreSQL or a written exemption, CI fails otherwise". At `32d316f3`, `test/unit/repository-contract-rust-ports.test.ts:820` gives the PostgreSQL adapter two files, `crates/host/tests/postgres.rs` and `postgres_properties.rs`. Its comment says "Each ticket adds the files it creates"; tickets 05, 07, 08, 09, 10 and 12 created `postgres_concurrency.rs`, `postgres_outages.rs`, `postgres_races.rs`, `postgres_url.rs`, `postgres_wire.rs`, `postgres_rows.rs`, `crates/host/src/sql/postgres/tests.rs` and `crates/cli/tests/serve_postgres.rs`, and none added them. So 99 runs still pass as `pending('07')` … `pending('12')` (the tally test pins `pending: 99`, `:994-998`), and a port deleted from any of those files fails nothing.

Adding the files (`../evidence.md` › `ports-probe.txt`) fails two of the test's own cases:

- "exempts no case or value it ports": 39 cases are exempt as pending and ported.
- "marks and exempts only cases and values the lists hold": 31 marks name a case run once per value without its `(value)`, for example the three `initializes without losing integrity after $boundary with $expected competing proposal` marks in `postgres_concurrency.rs:1609-1631`, the twelve SQLSTATE arms under one mark in `crates/host/src/sql/postgres/tests.rs:137`, and the four `names %s unavailable…` marks in `postgres_outages.rs:226-253`.

`test/integration/postgres-rows-across-runtimes.test.ts`, added by 10, is in no source list.

## What to build

- [ ] `POSTGRES.files` lists every Rust file holding PostgreSQL ports (the eight above), or reads them by pattern as the SQLite list does, so a new `postgres*.rs` is read without an edit.
- [ ] Every mark of a case run once per value names its value, `// Case: <name> (<value>)`, one per value; an `each!` block with several values carries one mark per arm or is split so it can.
- [ ] Every `pending` exemption is removed, the type loses its `pending` kind once none is left (the plan is closed), and the tally test pins `pending: 0`.
- [ ] The five cases ported with no mark (02) are marked, or exempt with the decision that makes them a difference.
- [ ] `postgres-rows-across-runtimes.test.ts` is listed, as a source or as an exemption saying it is the TypeScript half of the check whose Rust half is `postgres_rows.rs`.
- [ ] `test/e2e/postgres-persistence.spec.ts` › "a PostgreSQL-backed edit survives a fresh host" is exempt as ported by CI configuration (`.github/workflows/ci.yml:266` runs it against `serve --store postgres`), not pending on 10.
- [ ] `prisma-foundation.test.ts`'s three blank-or-trimmed `DATABASE_URL` cases are ported (`postgres_url.rs` › `trims_the_value`) or exempt as the settled difference (Rust refuses a blank URL), not pending on 09.

**Named mutants:** deleting any one ported test in the eight files, or one value's arm, fails "ports or exempts every case and value"; restoring a `pending` exemption fails the tally.

## Comments

**2026-11-28, re-read at `5a0956f8`.** Partly done.

What holds now. `test/unit/repository-contract-rust-ports.test.ts` gives the PostgreSQL adapter these files: `crates/host/tests/postgres.rs`, `postgres_concurrency.rs`, `postgres_outages.rs`, `postgres_properties.rs`, `postgres_races.rs`, `postgres_url.rs` and `crates/host/src/sql/postgres/tests.rs` as its own (`:735-743`), and `crates/cli/tests/serve_postgres.rs` as a shared file whose `// TypeScript case:` lines are its marks (`:744`, `:750`). It lists them by name, not by pattern. The tally pins 178 ported, 0 pending, 11 owned elsewhere and 4 accepted differences (`:925-935`), and the file passes (78 tests). Every per-value mark it reads names its value; a bare one fails "marks and exempts only cases and values the lists hold" (`:897-900`). The restart proof is exempt as owned elsewhere, `rust-postgresql-store 10` (`:693-695`). The three blank-or-trimmed `DATABASE_URL` cases are ported by marks at `serve_postgres.rs:112`, `:113` and `:155`. The five marks of 02 are read.

What is left:

- It does not read `crates/host/tests/postgres_wire.rs` (which holds HTTP conformance marks, held by `test/unit/http-conformance-rust-ports.test.ts`) or `crates/host/tests/postgres_rows.rs` (which holds no mark). A new `postgres*.rs` file is not read until it is listed.
- `test/integration/postgres-rows-across-runtimes.test.ts` is in no source list and no exemption (`:515-536`, `:665-712`).
- The `pending` kind is still in the type: `PlanTicket` (`:310`), the union (`:323`) and `pending()` (`:328`), with no exemption using it.
- The contract's per-value values come from the hand-written `VALUES` (`:61-74`), which no check compares with the contract's loops, for PostgreSQL as for SQLite. `.scratch/rust-postgresql-store/issues/16-sqlite-per-value-cases-in-the-ports-test.md` (on another branch) covers that; this ticket does not repeat it.
