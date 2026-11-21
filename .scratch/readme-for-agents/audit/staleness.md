# README.md staleness audit (HEAD 17aab57)

Scope: every checkable claim in /home/claude/hyper/README.md (252 lines), checked against code, package.json scripts, AGENTS.md, ADRs 0155-0163, docs/requirements, docs/aggregate-directory.md, plugins/infinity-cube, .agents/skills. Read-only; no repo file edited.

## MISMATCHES

### M1. Line 45: "does not lock the directory" / "run InfinityCube twice on one directory ... next write replaces"  (HIGH)
- Claim: Running takes no lock; two runs of one directory both run and the last write wins.
- Evidence: ADR 0162 (accepted 2026-11-18) "Every host locks the Aggregate directory it runs"; `src/run/run.ts:337-338` (`lockDirectory`; `held` -> `{ kind: 'locked' }`); `src/run/directory-lock.ts:10` `LOCK_FILE_NAME = '.infinity-cube.lock'`; `src/cli/run-refusal.ts:10-11` prints "`<dir>` is open in another run of InfinityCube: stop that run before starting this one." and the run exits 1 (`src/cli/run-process.ts:77-79`); Storage ST-124, ST-66 ("Two runs of one directory are refused instead"); AGENTS.md Run paragraph.
- Fix: "InfinityCube keeps no history of its own and does not watch the directory for changes. A run locks the directory (a SQLite lock on the empty file `.infinity-cube.lock`, which the OS releases however the run ends), so a second run of the same directory — `pnpm cube run`, `infinity-cube run` or the desktop app — is refused, naming it. If you `git pull` or edit files while it runs, its next write replaces them; recover with git." Also suggest adding `.infinity-cube.lock` to the content repo's `.gitignore` (ADR 0162 "A content repository should ignore it"). Drop "or run InfinityCube twice on one directory".

### M2. Line 50: "A run with no edits leaves the directory byte-for-byte as it was."  (MEDIUM)
- Evidence: ST-64 "...byte-for-byte unchanged, beside the empty lock file it creates there (ST-124)"; `src/run/run.ts` doc comment ~line 309-312 "leaves the directory as it found it, beside the empty lock file"; ADR 0162 Consequences.
- Fix: "...byte-for-byte as it was, apart from the empty `.infinity-cube.lock` a run creates."

### M3. Line 50: "Opening a Space in the browser can itself be an edit: a Space that names no `defaultMap`, or a Meta Space with no Map, records one when it is first opened."  (MEDIUM)
- Evidence: Storage ST-65: "Opening a Space never writes the directory: under Running, the first working read's initialization (MG-74) does not trigger an Export ... the next Edit's Export writes it; a run that ends with no Edit leaves the directory as it was, so the next run initializes again." Also MG-76/MG-81 (first working read is "not an Edit: a commit by the loader").
- Fix: "Opening a Space never writes the directory by itself. A Space that names no `defaultMap`, or a Meta Space with no Map, is given one in memory when first opened; it reaches the directory with your next edit." (Note: the same stale claim is in `plugins/infinity-cube/skills/infinity-cube-authoring/SKILL.md:49` — out of README scope but worth fixing together.)

### M4. Line 111: "Several Graphs through one pair of Resources therefore draw between the same two points, told apart by colour."  (MEDIUM)
- Evidence: Rendering RD-37 "Where several Edges join the same two Resources ... each is drawn in its own lane ... Lanes are parallel"; RD-38 (ranked, shorter lengths), RD-39, RD-85 (both-way pairs), RD-86 (self-Edges nest); built, `react-flow-adapter/test/edge-lanes.test.ts`, `app/e2e/edge-attachment.spec.ts`.
- Fix: "Several Graphs through one pair of Resources draw as parallel lanes between the same two anchors: the Active Graph's Edge on the centre line at full length, the others stacked beside it and ranked shorter."

### M5. Line 249: "every Edge is the bezier React Flow draws, so a backward one curls back on itself."  (LOW)
- Evidence: RD-32 still says nothing routes an Edge, but each is "React Flow's bezier between its two anchors (offset when in a lane, RD-41)"; RD-41 lanes follow the curve at an offset.
- Fix: "...every Edge is React Flow's bezier (offset into a lane where several share a pair), so a backward one curls back on itself."

### M6. Line 223: "Switching Graphs changes emphasis, not visibility or placement."  (LOW)
- Evidence: RD-39 "Activating another Graph moves the lanes, bringing its Edges to the centre"; RD-38 lengths re-rank.
- Fix: "Switching Graphs changes emphasis and which Edges take the centre lane, never visibility or Resource placement."

