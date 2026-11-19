# Both hosts refuse a cross-site change

Status: accepted
Date: 2026-11-18
Related: 0034, 0142, 0155

A run serves its application on a loopback listener, `127.0.0.1:4173` or the next free port, and any web page open in the same browser can send that listener a request. A browser sends a cross-site `POST` with a body such as `text/plain` as a simple request, with no preflight, so the host answers it and only the page is kept from reading the answer. `POST /assets` admits any media type (ADR 0142) and checked neither `Origin` nor anything else a browser says about where a request came from; the Rust CLI's `Host` check passes, because the browser names the listener's own host. A hostile page could store 10 MiB per request in a run's memory store, which keeps every asset it is given, in a loop. A commit needs `application/json`, which a browser sends cross-site only after a preflight no host grants, so commits were not exposed. The maintainer decided on 18 November 2026 that both hosts refuse a change another site sends.

## The decision

- **One rule, in the shared HTTP application of each runtime.** `@project/http`'s Fetch application and `crates/host`'s `Application` judge every request to the Space API and the asset store whose method is neither `GET` nor `HEAD`, before its body is read:
  - a request naming `Sec-Fetch-Site` with any value but `same-origin` or `none` is refused;
  - otherwise, a request naming an `Origin` and a `Host` is refused when the `Origin`'s host and port are not that `Host`; an `Origin` of `null` names no host and is refused;
  - a request naming neither header is served, as before: curl, the CLIs' own tests and the MCP server send neither.
- **A request naming no `Host` is not judged by its `Origin`.** The desktop shell hands the application the requests its scheme handler has already admitted, by the talk's own window and page (Storage ST-121), and they name no `Host` for an `Origin` to be judged against. The first arm still applies to them.
- **The refusal is 403 `forbidden`.** Both runtimes answer it as Problem Details with type `urn:infinity-cube:problem:forbidden`, title "Forbidden", status 403 and the detail "Send a change from the application's own page.", under the API's `Cache-Control: no-store`. The browser transport already reads `forbidden` as a permanent failure.
- **The conformance suite holds both runtimes to it.** `conformance/http/wire-cases.ts` sends changes naming another site by each header and changes from the host's own origin, and `crates/host/tests/wire.rs` and the desktop scheme handler's tests port them.
- **The memory store's asset count stays uncapped.** A same-origin page is the product itself, which stores what its author adds.

## Why

- **The browser says where a change comes from.** `Sec-Fetch-Site` is set by the browser and no page can forge it; a browser that does not send it sends `Origin` on every cross-origin `POST`. Between them a host can tell its own page from any other without a token the page would have to carry.
- **The page the product serves still passes.** The Vite development hosts and `cube run` serve the page and the API from one origin and pass `Host` through unchanged, as does the Rust CLI's listener, so a page's change names `same-origin` and its own `Host`. The desktop scheme is judged by its handler, and its requests name no `Host`.
- **A request with neither header is no browser's.** Refusing it would refuse the tools that drive a host directly and gain nothing a page can reach.

## Rejected

- **Refusing a request that names neither header.** No browser sends a cross-site change without one of them, and the CLI tests, curl and the MCP server would all need to forge one.
- **A cap on the number of assets.** It stops the loop only after the memory is spent, and the product's own page would hit it first.
- **Requiring a media type for `POST /assets`, to force a preflight.** An asset's media type is its own, any type is admitted (ADR 0142), and a preflight would cost every upload a round trip.

## Consequences

- Storage ST-123 restates the rule.
- A change the product's page sends from another origin, through a proxy that rewrites `Host` for example, is refused; no host InfinityCube ships does that.
- Product addresses and the shell, which answer a write 405, are not judged by the rule.
