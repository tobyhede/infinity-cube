# 01: A string holding `\u0000` passes intake and fails the commit on PostgreSQL

**Status:** needs-triage

**Blocked by:** None.

**What to build:** Intake accepts the JSON escape `\u0000` inside a string (`crates/intake/src/json.rs:412` refuses only a raw control character, and the TypeScript intake reads it through `JSON.parse`), but PostgreSQL's `jsonb` refuses it with `22P05`. Both runtimes then answer the commit as an Unclassified failure, 500 `internal-error`, which the browser retries forever. The fix belongs to intake in both runtimes (refuse the escape, or map it), outside the PostgreSQL store's parity work, which pins today's answer (ADR 0177; `.scratch/rust-postgresql-store/spec.md`, Q11).

- [ ] The maintainer decides whether intake refuses `\u0000` or the stores rewrite it, and the decision is recorded.
- [ ] Both intakes and the conformance corpus agree on it, and the PostgreSQL tests that pin `22P05` change with it.
