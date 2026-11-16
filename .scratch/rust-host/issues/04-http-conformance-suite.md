# 04 — An HTTP conformance suite, run against the TypeScript Running host

**Status:** ready-for-agent

**Blocked by:** 02.

**What to build:** Black-box tests that drive a host only through HTTP, given a base URL and a fixture directory: every route (`GET`/`POST /api/spaces`, `GET /api/spaces/:id`, `GET /api/aggregate`, `POST /assets`, `GET /assets/:hash`), unknown `/api` paths, the product addresses (`/` redirect, `/spaces/…` 400/404/405, fallthrough to the shell), body limits (1 MiB commit, 10 MiB asset), the transport policy headers, Problem Details codes, and Export on quiet and on stop (the directory's contents after a commit and after SIGINT). Run it against `pnpm cube run --no-open` on a temp copy of the fixture, as `test/integration/run-command.test.ts` does.

- [ ] Suite takes the host command as a parameter, so 08 can run it against the Rust binary unchanged.
- [ ] Every status in `COMMIT_OUTCOME_WIRE` and every product status reached by at least one case.
- [ ] Green against the TypeScript host in CI.
