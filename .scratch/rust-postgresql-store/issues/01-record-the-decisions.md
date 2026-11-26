# 01 — Record the PostgreSQL decisions

**Status:** resolved

**Blocked by:** nothing. It extends #528's 02 (its ADR) rather than repeating it; whichever lands second rebases onto the other.

**What to build:** The decisions `spec.md` records (Decisions for PostgreSQL), written where the next reader looks, before any code. The spec and tickets already carry the answers.

- [x] One new ADR records the Rust PostgreSQL store's decisions and its accepted differences from TypeScript: the concurrency protocol (Q2), READ COMMITTED for locking transactions and REPEATABLE READ READ ONLY for multi-statement unlocked reads (Q3), unbounded lock waits as a recorded risk (Q4), classification and the resolver difference (Q5), a missing table (Q6, with its different problem detail), `DATABASE_URL` from the environment then the nearest `.env`, searched from the current directory (Q7), the pool and its acquire-timeout 503s (Q8), TLS roots (Q10), `\u0000` (Q11), `-0` (Q14), `sslmode` read as `pg` reads it (Q15), operations that run to completion when their request is dropped (Q16), and the term Unreachable (Q17). It is accepted and indexed, and edits no requirements document (ADR 0175): `python3 scripts/adr_snapshot.py check` lists it as pending until the next snapshot refresh folds it into Storage, as #528's 02 leaves its own.
- [x] No requirements document changes here. Each later ticket whose code changes a behaviour Storage describes updates that requirement in its own commit, as AGENTS.md requires of a behaviour change; the ADR's decisions reach Storage at the next refresh.
- [x] Issues, each out of this plan's scope: `\u0000` as a defect in both runtimes (Q11); TypeScript's `loadSpace` reading a Space and its Resources in separate statements, so a commit between them can tear the read (Q3); bounding lock waits in both runtimes (Q4); and, if the user wants every store to agree, intake rewriting `-0` to `0` (Q14).
- [x] `CONTEXT.md` has **Unreachable**, Invariant failure and Unclassified failure (added with this plan, #536).
- [x] `.scratch/rust-host/issues/16-rust-postgresql-store.md` is edited so the two plans don't both claim the store (Q13): its **What to build** (line 9), the settled-scope paragraph of its triage notes (line 27) and the Agent Brief's "The PostgreSQL store" and `serve --store postgres` bullets (lines 37–38) say that this plan builds the store and `serve --store postgres`, naming `.scratch/rust-postgresql-store/`; 16 keeps `migrate`, the Prisma Next retirement, the CI `db verify` step and their docs, and its acceptance criteria lose the store's. Its Blocked-by line stays as it is.
- [x] ~~#528's 03, 04, 05, 06, 12 and 13 are set to blocked on 02 in the same change, naming why (Q1), and #528's 02 says Unreachable (Q17).~~ Superseded: see Comments.

**Named mutants:** none; documentation only.

## Comments

**2026-11-26, resolved.** ADR 0177 records the decisions and is indexed; `python3 scripts/adr_snapshot.py check` lists it as pending. The four out-of-scope issues are `.scratch/postgresql-store-followups/issues/01`–`04`. Rust-host 16's What to build, settled-scope paragraph, store and `serve` bullets, conformance paragraph and acceptance criteria now hand the store, `serve --store postgres` and the restart proof to this plan.

The last bullet was not applied as written. #528's tickets were being implemented on PR #540 when this landed; its thread agreed instead to write #528's 04, 05, 06 and 12 as the shared table (`crates/host/tests/repository_contract/`, `repository_cases!`), which is this plan's 02, and to switch #528's 02 (ADR 0176, Storage, the ticket text) to Unreachable. Marking those tickets blocked on 02 would have contradicted the work under way, so they are left to #540.
