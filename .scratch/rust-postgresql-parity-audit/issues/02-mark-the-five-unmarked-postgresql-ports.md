# 02 — Mark the five unmarked PostgreSQL ports

**Status:** ready-for-agent

**Blocked by:** nothing; 01 then holds the marks.

**Kind:** parity gate.

## What is wrong

Five TypeScript PostgreSQL cases have a Rust test that ports them and no `// Case:` line, so the ports test cannot see them (`../case-map.md`, rows "ported, unmarked"):

| TypeScript case | Rust test |
| --- | --- |
| `test/integration/database-http-runtime.test.ts:102` "establishes Default Content and serves the collection and Meta Space" (PostgreSQL) | `crates/cli/tests/serve_postgres.rs:373` `initializes_it_from_default_content_and_serves_it` |
| `:135` "recovers through the shared retry after a transient startup failure" (PostgreSQL) | `serve_postgres.rs:402` `announces_before_the_database_answers_and_initializes_it_once_it_does` |
| `:179` "gives up through the shared retry after two confirmed invariant failures" (PostgreSQL) | `serve_postgres.rs:663` `gives_up_after_two_confirmed_invariant_failures_and_keeps_serving` |
| `test/unit/vite-hono-host.test.ts:974` "composes an application when the repository cannot be reached" | `serve_postgres.rs:156` `announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env` |
| `test/unit/prisma-foundation.test.ts:53` "trims a configured DATABASE_URL" | `crates/host/tests/postgres_url.rs:74` `trims_the_value` |

The ports test calls the first four pending on 09 and the fifth pending on 09, though 09 has landed.

## What to build

- [ ] Each Rust test above carries its case's mark, with `(PostgreSQL)` for the `describe.each` arms as the ports test's values name them, and the matching `pending` exemptions go.
- [ ] Check before marking that each Rust test asserts what the TypeScript case asserts (`:135` asserts one report of the transient failure and a 200 listing; say in the comment above the Rust test where it differs).

**Named mutants:** removing any one of the five marks fails the ports test once 01 has landed.
