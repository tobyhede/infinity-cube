# 11 — `serve` gaps and the stale ports exemption

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** The remaining gaps in how `infinity-cube serve --store sqlite` is tested as a process, and the stale reason in the HTTP ports test.

- [ ] `test/unit/http-conformance-rust-ports.test.ts`: the `NO_SQLITE_LISTENER` exemption says no verb serves SQLite, but `crates/cli/tests/serve.rs` tests the 421 case. `serve.rs` joins the SQLite adapter's files, the 421 test carries its `// Case:` line, and each case still exempt (the launch secret and the cookie) keeps a reason that is true.
- [ ] Process tests: an explicit `--port`, a second stop signal exiting one, and a start-up that stops written to standard error while `serve` keeps serving.
- [ ] An absolute `SQLITE_PATH` with surrounding whitespace is served from the trimmed path (the refused relative case is tested already).
- [ ] The spec's open question on `SQLITE_PATH` sources and normalisation is answered and held.
