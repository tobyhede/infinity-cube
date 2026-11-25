# 14 — An independent parity audit after the last ticket

**Status:** ready-for-agent

**Blocked by:** 13.

**What to build:** A cold review, by agents given only the code at that commit and the TypeScript tests, none of this plan's reports, of whether the Rust PostgreSQL store reaches test parity. Its report goes to the project's `reviews/`, with evidence.

- [ ] A case map built independently from the TypeScript files (not from `case-map.md`), each case marked ported (with the Rust test's `file:line`), exempt (with the reason, judged true or not) or missing.
- [ ] A fresh set of hand mutants of `sql/postgres.rs` and the concurrency seam, none taken from 13's catalogue, run against every PostgreSQL test, with each survivor.
- [ ] Every claim in Storage's PostgreSQL host section and in 01's ADR checked against code and tests.
- [ ] Findings become tickets; this plan is closed only when none is a correctness gap.

**Named mutants:** none of its own; it makes fresh ones by design.
