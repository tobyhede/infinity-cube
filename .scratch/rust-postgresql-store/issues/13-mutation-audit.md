# 13 — The mutation audit

**Status:** ready-for-agent once every one of 05–12 lands

**Blocked by:** 05–12.

**What to build:** The gate Q12 sets, closed out. Each earlier ticket has recorded, in its PR, the test that kills each of its named mutants. This runs a tool over the result to find mutants nobody named.

- [ ] `cargo-mutants`, at a pinned version, over `crates/host/src/sql.rs`, `crates/host/src/sql/postgres.rs` and `crates/host/src/commit.rs`, against every PostgreSQL test (`--run-ignored only` over `postgres*.rs`, `serve_postgres.rs`, the `sql::postgres` unit tests and 04's seam tests) with Compose's server, run locally or by a manually dispatched workflow, never a required check.
- [ ] Every surviving mutant gets a test that kills it or a written reason it is equivalent, in this ticket's PR. The command, the version and the summary line are recorded.
- [ ] The hand-mutant catalogue of 02–12, collected in one file with the test that kills each, so a later change can re-run it.
