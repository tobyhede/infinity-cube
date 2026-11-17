# 03 — A production Node host, with no Vite

**Status:** ready-for-agent

**Blocked by:** 02.

**What to build:** A Node entry that composes a run (`startRun`, `src/run/run.ts`) and serves it with `@hono/node-server`: the Fetch application, product addresses through `resolveProductRequest` before the shell (routing as `packages/app/vite-space-http-plugin.ts` does today), the built `vite build` output, and `index.html` as the single-page fallback, with a Content Security Policy adapted from `packages/app/mount-headers.ts`. Locked down for a desktop sidecar (ADR 0155): binds `127.0.0.1` on a port the OS picks; refuses a request whose `Host` is not `127.0.0.1:<port>`; requires a secret minted at launch, presented once as `/?launch=<secret>` and traded for an `HttpOnly`, `SameSite=Strict` cookie by a redirect, after which every request needs the cookie (decided 17 November 2026); prints one JSON line `{ "port", "secret" }` on standard output once listening; on standard input closing, stops the run (Export) and exits zero. Built into a single Node 26 binary per platform; if a single executable cannot hold the bundle, ship the Node binary and the bundled JavaScript as resources instead. The standalone-http-host tickets (`.scratch/standalone-http-host/issues/`) want the same server and should reuse it.

- [ ] A Vitest suite for the Request-to-Response routing (API, product address, static file, fallback, Host refusal, missing or wrong secret).
- [ ] An integration test: start the binary on a temp copy of `packages/app/fixture`, commit an edit, close stdin, and the directory holds the edit.
- [ ] Which single-file form shipped, and why, recorded on this ticket.

## Comments

**2026-11-17 (progress).** Built in `src/desktop/`: `desktop-handler.ts` (the Fetch function: Host check, launch secret traded for the cookie, API, product addresses, built files, page fallback with its CSP), `static-files.ts` (built files under a root, never outside it; the desktop CSP), `desktop-process.ts` (the sidecar) and `announcement.ts` (its one stdout line). `pnpm desktop-sidecar:build` bundles it to one 377 kB ES module. Checked: `test/unit/desktop-handler.test.ts` (10 cases) and `test/integration/desktop-sidecar.test.ts` (an edit written on stdin close, exit 0; a refusal announced, exit 1). By hand: the bundle served `packages/app/dist` and the fixture to headless Chromium with no console errors or CSP violations.

**Single-file form:** a Node 26.8.1 single executable application holds the bundle as an ES module (`node --build-sea` with `"mainFormat": "module"`), 151 MB on Linux x64, and ran the same edit-and-stop check. Shipping that, built per platform, rather than the Node binary beside the JavaScript. The built application directory still ships beside it as a resource.
