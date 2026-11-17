# 03 — A production Node host, with no Vite

**Status:** ready-for-agent

**Blocked by:** 02.

**What to build:** A Node entry that composes a run (`startRun`, `src/run/run.ts`) and serves it with `@hono/node-server`: the Fetch application, product addresses through `resolveProductRequest` before the shell (routing as `packages/app/vite-space-http-plugin.ts` does today), the built `vite build` output, and `index.html` as the single-page fallback, with a Content Security Policy adapted from `packages/app/mount-headers.ts`. Locked down for a desktop sidecar (ADR 0155): binds `127.0.0.1` on a port the OS picks; refuses a request whose `Host` is not `127.0.0.1:<port>`; requires a secret minted at launch, presented once as `/?launch=<secret>` and traded for an `HttpOnly`, `SameSite=Strict` cookie by a redirect, after which every request needs the cookie (decided 17 November 2026); prints one JSON line `{ "port", "secret" }` on standard output once listening; on standard input closing, stops the run (Export) and exits zero. Built into a single Node 26 binary per platform; if a single executable cannot hold the bundle, ship the Node binary and the bundled JavaScript as resources instead. The standalone-http-host tickets (`.scratch/standalone-http-host/issues/`) want the same server and should reuse it.

- [ ] A Vitest suite for the Request-to-Response routing (API, product address, static file, fallback, Host refusal, missing or wrong secret).
- [ ] An integration test: start the binary on a temp copy of `packages/app/fixture`, commit an edit, close stdin, and the directory holds the edit.
- [ ] Which single-file form shipped, and why, recorded on this ticket.
