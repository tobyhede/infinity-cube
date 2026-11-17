# 15 — The Rust SQLite store

**Status:** needs-triage

**Blocked by:** 11, 14.

**What to build:** One SQL repository over `sqlx` implementing the storage trait, with SQLite first. The TypeScript SQLite host is not a CLI verb but `pnpm dev:sqlite` (`scripts/dev-sqlite.ts`, through Vite): the Rust binary gains a `serve --store sqlite` verb that serves the file `SQLITE_PATH` names, as `pnpm dev:sqlite` does. The SQLite restart proof (`test/e2e/sqlite-persistence.spec.ts`, `pnpm e2e:sqlite`) starts its two hosts with Vite's `createServer` today; it gains a way to start a host by command instead (the command and its environment given to the spec), so the same spec runs against the Rust binary unchanged.

- [ ] HTTP conformance suite (08) green against `serve --store sqlite`, and the SQLite restart proof green against it in CI's `sqlite` job.
- [ ] Storage requirements and the `AGENTS.md` Commands section name the Rust SQLite verb beside `pnpm dev:sqlite`.
