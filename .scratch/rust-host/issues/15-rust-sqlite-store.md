# 15 — The Rust SQLite store

**Status:** needs-triage

**Blocked by:** 11, 14.

**What to build:** One SQL repository over `sqlx` implementing the storage trait, with SQLite first; the CLI gains the SQLite host; the SQLite restart proof (`pnpm e2e:sqlite`) and integration suite run against it.

- [ ] HTTP conformance suite and SQLite restart proof green against the Rust SQLite host.
