# 12 — The Rust CLI: run and check

**Status:** ready-for-agent

**Blocked by:** 11.

**What to build:** A binary over `host` with `run <dir> [--port] [--no-open]` (listener on `127.0.0.1` that refuses a request whose `Host` is not its own address, so a DNS-rebinding page cannot reach it; built web assets embedded; flush on SIGINT/SIGTERM/SIGHUP, second signal exits at once) and `check <dir>` (Import into a discarded store, exit zero or print intake errors), refusing what `pnpm cube run` and `pnpm cube check` refuse, with the same kind and location (ADR 0156). `run` writes the HTTP conformance suite's announcement (`conformance/http/README.md`) as one JSON line on standard output: `{"kind":"listening","port":…}` once it can be reached, or `{"kind":"refused","message":…}` before it exits non-zero; its other output goes to standard error, or to standard output as lines that are not that JSON. The suite reads no other announcement, so this is what lets 08 run against the binary. A missing or empty directory is refused naming `pnpm cube init <dir>`, the TypeScript verb that creates one, until 17 gives the Rust binary its own `init` and the text names that.

- [ ] The HTTP conformance suite (08) green against this binary in CI.
- [ ] The intake corpus (07) green through `check`.
- [ ] A request naming another `Host` refused, by a case in 08 run against this binary.
- [ ] `run` announces itself, and a refusal, as the suite's one JSON line.
- [ ] Storage requirements (Running, `check`) and the `AGENTS.md` Commands section name the Rust CLI, how to build it and how to run it.
