# 11 — `serve` gaps and the stale ports exemption

**Status:** resolved

**Blocked by:** 03.

**What to build:** The remaining gaps in how `infinity-cube serve --store sqlite` is tested as a process, and the stale reason in the HTTP ports test.

- [x] `test/unit/http-conformance-rust-ports.test.ts`: the `NO_SQLITE_LISTENER` exemption says no verb serves SQLite, but `crates/cli/tests/serve.rs` tests the 421 case. `serve.rs` joins the SQLite adapter's files. The 421 test is first brought up to the full case (a bare `127.0.0.1` Host refused too, and the plain-text, no-store answer asserted), then carries its `// Case:` line; each case still exempt (the launch secret and the cookie) keeps a reason that is true.
- [x] Process tests: an explicit `--port`, a second stop signal exiting one, and a start-up that stops written to standard error while `serve` keeps serving.
- [x] A unit test of the options `serve` opens the SQLite repository with asserts a 5 s busy timeout; today a zero timeout passes every test.
- [x] A Meta document stored as text that is not JSON answers 500 over `serve`, as `test/integration/sqlite-http-runtime.test.ts` holds; each other case of that file has a port or a written exemption (03).
- [x] An absolute `SQLITE_PATH` with surrounding whitespace is served from the trimmed path (the refused relative case is tested already).
- [x] `serve` reads `SQLITE_PATH` only from the environment, and refuses `x/missing/../y.db` and a path whose parent is a regular file, each held by a process test (the spec's Settled questions).

## Comments

### Resolved (2026-11-26)

- `test/unit/http-conformance-rust-ports.test.ts`: the SQLite adapter's files are `sqlite_wire.rs` and `crates/cli/tests/serve.rs`. The 421 test now refuses a bare `127.0.0.1` too and asserts each refusal plain text with `Cache-Control: no-store`, and carries its `// Case:` line. The launch-secret and cookie cases keep an exemption saying `serve` announces no secret and sets no cookie, as `run` does not; the directory cases one saying `serve` has no directory to run or Export. A port may name files whose cases its marks may also carry for the repository ports test (`elsewhere`), so `serve.rs`'s marks for `sqlite-http-runtime.test.ts` are not unknown there.
- Process tests in `serve.rs`: `--port`; a second stop signal while a request is still arriving exits one, saying why; start-up over a Meta document that is not JSON answers 500 `internal-error` at the root and says it failed, then gives up after the confirming retry (about 15 s), says so on standard error and keeps serving; a padded absolute `SQLITE_PATH` serves the trimmed path; `x/missing/../y.db` is refused as relative (an absolute path through a missing directory is normalised as `resolve` normalises it, and served); a parent that is a regular file is refused; a `.env` naming a file is not read. The `sqlite-http-runtime.test.ts` cases are ported there (the refusals, a restart over the file start-up initialized, an edit kept across a restart and its stale repeat answered 409, the non-JSON Meta document), but for the closed database, which a process cannot close underneath itself: `sqlite_classification.rs`' `answers_every_request_over_a_closed_store_503_never_409` holds it over the application.
- `ConnectionSettings` gains `busy_timeout_ms`. `serve.rs`'s `opens_the_file_waiting_five_seconds_on_another_holders_lock` reads it from the repository `serve` opens: 5000. Mutant: `serve` opening with a zero busy timeout fails that test.
