# HTTP conformance suite

Black-box tests that hold a host to the HTTP contract the browser application speaks (ADR 0155, ADR 0156): every route, every commit outcome, the product addresses, body limits, transport policy headers, the single-page fallback, the `Host` check and launch lock, and the directory a host leaves behind after an edit. A host passes by answering the same as the production Node host (`src/desktop/`), which is the reference every other host is held to.

The suite is written in TypeScript and runs under Vitest, but a host under test is reached only through HTTP, its standard streams and signals, so a host written in any language can be held to it. The contract below is what such a host must keep.

## Running it

| Against | Command | CI job |
| --- | --- | --- |
| The production Node host, as a process | `pnpm exec vitest run --config vitest.integration.config.ts test/integration/http-conformance.test.ts` | `postgres` (which runs every integration file not named `sqlite-*`; this one needs no database) |
| The production Node host's handler, as a `Request -> Response` function | `pnpm exec vitest run test/unit/http-conformance-handler.test.ts` | `coverage` |
| Another host process | the first command, with `INFINITY_CUBE_HTTP_CONFORMANCE_HOST` set (below) | — |

`INFINITY_CUBE_HTTP_CONFORMANCE_HOST` is JSON naming the host command: `{ "name": string, "argv": string[], "cwd"?: string, "stopsOnStdinClose": boolean, "keepsLock"?: boolean }`, where `keepsLock` (false when absent) says the host keeps the launch lock. For example, a host binary that takes its port and keeps no stdin protocol:

```json
{
  "name": "Rust CLI",
  "argv": ["target/release/infinity-cube", "run", "{directory}", "--port", "{port}", "--no-open"],
  "stopsOnStdinClose": false
}
```

## The host-command contract

**Invocation.** The suite starts the host as `argv`, after replacing three placeholders in any argument:

- `{directory}`: the Aggregate directory to run, always a temporary copy of `packages/app/fixture` (or a variant of it), never a tracked directory.
- `{port}`: a loopback port the suite found free. The suite closes it before starting the host, so another process can take it in between; a host that then cannot bind it fails the case rather than passing it. A host that picks its own port need not take it.
- `{built}`: a directory holding the suite's stand-in build (`index.html`, `assets/index-c0nf0rm4.js`, `favicon.svg`). A host that takes it serves that directory as its built application, and the suite checks which files it serves byte for byte. A host that does not take it carries its own build; the suite then checks only the shell's transport, not its files.

