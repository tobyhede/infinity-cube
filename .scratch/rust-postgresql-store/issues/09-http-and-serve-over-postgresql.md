# 09 — The HTTP cases and `serve --store postgres`

**Status:** ready-for-agent once 06 lands

**Blocked by:** 06, 08.

**What to build:** The conformance route rust-host 16's brief sets out, the `serve` verb, and the HTTP-runtime cases `case-map.md` assigns here (`database-http-runtime.test.ts`'s PostgreSQL arm, `vite-hono-host.test.ts:974`, `prisma-foundation.test.ts:45,53,63`).

- [ ] `crates/host/tests/postgres_wire.rs` runs `http_conformance::cases!` against `Application` over the PostgreSQL store seeded with the tracked fixture, each case on a fresh database, and the store-condition cases (`uninitialized`, `unavailable` through 08's stand-in, `broken-stored-state`). `test/unit/http-conformance-rust-ports.test.ts` gains the adapter, and each exemption it carries has a reason true for PostgreSQL.
- [ ] `infinity-cube serve --store postgres [--port <port>] [--built <dir>]` serves the database `DATABASE_URL` names behind `run`'s listener, `Host` check and announcement, runs ST-10's start-up after announcing, exits zero on SIGINT, SIGTERM or SIGHUP and at once on a second signal. It refuses an unset or blank `DATABASE_URL` before taking a port, naming it, and serves a trimmed one.
- [ ] Process tests in `crates/cli/tests/serve_postgres.rs` (added to 03's adapter): the refusals above; announcing before an unreachable server answers, then initializing once it does (the counterpart of `vite-hono-host.test.ts:974`); establishing Default Content, recovering after a transient failure, and giving up after two confirmed invariant failures (`database-http-runtime.test.ts:102,135,179`); serving without reseeding; an explicit `--port`; a second signal; a start-up that stops written to standard error while `serve` keeps serving; the 421 case in full.
- [ ] Storage (the PostgreSQL host section, the Operations index) and `AGENTS.md` (Commands, Rust) name `serve --store postgres` beside `pnpm dev`.

**Named mutants (each killed by this ticket's tests):** `serve` taking the port before refusing a blank `DATABASE_URL`; `serve` migrating; `--store postgres` opening SQLite; reseeding an initialized database; the `Host` check missing; `DATABASE_URL` not trimmed; announcing only after start-up succeeds.
