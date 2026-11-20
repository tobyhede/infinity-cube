# Fresh-reader questions: Storage and hosts

Written before drafting, from the sources at `d461223`. Each names the task, the expected answer and its evidence. Reading path: `AGENTS.md` table ("Change a repository, file format, Import, Export, Running, Mounting or HTTP host" → `docs/requirements/storage.md`), then ADRs newer than the marker.

## Q1 (ordinary task): a second run of one directory

**Task.** While testing, an agent starts `pnpm cube run --no-open` on a temp directory that another `pnpm cube run` (or the desktop application, or `infinity-cube run`) already serves. What happens, and what does the agent have to clean up afterwards?

**Expected answer.** The second run is refused with the kind `locked` before Import reads anything: `cube run` and `infinity-cube run` exit 1 naming the directory and saying to stop the other run (the sidecar announces the refusal; the desktop shell shows it in its refusal dialog). The lock is SQLite's exclusive lock on the empty file `.infinity-cube.lock` in the directory, taken with no busy timeout, held until the run's last write has landed or failed (and released when Import refuses the directory), and released by the operating system however the process ends, so nothing stale is left to clean up. The file is never deleted and is a dot-entry, so the directory still counts as empty and Import, `check` and Export never touch it; a content repository should ignore it. `check`, `mcp`, `init`, `import` and `export` take no lock.

**Evidence.** ADR 0162; Storage ST-124 (and ST-64, ST-66 as changed by it); `src/run/directory-lock.ts`, `crates/host/src/lock.rs`; `test/unit/run.test.ts` › "refuses a second run of a directory a run holds, and runs it once the first has stopped"; `test/integration/run-command.test.ts` › "refuses a second run of the directory a run holds, naming it, and runs it once the holder is killed".

## Q2 (crosses into Editing): a change sent from another site

**Task.** A web page on another origin sends a run's loopback listener a `POST /assets` with a `text/plain` body (a simple request, no preflight). What does the host answer, does anything get stored, and what does the browser session do with that answer if the product's own page ever receives it?

**Expected answer.** Both runtimes' HTTP applications refuse it before reading the body: 403 `forbidden`, Problem Details with type `urn:infinity-cube:problem:forbidden` and detail "Send a change from the application's own page.", when `Sec-Fetch-Site` is anything but `same-origin` or `none`, or when an `Origin` and a `Host` are named and the `Origin`'s host and port are not the `Host` (`Origin: null` included). Nothing is stored. A request with neither header (curl, the CLIs' tests, the MCP server) is served; a request naming no `Host` (the desktop scheme handler's) is not judged by its `Origin`. The browser transport reads `forbidden` as a permanent failure, not a retry (Editing owns what the session then shows).

**Evidence.** ADR 0161; Storage ST-123, ST-101/ST-102; `packages/http/src/index.ts` (`CROSS_SITE_CHANGE_DETAIL`); wire cases "answers 403 forbidden to a change sent with Sec-Fetch-Site: %s, changing nothing" and "answers 403 forbidden to a change whose Origin is %s, changing nothing" in `conformance/http/wire-cases.ts`; `persistence/src/http-protocol.ts` (`forbidden` classified permanent); editing.md for the session's outcome.

## Q3: a lone surrogate in a hand-written file

**Task.** An author's Resource file has `"title": "\ud800"`. What do `pnpm cube check` and `infinity-cube check` answer, and what does a commit body carrying the same escape get?

**Expected answer.** Both runtimes refuse the file as `invalid-json`, located at the file, exactly as for text that is not JSON (TypeScript reads every JSON text through `parseJsonText` in `core`; the Rust intake's reader cannot hold a lone surrogate). A commit body holding one is 400 `invalid-request` with the detail "Malformed JSON in request body" and no `errors`. The one difference kept between the runtimes is nesting deeper than 512 levels, which only the Rust side refuses.

**Evidence.** ADR 0160; Storage ST-22, ST-77, ST-118, ST-119; `core/test/json-text.test.ts`; corpus cases `conformance/intake/directory/invalid-json-lone-surrogate` and `invalid-json-lone-surrogate-key`; wire case "answers 400 invalid-request for a lone surrogate escape, as for malformed JSON".

## Baseline (existing reading path, before edits)

Run once against `storage.md` at `d461223` as it stood. Q1: found at ST-124 through the AGENTS.md row and the Running section; the doc did not say the lock is released when Import refuses the directory (ADR 0162 says so). Q2: found at ST-123; the forbidden-is-permanent half needs ST-101/ST-102 and editing.md, which the doc reaches. Q3: found at ST-22/ST-77/ST-118. No discovery failure; the gaps are wording, fixed in the draft. Also observed: the evidence citations for the HTTP conformance cases named test files that hold no titles (cases live in `conformance/http/` tables), and the doc's own path rule put `conformance/` under `packages/`.
