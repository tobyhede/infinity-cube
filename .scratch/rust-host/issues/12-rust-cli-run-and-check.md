# 12 — The Rust CLI: run and check

**Status:** ready-for-agent

**Blocked by:** 11.

**What to build:** A binary over `host` with `run <dir> [--port] [--no-open]` (loopback listener, built web assets embedded, flush on SIGINT/SIGTERM/SIGHUP, second signal exits at once) and `check <dir>` (Import into a discarded store, exit zero or print intake errors), refusing what `pnpm cube run` and `pnpm cube check` refuse.

- [ ] The HTTP conformance suite (08) green against this binary in CI.
- [ ] The intake corpus (07) green through `check`.
