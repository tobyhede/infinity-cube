# 12 — One set of plain-SQL migrations for both hosts

**Status:** needs-triage

**Blocked by:** 05.

**What to build:** The PostgreSQL (`migrations/`, Prisma) and SQLite (`migrations-sqlite/`) migrations as plain SQL files that Prisma, the SQLite migrator and `sqlx migrate` all apply, with a test that the schema each produces is the same. Ownership moves to Rust with 14.

- [ ] Both TypeScript database suites green on the shared files.
- [ ] `sqlx migrate` produces the same schema, checked in CI.
