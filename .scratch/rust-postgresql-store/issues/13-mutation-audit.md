# 13 — The mutation audit

**Status:** ready-for-agent once 12 lands

**Blocked by:** 05–12.

**What to build:** The gate Q12 sets, closed out. Each earlier ticket has already recorded, in its PR, the test that kills each of its named mutants. This runs a tool over the result to find mutants nobody named.

- [ ] `cargo-mutants`, at a pinned version, over `crates/host/src/sql.rs`, `crates/host/src/sql/postgres.rs` and `crates/host/src/commit.rs`, against the PostgreSQL oracle (`cargo nextest run -p host --run-ignored only --test postgres --test postgres_wire` and the `sql::postgres` unit tests) with Compose's server, run locally or by a manually dispatched workflow, never a required check.
- [ ] Every surviving mutant gets a test that kills it, or a written reason it is equivalent, in this ticket's PR; nothing is left unexplained. The command, the version and the summary line are recorded.
- [ ] The hand-mutant catalogue of 04–12, collected in one place with the test that kills each, so a later change to the store can re-run it.