### M7. Line 215: plugin list "(`ur`, `image`, `markdown`, `reference`, `space`, and `default` ...)"  (HIGH)
- Evidence: `packages/plugin-mermaid/` exists (`packages/plugin-mermaid/package.json:2`), listed in `packages/plugins/package.json:18`, ADR 0158; AGENTS.md package list.
- Fix: add `mermaid`: "(`ur`, `image`, `markdown`, `mermaid`, `reference`, `space`, and `default` ...)".

### M8. Lines 205-219: package table omits `@project/desktop` and the Cargo workspace  (HIGH)
- Evidence: `ls packages` = 18 packages incl. `desktop` (Tauri shell, ADR 0155); `Cargo.toml:3-9` members `crates/intake`, `crates/host`, `crates/http-conformance`, `crates/cli`, `packages/desktop/src-tauri`; AGENTS.md "Eighteen `@project/*` workspace packages ... and a Cargo workspace at the root". Line 205 "A pnpm workspace with strict TypeScript" is now incomplete.
- Fix: add a `@project/desktop` row (Tauri desktop app serving the Rust host through the `infinitycube` URI scheme) and a short Rust table: `crates/intake` (Rust intake, ADR 0156), `crates/host` (Rust host library), `crates/cli` (`infinity-cube` binary), `crates/http-conformance` (shared HTTP conformance cases). Change line 205 to "A pnpm workspace and a Cargo workspace ...".

### M9. Line 235: "Reading and writing an Aggregate directory is server-side: the `cube` CLI's `init`, `run`, `import` and `export`." and "It lists, opens and commits Spaces over HTTP and nothing else."  (MEDIUM)
- Evidence: `src/cli/arguments.ts` VERB_LINES also has `check` and `mcp` (both read/write directories); Rust `infinity-cube run|check` (ST-120), desktop shell (ST-121) and Node desktop sidecar (ST-113) all read/write directories; Mounting reads an aggregate from GitHub into an in-browser store (ST-1 "Mounting is the one exception (ST-86)", ST-85). The browser also stores assets (`POST /assets`, ST-74/75).
- Fix: "Outside Mounting, the browser never touches files: it lists, opens and commits Spaces and stores assets over HTTP. Reading and writing an Aggregate directory belongs to the hosts: `pnpm cube` (`init`, `run`, `check`, `mcp`, `import`, `export`), the Rust `infinity-cube` CLI and the desktop application. A mounted page (`pnpm build:mount`) reads an aggregate from GitHub into a store inside the page."

### M10. Line 116: "pnpm verify # typecheck + lint + prettier check + unit/property tests"  (LOW)
- Evidence: `package.json` `verify:static` = typecheck:toolchain, typecheck, typecheck:packages, ui:catalog:check, lint, lint:anti-slop, format:check; `verify` = verify:static + test:coverage.
- Fix: "# toolchain check, both typechecks, UI catalog check, ESLint + oxlint anti-slop, prettier check, tests with coverage". Optionally mention `pnpm verify:local` and that CI runs it as `verify:static` + `test:coverage`.

### M11. Line 3: "You write **Resources** (Markdown, pictures, or whole nested Spaces)"  (LOW)
- Evidence: plugin kinds also include Mermaid diagrams (ADR 0158), Reference and Ur (`packages/plugins`).
- Fix: "(Markdown, Mermaid diagrams, pictures, references to other Resources, or whole nested Spaces)".

### M12. Lines 48-49: only Markdown text and pictures named as `assets/` content  (LOW)
- Evidence: `docs/aggregate-directory.md:131` Mermaid `url: /assets/<hash>`, written as `<hash>.mmd`; ST-112.
- Fix: add "A Mermaid Resource's source is written to `assets/` the same way, as `<hash>.mmd`."

### M13. Line 212: `@project/http` "the Hono `/api` route tree"  (LOW, wording)
- Evidence: AGENTS.md "the Hono `/api/spaces` route tree ... and the inferred `SpaceHttpApp` client contract"; ST-74 API also has `/api/aggregate` and `/assets`.
- Fix: "the Hono route tree (`/api/spaces`, `/api/aggregate`, `/assets`), its request and response policy and the inferred `SpaceHttpApp` client contract."

### M14. Line 218: `@project/ui` "framework-agnostic React"  (LOW, wording)
- Evidence: AGENTS.md calls it "presentation-agnostic"; it also owns `StatusPanel`, `CommandSurface`/`ChoiceMenu`, `MarkdownSourceEditor` (the one CodeMirror user, `packages/ui/package.json:25-34`).
- Fix: "Reusable, presentation-agnostic React ... and `MarkdownSourceEditor`, the one component that knows CodeMirror."

