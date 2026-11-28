# Independent parity audit of the Rust PostgreSQL store

**Status:** done, 2026-11-28. Ticket 14 of `.scratch/rust-postgresql-store/`.

**Read at:** `32d316f3` (`origin/feat/rust-postgresql-store-13-mutation-audit`, which holds every earlier ticket of the plan).

**Inputs:** the code at that commit and the TypeScript tests. Not used: the plan's `case-map.md`, ticket 00's reviews, ticket 13's catalogue (read only to make sure no mutant here repeats one) and every ticket's Comments.

## Answer

**The Rust PostgreSQL store reaches test parity with the TypeScript PostgreSQL store, and no finding is a correctness gap.** Every one of the 153 TypeScript cases that runs on PostgreSQL has a Rust port running on PostgreSQL or an exemption whose reason holds against the code. 15 of 24 fresh hand mutants are killed. Of the 9 survivors, 4 are equivalent, and 5 change behaviour only when a writer outside the repository's own decisions changes rows, or when two writes overlap in a way no test arranges. Each of those 5 is a ticket.

The gate meant to keep this true is not working. The ports test reads 2 of the 10 files that hold PostgreSQL ports, so 99 cases stand "pending" on tickets that have landed, and deleting a port from the other 8 fails nothing. That is ticket 01. It is not a correctness gap in the store, but I would fix it before relying on parity staying true.

## The three parts

| Part | File | Result |
| --- | --- | --- |
| A case map built from the TypeScript files | `case-map.md` | 153 cases: 135 ported, 18 exempt (all judged true), 0 missing; 5 ports carry no `// Case:` line |
| Fresh hand mutants against every PostgreSQL test | `mutants.md` | 24 mutants: 15 killed, 4 equivalent, 5 test gaps |
| Every claim of ADR 0177 and Storage's PostgreSQL text | `claims.md` | 38 ADR claims and 6 Storage claims: most confirmed; 3 code only, 3 imprecise, 1 partly wrong |

## Findings

Most severe first. None is a correctness gap: in each, the code at `32d316f3` does what ADR 0177 and the TypeScript store do.

| Ticket | Finding | Kind |
| --- | --- | --- |
| `issues/01-the-ports-test-reads-every-postgresql-test-file.md` | The ports test gives the PostgreSQL adapter 2 of its 10 files (`test/unit/repository-contract-rust-ports.test.ts:820`), so 99 runs pass as `pending` and a deleted port fails nothing. Reading all 10 fails two of its own tests: 39 cases exempt and ported, 31 marks missing their `(value)` (`evidence.md` › `ports-probe.txt`) | parity gate |
| `issues/02-mark-the-five-unmarked-postgresql-ports.md` | Five ports have no `// Case:` line: three `database-http-runtime` arms, the Vite host's unreachable-repository case and "trims a configured DATABASE_URL" | parity gate |
| `issues/04-hold-the-fast-paths-row-lock-for-update.md` | `hold_space`'s `FOR UPDATE` can be weakened to `FOR SHARE` (A05) with every test green; then two overlapping Edits to one Space deadlock into a 503 instead of a commit and a conflict | mutation survivor |
| `issues/03-hold-the-postgresql-write-refusals-and-unlocked-write-isolation.md` | The upsert's owner refusal (A09) and the rollback of a refused write (A22) have no PostgreSQL test, though SQLite has one; unlocked writes' `READ COMMITTED` (A19) is in neither the ADR nor a test; one initialization branch (A24) is unheld | mutation survivors |
| `issues/05-say-unreachable-in-the-rust-repository-error.md` | ADR 0177 says "the term is Unreachable"; the Rust type and its message still say `Unavailable` | vocabulary |
| `issues/06-fold-adr-0177-into-a-postgresql-host-section.md` | Storage has no PostgreSQL host section; ADR 0177 is pending; two sentences are imprecise | documentation |

## What this audit did not check

- The HTTP conformance ports (`crates/host/tests/postgres_wire.rs`): they carry HTTP case marks, which `test/unit/http-conformance-rust-ports.test.ts` holds, not this plan's ports test.
- PostgreSQL 17.5, which CI runs. The mutants ran against 14.19, as ticket 13's did.
- The store-independent start-up cases of `test/unit/database-startup.test.ts` (fakes, no PostgreSQL), which 00 already reported for #528.
- Ticket 15 (the desktop app reaching any backend), which comes after this one.

## Evidence

`evidence.md` holds what produced each part, as Markdown because `.gitignore` keeps runnable files under `.scratch/` untracked:

- the unmutated run, each mutant's summary line and failing tests, and the ports test run with all 10 files listed (in a copy deleted afterwards);
- `cases.mjs` (the TypeScript AST walk), `map.mjs` (every Rust `// Case:` mark, matched to the cases) and `render.mjs` (the case map, with the hand verdicts for rows the marks do not settle);
- `mutate.py`, `run-pg.sh` and `nextest.toml`, the mutant runner. It needs `INFINITY_CUBE_POSTGRES_TEST_URL` naming a server whose role may create databases and roles, mutates the working tree and restores each file with `git checkout`, so nothing else may edit `crates/host/src` while it runs.

To run the mutants again, copy the three runner files into one directory and, from the repository root, run `python3 -I <dir>/mutate.py` for every mutant or `python3 -I <dir>/mutate.py A05` for one.

