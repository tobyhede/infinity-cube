# 09 — The HTTP cases and `serve --store postgres`

**Status:** ready-for-agent once 06 lands

**Blocked by:** 06, 08.

**What to build:** The conformance route rust-host 16's brief sets out, and the `serve` verb, tested as #528's 11 asks of SQLite.

- [ ] `crates/host/tests/postgres_wire.rs` runs `http_conformance::cases!` against `Application` over the PostgreSQL store seeded with the tracked fixture, each case on a fresh database, and the store-condition cases (`uninitialized`, `unavailable` through 08's stand-in server, `broken-stored-state`). `test/unit/http-conformance-rust-ports.test.ts` gains the adapter, and every exemption it carries has a reason that is true for PostgreSQL.
- [ ] `infinity-cube serve --store postgres [--port <port>] [--built <dir>]` serves the database `DATABASE_URL` names behind `run`'s listener, `Host` check and announcement, runs ST-10's start-up after announcing, exits zero on SIGINT, SIGTERM or SIGHUP and at once on a second signal. It refuses an unset or blank `DATABASE_URL` before taking a port, naming it.
- [ ] Process tests in `crates/cli/tests/serve_postgres.rs`: the refusals above; announcing before an unreachable server answers, then initializing once it does; serving without reseeding an initialized database; an explicit `--port`; a second signal; a start-up that stops written to standard error while `serve` keeps serving; the 421 case in full.
- [ ] Storage (the PostgreSQL host section, the Operations index) and `AGENTS.md` (Commands, Rust) name `serve --store postgres` beside `pnpm dev`.