### M15. Line 252: bundle sizes  (LOW / likely stale)
- Claim: entry ~1.2 MB (381 kB gz), ~106 kB CSS, MarkdownSourceEditor ~623 kB.
- Evidence: not measurable here (no node_modules, no build). Since that measurement the Mermaid plugin landed and fetches the `mermaid` library on first draw (AGENTS.md plugin-mermaid; `packages/plugin-mermaid/package.json:16`), so there is at least one further lazily fetched chunk the sentence does not mention.
- Fix: remeasure with `pnpm build`, and mention the Mermaid chunk fetched on first diagram draw.

## CLAIMS CHECKED AND CORRECT (summary)
- L5/L27 presenting: fullscreen asked, refusal tolerated (NV-58); largest 16:9 frame letterboxed (NV-63); Right/Left/Up/Down/Escape keys (NV-65, NV-91).
- L11/L98 Node >= 26.8.1, pnpm 9 (`package.json` engines, packageManager pnpm@9.15.0).
- L18/L24 `init` refuses non-empty dirs, dot-entries ignored, prints "Created a new aggregate; run it with: pnpm cube run <dir>" (`src/cli/run.ts:48-50`).
- L24/L51 default port 4173 (`src/cli/run-process.ts:25`), next free unless `--port` (strictPort when given, `run-process.ts:38`); `--no-open`.
- L37 relative dirs resolve against invocation dir (`src/cli/run.ts` `resolve(workingDirectory, ...)`; ST-72).
- L44 quiet period ~1 s (`src/run/run.ts:29` `RUN_QUIET_MILLISECONDS = 1_000`); SIGINT/SIGTERM/SIGHUP (`src/cli/run-launcher.ts:22`); second signal exits at once (`run-process.ts:50-58`, `run-lifecycle.ts:32-34`).
- L46 strings exist verbatim: "Could not write the directory:" (`src/cli/run-lifecycle.ts:17`), "Stopped, but the last edits were not written:" (`run-lifecycle.ts:50`, exit 1 at :52), "Stopped; ${directory} holds every edit." (`run-process.ts:109`); retry after same 1 s period (`run.ts:26-29, 299-301`); symlink refusal (`src/aggregate-directory/write-in-place.ts:13,25`; ST-57).
- L47-49 Export writes only Import's files in place (aggregate-directory.md:177-185).
- L48 `.md` in `resources/` or beside `space.json` left alone (aggregate-directory.md:139).
- L50 missing/empty refused naming `pnpm cube init` (`run-refusal.ts:8`); invalid dir refused with problems (ST-67).
- L61-66 four skills; two symlinked from `plugins/infinity-cube/skills/`; `.claude/skills/` links all four.
- L70 three manifests exist and are held equal by `test/unit/skills-marketplace.test.ts:20-25` (all at 0.1.8).
- L90 `infinity-cube-authoring` links by absolute URL (AGENTS.md; `test/unit/agent-skill-commands.test.ts`).
- L102-104 ports 5173/5174/5175 (`packages/app/package.json`); L166 5177 and default `.scratch/sqlite/infinity-cube.db` (`scripts/dev-sqlite.ts`, AGENTS.md).
- L107 indicator labels "Saving changes" / "Persisted" (`packages/ui/src/PersistenceIndicator.tsx:41-42`).
- L109 Copy link in the Dock menus and the presenting chrome (UI-20/22, NV-28, NV-64).
- L117-121 e2e projects `chromium` and `new-space` (`playwright.config.ts:40,45`; `e2e:fixture` = `--project=chromium`).
- L136/L139 port 55432 and PostgreSQL 17.5 (`compose.yaml:3,9`, `.env.example`).
- L152-153 `contract:emit`, `db:migrate` scripts exist.
- L170 `openSqliteRepository` (`test/support/sqlite-harness`, used by `test/integration/sqlite-contention.test.ts:15`); `prisma-next.config.sqlite.ts` omits `db` when `SQLITE_PATH` unset.
- L172 "SQLITE_PATH must be an absolute path" (`src/sqlite/db.ts:93`); missing/unwritable parent and nonexistent file refused (`db.ts:30-39, 95-97`).
- L174 5 s busy timeout and 503 `persistence-unavailable` (`test/integration/sqlite-contention.test.ts:48-49, 440-476`).
- L183-200 import/export verbs, `--store`, `--dangerous-replace` (`src/cli/arguments.ts`).
- L223 `buildGraphRenderEdges`, `buildLayoutStrategyGraph` (`packages/graph/src/graph-rendering.ts`), `projectResourceNodes`, `projectGraphEdges` (`packages/react-flow-adapter/src/projection.ts`), `edge-attachment.ts` exists.
- L231 `gridStrategy`/`positionedStrategy` in `@project/graph`; no `packages/app/src` reference to `gridStrategy`.
- L250 `COLLAPSED_RESOURCE_SIZE = { width: 260, height: 146 }` in `packages/core/src/resource-geometry.ts:5`; only Ur takes a Shape (MG-30).
- L243 `test/integration/run-command.test.ts` exists; L174 `test/integration/sqlite-contention.test.ts` exists.

