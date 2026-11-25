# 00 — A cold, independent audit of this plan

**Status:** done (2026-11-25; reports in the project's `reviews/rust-postgresql-plan-audit-2026-11-25/`, applied to this folder)

**Blocked by:** None. Runs before any other ticket here, and before the user's answers are applied, so its findings can change the questions.

**What to build:** A review by agents given only the repository at `fdb63a1` (#521's head), `main`, and this folder, and none of the reasoning or reviews behind it. Its output goes to the project's `reviews/rust-postgresql-plan-audit-<date>/`, with evidence beside the report, and the plan is corrected from it before 01 starts.

- [ ] Every factual claim in `spec.md` and each ticket is checked by reading the cited `file:line` or running the cited command, and marked confirmed, wrong (with the correct fact and its evidence) or unverifiable. A claim with no citation is a finding.
- [ ] The case map is regenerated with `case-map.mjs` and compared with `case-map.md`: no TypeScript PostgreSQL case is missing, and none is assigned to a ticket that does not say it ports it.
- [ ] An independent search for TypeScript PostgreSQL tests the plan does not list (any test file that builds `postgresSqlStore`, `createPostgresDatabase` or `postgresTarget`, or runs under `INFINITY_CUBE_DATABASE_TARGET=postgres`), with the command and its output.
- [ ] Probes, each as a throwaway test against a real PostgreSQL 17.5 (Compose's image), with output recorded: what TypeScript answers for a commit holding `\u0000` (Q11); what `sqlx` 0.9 exposes for a resolver failure, and whether `EAI_AGAIN` and `ENOTFOUND` can be told apart (Q5); that READ COMMITTED is the stock default and what TypeScript does under a server set to SERIALIZABLE (Q3); what `jsonb` returns as text for a number written as `1.0`, `1e21` and `-0`, and whether Rust's intake reads each back to the value written.
- [ ] For each Open question, whether the recommendation follows from the evidence, and any divergence between the runtimes the plan does not list.
- [ ] For each ticket, whether its named mutants would in fact be killed by the tests it asks for, and which plausible mutant of the code it touches is not named.
- [ ] Whether the order and the blocked-by lines let each ticket merge green on its own.
