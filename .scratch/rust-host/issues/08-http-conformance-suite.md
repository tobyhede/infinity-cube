# 08 — An HTTP conformance suite, run against the production Node host

**Status:** ready-for-agent

**Blocked by:** 02, 03.

**What to build:** Black-box tests that drive a host only through HTTP, given a base URL and a fixture directory: every route (`GET`/`POST /api/spaces`, `GET /api/spaces/:id`, `GET /api/aggregate`, `POST /assets`, `GET /assets/:hash`), unknown `/api` paths, the product addresses (`/` redirect, `/spaces/…` 400/404/405, fallthrough to the shell), body limits (1 MiB commit, 10 MiB asset), the transport policy headers, Problem Details codes, and Export on quiet and on stop (the directory's contents after a commit and after SIGINT). Run it against the production Node host (03) on a temp copy of the fixture, the host every later one is held to.

- [ ] Suite takes the host command as a parameter, so 12 can run it against the Rust binary unchanged.
- [ ] Every status in `COMMIT_OUTCOME_WIRE` and every product status reached by at least one case.
- [ ] Green against the TypeScript host in CI.