## COULD NOT VERIFY
- L14, L75, L84 repository slug `tobyhede/infinity-cube`. The local `origin` is `https://github.com/tobyhede/hyper`, but `plugins/infinity-cube/plugin.json` `homepage` and `src/mcp/aggregate-mcp-server.ts:19` both use `tobyhede/infinity-cube`, and the GitHub REST API answered `repos/tobyhede/hyper` with a redirect to a numeric repository id (the pattern of a renamed repo), suggesting `infinity-cube` is the current name. API access to `tobyhede/infinity-cube` itself was not enabled for this session. Probably correct; confirm.
- L70, L79, L84-88 Claude Code / Codex plugin CLI commands and "both products install at user scope" (external products).
- L170 `PN-CLI-4005` error code (in `prisma-next`, node_modules not installed).
- L176 `journal_mode=delete`, `synchronous=FULL`, no WAL: nothing in `src/sqlite/` sets a pragma, so this rests on the driver's defaults (`@prisma-next/driver-sqlite`), not inspectable without node_modules.
- L252 bundle sizes (no build possible).
- L147 "performs a typed space/resource JSONB write and read": true of `test/integration/postgres-space-repository.test.ts`, but `vitest.integration.config.ts` runs every non-`sqlite-*` integration file (CLI, HTTP runtime, run-command, desktop-sidecar, http-conformance ...), so the sentence understates it.
- L26 fine UI details (Command Dock, toolbar Edit) — consistent with ui.md as far as checked, not exhaustively.

## OMISSIONS (in the code, absent from the README)
1. `pnpm cube check <dir>` (ST-110) — mentioned only in passing at L90; no description of what it does or exits.
2. `pnpm cube mcp <dir>` stdio MCP server (ST-111/112, `src/mcp/aggregate-mcp-server.ts`; start with `pnpm --silent`).
3. `pnpm cube help` and the usage-error exit 2 (ST-68).
4. The directory lock and `.infinity-cube.lock` (ADR 0162, ST-124) — and advice to gitignore it.
5. The Rust CLI `infinity-cube run|check` (`crates/cli`, ST-120): build with `cargo build -p infinity-cube`, embedding the web build via `INFINITY_CUBE_BUILT_APPLICATION`, `--built <dir>`, JSON announcement line, `Host` check.
6. The desktop application (`packages/desktop`, Tauri, ADR 0155, ST-121/122): per-talk `infinitycube://` origin, close waits ten seconds then asks (ADR 0163), `pnpm --filter @project/desktop tauri build`.
7. The Node desktop sidecar (`pnpm desktop-sidecar:build`, ST-113-116).
8. Mounting / static build: `pnpm build:mount`, `VITE_DEFAULT_SPACE_SOURCE`, `github:owner/repo@ref/path` source, `pnpm e2e:mount` (ST-85-98).
9. Mermaid Resources (ADR 0158) — kind, `.mmd` assets.
10. Rust checks (`cargo fmt/clippy/test --doc/nextest`) and the `rust` CI job; the Cargo workspace generally.
11. Other test commands: `pnpm e2e:ladle`, `pnpm e2e:mount`, `pnpm e2e:postgres`, `pnpm e2e:sqlite`, `pnpm verify:local`, mutation testing (`pnpm mutate:*`), and the conformance suites (`conformance/intake/`, `conformance/http/`).
12. `pnpm dev:roadmap` (port 5176) in the dev-server list.
13. "Before claiming done" CI model (draft PR, `CI passed` gate) — AGENTS.md covers it; README defers to AGENTS.md, so optional.
14. Note: ADR 0157 (WebKit joins Chromium in CI) is accepted but `playwright.config.ts` still has only Chromium projects, so README's "Chromium" (L121) matches the code today; it will go stale when WebKit lands.