**Announcement.** Every conforming host writes one line to standard output once it can be reached, or once it knows it cannot run the directory, as JSON in the shape the desktop sidecar writes (`src/desktop/announcement.ts`; `test/unit/http-conformance-host-process.test.ts` reads every sidecar announcement through the suite's reader). The suite reads no other form, so the host's announcement is part of the contract, not something a caller adapts (the Rust CLI's is required by `.scratch/rust-host/issues/12-rust-cli-run-and-check.md`):

- `{"kind":"listening","port":<1–65535>}`, or with `"secret":<non-empty string>` for a host that keeps the launch lock;
- `{"kind":"refused","message":<string>}`, after which the host exits non-zero.

Lines before the announcement that do not parse as one are skipped, and a host whose standard output ends without an announcement has refused. A host that has neither announced nor exited 30 seconds after it was started fails the case and is killed, as is a host that cannot be spawned or has not traded its own launch secret 30 seconds after announcing it.

**Listening.** The host answers on `127.0.0.1:<port>` and nowhere else.

**The `Host` check.** Every host refuses a request whose `Host` header is not exactly `127.0.0.1:<port>` with **421**, before anything else, so a page reached through DNS rebinding cannot use it (Storage ST-114).

**The launch lock** (a host that announces a `secret`). `GET /?launch=<secret>` answers **302** to `/` with `Set-Cookie: <name>=<value>; HttpOnly; SameSite=Strict; Path=/`, where `<name>` carries the port; any other secret is **403** and sets no cookie. Every other request without that cookie is **403**. The 421 and 403 refusals are `text/plain` with `Cache-Control: no-store`. The suite presents the secret once at start and sends the cookie with every request after it. A host with no secret is not locked, and the cookie cases are skipped for it, unless its command declares `keepsLock`: they then fail it.

**Stopping.** On **SIGINT** the host stops serving, writes any edit not yet on disk, and exits **zero** (non-zero only if that write failed). If the command declares `stopsOnStdinClose`, closing the host's standard input stops it the same way (the desktop shell's protocol, ST-116). A host the suite has finished with is killed.

**Export.** After an accepted commit the host writes the directory once edits have been quiet for about a second, and on stop; the directory is still unchanged when the commit is answered and a quarter of a second later. What it writes is held byte for byte to what the TypeScript Export writes for the same edit. A read never writes, even one that initializes a Space (ST-65), so a second run on a directory the first left unchanged initializes that Space again.

**Bodies.** A commit body is measured as it arrives, never by a declared length: one sent chunked, declaring no length, is read and committed, and one over 1 MiB is **413** `payload-too-large` and commits nothing. A length declared larger than the body sent has no case over the wire, where the host would wait for the rest; `packages/http/test/space-http-app.test.ts` holds it for the Fetch application.

## The cases, and what each is checked against

| Group | File | Runs against | Sources of truth |
| --- | --- | --- | --- |
| Routes, commits, assets, product addresses, the shell | `wire-cases.ts` | a process, or a `Request -> Response` function | `packages/http/src/index.ts` (routes, limits, policy headers), `packages/persistence/src/http-protocol.ts` (`COMMIT_OUTCOME_WIRE`, `problemCatalogue`, the browser's decoders), `packages/persistence/src/commit-decision.ts`, `packages/persistence/src/assets.ts` (hashing, served media types), `packages/http/src/product-destination.ts` and `packages/aggregate/src/space-host.ts` (product addresses), `packages/aggregate/src/memory-space-repository.ts`, `src/desktop/desktop-handler.ts` and `src/desktop/static-files.ts` (fallback, built files) |
| A store that cannot serve | `store-condition-cases.ts` | a `Request -> Response` function opened over such a store | `packages/aggregate/src/space-host.ts`, `storedFailureProblem` in `packages/http/src/index.ts`, `classifyStoredFailure` in `packages/persistence/src/repository.ts` |
| The `Host` check, the lock, refusal, a chunked body, Export on quiet and on stop, ST-65 | `process-cases.ts` | a process | `src/desktop/desktop-handler.ts`, `MAX_COMMIT_BODY_BYTES` in `packages/http/src/index.ts`, `src/desktop/desktop-process.ts`, `src/run/run.ts`, `src/cli/run-process.ts`, `src/export/` (through `export-oracle.ts`) |

Every status in `COMMIT_OUTCOME_WIRE` (200, 409, 422) and every status a product address answers (`ProductResponse`: 302, 400, 404, 405, 500, 503) is reached by a case. A run over a directory always holds a valid aggregate, so 500 and 503 are reached only through the store-condition cases. A path under `/assets/` that names no built file goes to the Fetch application, which answers it 400 `invalid-asset-hash` (ST-115, ST-76).

**Running the wire cases on a function.** `describeWireConformance({ name, open, builtApplication })` takes an `open` that answers a `ConformanceHost` — an `origin` and an `exchange: (request: Request) => Promise<Response>` already past any lock — over a fresh copy of the fixture. `describeStoreConditionConformance({ name, open })` takes an `open(condition)` for the conditions `uninitialized`, `unavailable` and `broken-stored-state`. `test/unit/http-conformance-handler.test.ts` composes both over the desktop handler.

## Export bytes: the oracle

`export-oracle.ts` answers, for the directory a host was started on and the edit it was sent, the files the directory should hold afterwards: it runs the same edit through an in-process TypeScript run of a copy and stops it, so the expected bytes are exactly what the TypeScript Export writes. The production Node host runs that same code, so against it the Export cases catch a missing or mistimed write, not wrong bytes; against another host they hold its bytes to the TypeScript Export's.
