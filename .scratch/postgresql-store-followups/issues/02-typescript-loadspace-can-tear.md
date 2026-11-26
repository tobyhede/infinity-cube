# 02: TypeScript's `loadSpace` can read a torn Space on PostgreSQL

**Status:** needs-triage

**Blocked by:** None.

**What to build:** `src/persistence/sql-space-repository.ts:304-326` reads a Space's row and its Resource rows in separate statements with no transaction, under the server's default isolation. A commit landing between them can give a Space whose revision and Resources disagree, which fails intake or answers a Space that never existed. The Rust store reads both in one `REPEATABLE READ READ ONLY` transaction (ADR 0177; `.scratch/rust-postgresql-store/spec.md`, Q3), an accepted difference while TypeScript is frozen.

- [ ] A failing TypeScript test that commits between the two reads, then the reads in one snapshot, once the maintainer unfreezes TypeScript for it or retires it.
