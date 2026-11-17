# 19 — The development and test hosts on the Rust binary

**Status:** needs-triage

**Blocked by:** 16.

**What to build:** `pnpm dev` (PostgreSQL), `pnpm dev:new` and `pnpm dev:fixture` (memory), `pnpm dev:roadmap`, `pnpm dev:sqlite`, and the hosts the Playwright suites start (`pnpm e2e`, `pnpm e2e:postgres`, `pnpm e2e:sqlite`) served by the Rust binary, with Vite serving only the browser application's assets in development. The `.scratch/standalone-http-host/` tickets move these hosts onto the production Node host (03) first (spec, decision 12); this ticket moves them from it to Rust. Each script keeps its port and `--strictPort` behaviour, and each e2e test still owns a fresh host and store.

- [ ] Every `dev:*` script and every Playwright config starts the Rust binary; `pnpm e2e`, `pnpm e2e:postgres` and `pnpm e2e:sqlite` green in CI against it.
- [ ] The HTTP conformance suite (08) green against each store the scripts use.
- [ ] The `AGENTS.md` Commands and E2E sections and the Storage requirements describe the Rust hosts.
