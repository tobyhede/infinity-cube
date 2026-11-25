# 11 — `serve` gaps and the stale ports exemption

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** The remaining gaps in how `infinity-cube serve --store sqlite` is tested as a process, and the stale reason in the HTTP ports test.

- [ ] `test/unit/http-conformance-rust-ports.test.ts`: the `NO_SQLITE_LISTENER` exemption says no verb serves SQLite, but `crates/cli/tests/serve.rs` tests the 421 case. `serve.rs` joins the SQLite adapter's files. The 421 test is first brought up to the full case (a bare `127.0.0.1` Host refused too, and the plain-text, no-store answer asserted), then carries its `// Case:` line; each case still exempt (the launch secret and the cookie) keeps a reason that is true.
- [ ] Process tests: an explicit `--port`, a second stop signal exiting one, and a start-up that stops written to standard error while `serve` keeps serving.
- [ ] A unit test of the options `serve` opens the SQLite repository with asserts a 5 s busy timeout; today a zero timeout passes every test.
- [ ] A Meta document stored as text that is not JSON answers 500 over `serve`, as `test/integration/sqlite-http-runtime.test.ts` holds; each other case of that file has a port or a written exemption (03).
- [ ] An absolute `SQLITE_PATH` with surrounding whitespace is served from the trimmed path (the refused relative case is tested already).
- [ ] `serve` reads `SQLITE_PATH` only from the environment, and refuses `x/missing/../y.db` and a path whose parent is a regular file, each held by a process test (the spec's Settled questions).
