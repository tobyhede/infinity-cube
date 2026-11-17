# 16 — The Rust PostgreSQL store

**Status:** needs-triage

**Blocked by:** 15.

**What to build:** The same SQL repository on PostgreSQL; the Rust binary's `serve` gains `--store postgres`, serving the database `DATABASE_URL` names as `pnpm dev` does; migration ownership moves to Rust (14); the PostgreSQL restart proof (`test/e2e/postgres-persistence.spec.ts`) runs against it, started by command as 15 makes the SQLite one.

- [ ] HTTP conformance suite (08) and PostgreSQL restart proof green against `serve --store postgres` in CI's `postgres` job.
- [ ] Storage requirements and the `AGENTS.md` Commands and PostgreSQL integration sections name the Rust verb and the Rust-owned migrations.
