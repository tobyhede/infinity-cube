# 00 — A cold, independent audit of this plan

**Status:** resolved

**Numbering, a recorded deviation:** `docs/agents/issue-tracker.md` numbers tickets from `01`. This one is `00` because it ran before the plan's first ticket and its result rewrote the others; renumbering would shift every ticket, its cross-references and the decisions that cite them for no change in meaning, so it keeps `00`.

**Blocked by:** None. Runs before any other ticket here, and before the user's answers are applied, so its findings can change the questions.

**What to build:** A review by agents given only the repository at `fdb63a1` (#521's head before it was rebased and merged; the plan's citations are now at `ad4d2862`), `main`, and this folder, and none of the reasoning or reviews behind it. Its output goes to the project's `reviews/rust-postgresql-plan-audit-<date>/`, with evidence beside the report, and the plan is corrected from it before 01 starts.

- [x] Every factual claim in `spec.md` and each ticket is checked by reading the cited `file:line` or running the cited command, and marked confirmed, wrong (with the correct fact and its evidence) or unverifiable. A claim with no citation is a finding.
- [x] The case map is regenerated with `case-map.mjs` and compared with `case-map.md`: no TypeScript PostgreSQL case is missing, and none is assigned to a ticket that does not say it ports it.
- [x] An independent search for TypeScript PostgreSQL tests the plan does not list (any test file that builds `postgresSqlStore`, `createPostgresDatabase` or `postgresTarget`, or runs under `INFINITY_CUBE_DATABASE_TARGET=postgres`), with the command and its output.
- [x] Probes, each as a throwaway test against a real PostgreSQL 17.5 (Compose's image), with output recorded: what TypeScript answers for a commit holding `\u0000` (Q11); what `sqlx` 0.9 exposes for a resolver failure, and whether `EAI_AGAIN` and `ENOTFOUND` can be told apart (Q5); that READ COMMITTED is the stock default and what TypeScript does under a server set to SERIALIZABLE (Q3); what `jsonb` returns as text for a number written as `1.0`, `1e21` and `-0`, and whether Rust's intake reads each back to the value written.
  **Deviation, accepted:** the audit had neither Docker nor a PostgreSQL 17 build, so `probes.md` ran against a local PostgreSQL 16.15. The server behaviours the probes relied on (READ COMMITTED as the stock default, `40001` for a losing row-lock write under SERIALIZABLE, `jsonb`'s number and key handling, `22P05` for `\u0000`) are documented as unchanged between 16 and 17, and the resolver probe is client-side. The plan does not rest on the 16.15 run alone: each probed behaviour is pinned again by a test that runs against CI's 17.5 (Q3's SERIALIZABLE test and `-0` in 05, the resolver and `22P05` in 08), so a difference on 17.5 fails that ticket.
- [x] For each Open question, whether the recommendation follows from the evidence, and any divergence between the runtimes the plan does not list.
- [x] For each ticket, whether its named mutants would in fact be killed by the tests it asks for, and which plausible mutant of the code it touches is not named.
- [x] Whether the order and the blocked-by lines let each ticket merge green on its own.

## Answer

The plan held up in shape and needed corrections in fact. The three reports are in the project's `reviews/rust-postgresql-plan-audit-2026-11-25/`:

- `spec-claims.md`: 63 claims checked, 55 confirmed, 6 wrong and 2 uncited. Every wrong claim and citation is corrected in `spec.md` and the tickets (`spec.md`, Audit).
- `tickets.md`: the case map confirmed row for row at #521's head, and eight TypeScript files that run on PostgreSQL the first map missed, added as "Found by 00" in `case-map.md`. Ordering defects fixed in 02–05, 07 and 12; mutants that the asked-for tests would not kill renamed or given a killing test.
- `probes.md`, on PostgreSQL 16.15 (the deviation above): READ COMMITTED is the stock default and a SERIALIZABLE server answers a losing row-lock write `40001`, which TypeScript answers 503 (Q3); `sqlx` 0.9 cannot tell `EAI_AGAIN` from `ENOTFOUND` (Q5, an accepted difference); a `\u0000` string fails with `22P05` (Q11); `jsonb` keeps `1.0` and `1e21` as their values and reads `-0` back as `0` (Q14).
- Divergences the plan had not listed, now decided: Q2, Q3, Q5, Q8 and Q14, and the shared gaps in `spec.md`.
- One finding for #528 rather than this plan: #528's 09 does not port seven store-independent cases of `test/unit/database-startup.test.ts`, and no ports test reads that file.

The user then settled Q1–Q17 on 2026-11-25 against the corrected plan (`spec.md`, Decisions for PostgreSQL).
