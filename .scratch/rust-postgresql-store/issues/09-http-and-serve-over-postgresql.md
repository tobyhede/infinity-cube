# 09 — The HTTP cases and `serve --store postgres`

**Status:** resolved

**Blocked by:** 06, 08.

**What to build:** The conformance route rust-host 16's brief sets out, the `serve` verb, and the HTTP-runtime cases `case-map.md` assigns here (`database-http-runtime.test.ts`'s PostgreSQL arm, `vite-hono-host.test.ts:974`, `prisma-foundation.test.ts:45,53,63`).

- [x] `crates/host/tests/postgres_wire.rs` runs `http_conformance::cases!` against `Application` over the PostgreSQL store seeded with the tracked fixture, each case on a fresh database, and the store-condition cases (`uninitialized`, `unavailable` through 08's stand-in, `broken-stored-state`). `test/unit/http-conformance-rust-ports.test.ts` gains the adapter, and each exemption it carries has a reason true for PostgreSQL.
- [x] `infinity-cube serve --store postgres [--port <port>] [--built <dir>]` serves the database `DATABASE_URL` names behind `run`'s listener, `Host` check and announcement, runs ST-10's start-up after announcing, exits zero on SIGINT, SIGTERM or SIGHUP and at once on a second signal. It refuses an unset or blank `DATABASE_URL` before taking a port, naming it, and serves a trimmed one.
- [x] Process tests in `crates/cli/tests/serve_postgres.rs` (added to 03's adapter): the refusals above; announcing before an unreachable server answers, then initializing once it does (the counterpart of `vite-hono-host.test.ts:974`); establishing Default Content, recovering after a transient failure, and giving up after two confirmed invariant failures (`database-http-runtime.test.ts:102,135,179`); serving without reseeding; an explicit `--port`; a second signal; a start-up that stops written to standard error while `serve` keeps serving; the 421 case in full.
- [x] Storage (the PostgreSQL host section, the Operations index) and `AGENTS.md` (Commands, Rust) name `serve --store postgres` beside `pnpm dev`.

**Named mutants (each killed by this ticket's tests):** `serve` taking the port before refusing a blank `DATABASE_URL`; `serve` migrating; `--store postgres` opening SQLite; reseeding an initialized database; the `Host` check missing; `DATABASE_URL` not trimmed; announcing only after start-up succeeds.

## Comments

- `http_conformance::cases!` now takes attributes after the adapter, put on every generated test, so `postgres_wire.rs` runs the table with `#[ignore = "needs PostgreSQL: …"]`. `cases!(Adapter)` is unchanged for the other three adapters.
- One table case differs on PostgreSQL: "answers a Space with its positions in the order the commit wrote them". `jsonb` holds an object's keys shorter first, then by their bytes, so the answer holds the positions in that order, not the order the commit wrote. `Adapter` gained `stored_key_order`, which is the order written by default and `jsonb`'s order in the PostgreSQL adapter. The case asserts the answer is the order the store holds, as ST-119 says the Rust host answers.
- The store conditions:
  - Uninitialized is a migrated database with nothing in it.
  - Unavailable is 08's stand-in refusing every connection with `57P03`, behind a 200 ms acquire timeout. It needs no server, so it runs in the plain `nextest` step.
  - Broken stored state is a database no migration has run on. A missing table is an Invariant failure (ADR 0177), so every read answers 500.
- The ports test holds the new adapter over `postgres_wire.rs` and `crates/cli/tests/serve_postgres.rs`, which carries the 421 case. It exempts the launch-secret cases, because `serve` takes no launch secret, and the directory cases, because `serve` has no directory. The TypeScript database host's own cases that the case map assigns here are marked `// TypeScript case:` in `serve_postgres.rs`, so the ports test does not read them as conformance cases.
- CI's PostgreSQL step now also runs the ignored tests of `serve_postgres` (`binary(=serve_postgres)`). The `DATABASE_URL` refusals and the database that does not answer need no server, so they run in the plain step.
- The test for an unmigrated database waits through both of start-up's retries, 5 s and then 10 s, asserting 500 throughout. It then checks that `serve` is still running, that standard error says start-up gave up, and that the database still holds no table. It takes about 20 s.
- Named mutants. Seven were run on 2026-11-26 against `cargo test -p infinity-cube --test serve_postgres -- --include-ignored` on PostgreSQL 16.15:
  - Taking the port before refusing a blank `DATABASE_URL`: killed by `refuses_an_unset_or_blank_database_url_before_taking_a_port` and `serves_on_the_port_port_names`.
  - Migrating: killed by `gives_up_after_two_confirmed_invariant_failures_and_keeps_serving`.
  - `--store postgres` opening SQLite: killed by all 12 tests.
  - Reseeding an initialized database: killed by `serves_it_without_reseeding` once it waits for start-up. It survived while that test read before background start-up had run.
  - No `Host` check: killed by `answers_421_to_a_request_naming_any_host_but_its_own`.
  - Not trimming `DATABASE_URL`: survives `serve_postgres`, because the `url` crate strips surrounding spaces when it parses, so a padded value still connects. Killed by `crates/host/tests/postgres_url.rs` › `trims_the_value`.
  - Announcing only after start-up: killed by `announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env` and `announces_before_the_database_answers_and_initializes_it_once_it_does`.
- `serve_postgres.rs` makes its own databases rather than going through 03's contract adapter. 03 is still blocked on #540.
