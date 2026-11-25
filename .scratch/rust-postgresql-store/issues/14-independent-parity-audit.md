# 14 — An independent parity audit after the last ticket

**Status:** ready-for-agent once 13 lands

**Blocked by:** 13.

**What to build:** A cold review, by agents given only the code at that commit and the TypeScript tests, none of this plan's reports, of whether the Rust PostgreSQL store reaches test parity. Its report goes to the project's `reviews/`, with evidence.

- [ ] A case map built independently from the TypeScript files (not from `case-map.md`), each case marked ported (with the Rust test's `file:line`), exempt (with the exemption's reason, judged true or not) or missing.
- [ ] A fresh set of hand mutants of `sql/postgres.rs` and the concurrency seam, none taken from the catalogue, run against the PostgreSQL oracle, with each survivor.
- [ ] Every claim in Storage's PostgreSQL host section and in the ADR checked against code and tests.
- [ ] Findings become tickets; this plan is closed only when none is a correctness gap.
