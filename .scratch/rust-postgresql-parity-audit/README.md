# Independent parity audit of the Rust PostgreSQL store

**Status:** done, 2026-11-28. Ticket 14 of `.scratch/rust-postgresql-store/`.

**Read at:** `32d316f3` (`origin/feat/rust-postgresql-store-13-mutation-audit`, which holds every earlier ticket of the plan).

**Re-read at:** `5a0956f8`, this branch with `origin/feat/rust-postgresql-store-13-mutation-audit` at `a5375110` merged in. Each statement that depends on the ports test, its exemptions or the files it reads says what holds at `5a0956f8`. Everything else is as read at `32d316f3`: the mutants (not run again), the claims and the line numbers of the case map and the claims, unless a row says otherwise.

**Where it lives:** ticket 14 says its report goes to the plan's `reviews/`. This run was not allowed to write anything under `.scratch/rust-postgresql-store/`, so the report and its follow-up tickets are in this directory instead: the report here, and the tickets in `issues/` here rather than the plan's `issues/`.

**Inputs:** the code at that commit and the TypeScript tests. Not used: the plan's `case-map.md`, ticket 00's reviews, ticket 13's catalogue (read only to make sure no mutant here repeats one) and every ticket's Comments.

## Answer

**The Rust PostgreSQL store reaches test parity with the TypeScript PostgreSQL store, and no finding is a correctness gap.** Every one of the 153 TypeScript cases that runs on PostgreSQL has a Rust port running on PostgreSQL or an exemption whose reason holds against the code. 16 of 24 fresh hand mutants are killed. Of the 8 survivors, 2 are equivalent, and 6 change behaviour only when a writer outside the repository's own decisions changes rows, or when two writes overlap in a way no test arranges. Each of those 6 is in a ticket.

The gate meant to keep this true holds most of it at `5a0956f8`. The ports test reads 8 of the 10 PostgreSQL test files (`test/unit/repository-contract-rust-ports.test.ts:732-752`) and pins 178 runs ported, 0 pending, 11 owned elsewhere and 4 accepted differences (`:925-935`), so deleting a port from a file it reads fails it. It does not read `crates/host/tests/postgres_wire.rs` (HTTP conformance ports, which `test/unit/http-conformance-rust-ports.test.ts` holds) or `crates/host/tests/postgres_rows.rs`, and `test/integration/postgres-rows-across-runtimes.test.ts` is in none of its lists. That is what is left of ticket 01.

## The three parts

| Part | File | Result |
| --- | --- | --- |
| A case map built from the TypeScript files | `case-map.md` | 153 cases: 137 ported, 16 exempt (all judged true), 0 missing; every port carries a mark the ports test reads |
| Fresh hand mutants against every PostgreSQL test | `mutants.md` | 24 mutants: 16 killed, 2 equivalent, 6 test gaps |
| Every claim of ADR 0177 and Storage's PostgreSQL text | `claims.md` | 38 ADR claims and 6 Storage claims: most confirmed; 4 code only, 3 imprecise, 1 partly wrong |

## Findings

Most severe first. None is a correctness gap: in each, the code at `32d316f3` does what ADR 0177 and the TypeScript store do.

| Ticket | Finding | Kind |
| --- | --- | --- |
| `issues/01-the-ports-test-reads-every-postgresql-test-file.md` | Partly closed. The ports test gives the PostgreSQL adapter 8 of the 10 files (`test/unit/repository-contract-rust-ports.test.ts:732-752`), pins `pending: 0` (`:929-930`) and passes. Every per-value mark it reads names its value. Left: it does not read `postgres_wire.rs` or `postgres_rows.rs`, `postgres-rows-across-runtimes.test.ts` is in no list, and the `pending` kind is still in its type (`:310`, `:323`) | parity gate |
| `issues/02-mark-the-five-unmarked-postgresql-ports.md` | Closed. The five ports (three `database-http-runtime` arms, the Vite host's unreachable-repository case and "trims a configured DATABASE_URL") carry `// TypeScript case:` marks in `crates/cli/tests/serve_postgres.rs` (`:154`, `:155`, `:371`, `:400`, `:661`), which the ports test reads (`:744`, `:750`) | parity gate |
| `issues/04-hold-the-fast-paths-row-lock-for-update.md` | `hold_space`'s `FOR UPDATE` can be weakened to `FOR SHARE` (A05) with every test green; then two overlapping Edits to one Space deadlock into a 503 instead of a commit and a conflict | mutation survivor |
| `issues/03-hold-the-postgresql-write-refusals-and-unlocked-write-isolation.md` | The upsert's owner refusal (A09) and the rollback of a refused write (A22) have no PostgreSQL test, though SQLite has one; unlocked writes' `READ COMMITTED` (A19) is in neither the ADR nor a test; one initialization branch (A24) is unheld, reachable only when an outside writer deletes a committed row | mutation survivors |
| `issues/07-hold-the-meta-relocks-identity-comparison.md` | The Meta relock can stop comparing the identity it read (A02) with every test green; then a replacement committed outside the repository between the identity read and the relock leaves a commit or replacement decided against the retired Meta Space | mutation survivor |
| `issues/05-say-unreachable-in-the-rust-repository-error.md` | ADR 0177 says "the term is Unreachable"; the Rust type and its message still say `Unavailable` | vocabulary |
| `issues/06-fold-adr-0177-into-a-postgresql-host-section.md` | Storage has no PostgreSQL host section; ADR 0177 is pending; two sentences are imprecise | documentation |

## What this audit did not check

- The HTTP conformance ports (`crates/host/tests/postgres_wire.rs`): they carry HTTP case marks, which `test/unit/http-conformance-rust-ports.test.ts` holds, not this plan's ports test.
- PostgreSQL 17.5, which CI runs. The mutants ran against 14.19, as ticket 13's did.
- The store-independent start-up cases of `test/unit/database-startup.test.ts` (fakes, no PostgreSQL), which 00 already reported for #528.
- Ticket 15 (the desktop app reaching any backend), which comes after this one.

## Evidence

`evidence.md` holds what produced each part, as Markdown because `.gitignore` keeps runnable files under `.scratch/` untracked:

- the unmutated run, each mutant's summary line and failing tests, the probe test that showed A02 is not equivalent, and the ports test run at `32d316f3` with all 10 files listed (in a copy deleted afterwards);
- `cases.mjs` (the TypeScript AST walk), `map.mjs` (every Rust `// Case:` mark, matched to the cases) and `render.mjs` (the case map, with the hand verdicts for rows the marks do not settle);
- `mutate.py`, `run-pg.sh` and `nextest.toml`, the mutant runner. It needs `INFINITY_CUBE_POSTGRES_TEST_URL` naming a server whose role may create databases and roles, mutates the working tree and restores each file with `git checkout`, so nothing else may edit `crates/host/src` while it runs.

To run the mutants again, copy the three runner files into one directory and, from the repository root, run `python3 -I <dir>/mutate.py` for every mutant or `python3 -I <dir>/mutate.py A05` for one.

