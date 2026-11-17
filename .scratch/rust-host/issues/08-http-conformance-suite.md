# 08 — An HTTP conformance suite, run against the production Node host

**Status:** ready-for-agent

**Blocked by:** 02, 03.

**What to build:** Black-box tests that drive a host only through HTTP, given a base URL and a fixture directory: every route (`GET`/`POST /api/spaces`, `GET /api/spaces/:id`, `GET /api/aggregate`, `POST /assets`, `GET /assets/:hash`), unknown `/api` paths, the product addresses (`/` redirect, `/spaces/…` 400/404/405, fallthrough to the shell), body limits (1 MiB commit, 10 MiB asset), the transport policy headers, Problem Details codes, and Export on quiet and on stop (the directory's contents after a commit and after SIGINT, byte-for-byte as the TypeScript Export writes them, 07). Run it against the production Node host (03) on a temp copy of the fixture, the host every later one is held to.

No black-box suite exists today: the contract is tested in process. Lift those cases into a harness that takes a base URL, and cite the sources of truth each case is checked against: `packages/http/src/index.ts` (routes, limits, policy headers), `packages/persistence/src/http-protocol.ts` (`COMMIT_OUTCOME_WIRE`, Problem Details), `packages/http/src/product-destination.ts` and `packages/aggregate/src/space-host.ts` (product addresses), `packages/persistence/src/assets.ts` (asset hashing), `packages/aggregate/src/memory-space-repository.ts` (the memory store's answers), `src/run/run.ts` and `src/cli/run-process.ts` (Export on quiet and on stop). For the single-page fallback, static files and the transport around them, the reference is the production Node host's handler, `src/desktop/desktop-handler.ts`.

**Getting past the lock.** The Node host refuses a request whose `Host` is not `127.0.0.1:<port>` and one without its session cookie. The harness reads the host's announcement line (03), sends every request with that `Host`, presents `/?launch=<secret>` once and holds the cookie it is given. A host with no lock (the Rust CLI, 12) is driven the same way, with its own announcement; the lock's own cases (wrong `Host`, no cookie, wrong secret) run only against a host that has one.

**ST-65 at the wire.** A case opens a Space that has no Map (`GET /api/spaces/:id`, which initializes it, MG-74), stops the host, and finds the directory byte-for-byte unchanged; then a commit, a stop, and the initialization is written. The TypeScript host meets this with Node-only machinery (`AsyncLocalStorage` and a wrapped `host.fetch` in `src/run/run.ts`), so the Rust host (11) needs its own explicit read context on a commit; this case is what holds it.

- [ ] Suite takes the host command as a parameter, so 12 can run it against the Rust binary unchanged; its body-limit, header, redirect and fallback cases can also be given a `Request -> Response` function instead of a base URL, so 13 can run them against the scheme handler.
- [ ] Every status in `COMMIT_OUTCOME_WIRE` and every product status reached by at least one case.
- [ ] The ST-65 case above, and the Host and cookie cases against the Node host.
- [ ] Green against the TypeScript host in CI.
