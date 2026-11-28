# AGENTS.md

Instructions for AI coding agents working in this repo.

InfinityCube is a local prototype for graph-native technical presentations: Resources on authored Maps, connected into directed Graphs and presented by traversal.

## Read before changing an area

Accepted ADRs in [`docs/adr/`](docs/adr/README.md) are binding and append-only. The seven docs in [`docs/requirements/`](docs/requirements/) restate them in current words as a snapshot: [`snapshot.lock.json`](docs/requirements/snapshot.lock.json) records which ADRs they restate, and an accepted ADR that `python3 scripts/adr_snapshot.py check` lists as pending binds where the two differ (ADR 0175); a proposed one binds nothing. Read [`CONTEXT.md`](CONTEXT.md) for names, then the owning doc below, then any ADR that `python3 scripts/adr_snapshot.py check` lists as pending, before the code. A requirement that disagrees with an accepted ADR is a defect in the requirement. Status in a doc distinguishes the requirement from what is built; code does not override either. A behaviour change updates its owning doc in the same commit, and a new or changed decision is a new ADR, which edits no requirements doc: the next refresh folds it in ([Workflow](docs/agents/workflow.md#adrs-and-the-requirements-snapshot)). [`docs/adr/archive/`](docs/adr/archive/) holds only the retired product guides, kept as history.

| Task | Read |
| --- | --- |
| Name a concept; change a kind, Title, Resource reference, Space lifetime or intake | [Space and Resources](docs/requirements/space-and-resources.md), [CONTEXT.md](CONTEXT.md) |
| Add a Resource kind, change the plugin list, or change what a plugin draws or authors inside its rect | [Space and Resources](docs/requirements/space-and-resources.md), [Rendering](docs/requirements/rendering.md) |
| Add, delete, select or default a Map; activate or reorder Graphs; change membership, Open, Close, Resize, displacement or layout | [Maps and Graphs](docs/requirements/maps-and-graphs.md) |
| Change an Edit, completion outcome, refusal order, draft, replacement, save, recovery or Undo | [Editing](docs/requirements/editing.md) |
| Change a repository, file format, Import, Export, Running, Mounting or HTTP host | [Storage and hosts](docs/requirements/storage.md) |
| Change the canvas projection, drawn Map, camera, handles, Edge gesture or Open content | [Rendering](docs/requirements/rendering.md) |
| Change a control, menu, editor, key, focus, announcement, confirmation or notice | [UI](docs/requirements/ui.md) |
| Change selection, Graph navigation, product URLs, browser history, Open Spaces or presenting | [Navigation](docs/requirements/navigation.md) |
| Record a decision, or change what an accepted ADR decides | [Workflow](docs/agents/workflow.md#when-to-write-an-adr), [ADR index](docs/adr/README.md), [Domain docs](docs/agents/domain.md) |
| Change the desktop app in `packages/desktop`: Space windows, the `infinitycube` scheme, invoke permissions, bundling or updates | [Storage and hosts](docs/requirements/storage.md), [Desktop contributor skill](.agents/skills/infinity-cube-desktop/SKILL.md) |
| Coordinate state or effects across modules | [Cross-module coordination](docs/agents/workflow.md#cross-module-coordination) |
| Change comments or domain vocabulary | [Comment evidence](docs/agents/workflow.md#what-a-comment-may-assert), [Domain vocabulary](docs/agents/workflow.md#domain-vocabulary) |
| Change, vendor or publish a tracked skill | [Skills](docs/agents/workflow.md#skills) |
| Change assertions, parsing, mocks, injected ids, reflective access or anti-slop suppressions | [Anti-slop](docs/agents/anti-slop.md) |
| Change TypeScript, Vite configuration, formatting or a spike harness | [Build and tooling](docs/agents/build-tooling.md) |
| Change the Fetch application or Node HTTP adapter | [HTTP and Hono](docs/agents/http.md), [Storage and hosts](docs/requirements/storage.md) |
| Write or resolve an issue, or triage work | [Issue tracker](docs/agents/issue-tracker.md), [Triage labels](docs/agents/triage-labels.md) |

## Rules that bite

- **Start production UI work with the `shadcn-first-ui` skill, before any code.** Search `@project/ui`, then the shadcn registry; record a deviation before hand-rolling. See [the skill](.agents/skills/shadcn-first-ui/SKILL.md) and [UI](docs/requirements/ui.md).
- **Leave dev servers and occupied ports alone.** Verify with tests and CI. See [Running hosts](docs/agents/verification.md#running-hosts).
- **Mint ids through the injected `newId`, never by mocking `crypto.randomUUID`.** See [Anti-slop](docs/agents/anti-slop.md).
- **Relative imports inside a package are extensionless, and type-only imports use `import type`.**
- **`eslint-suppressions.json` only shrinks:** it is generated, never hand-edited or regenerated to admit a new assertion. See [Anti-slop](docs/agents/anti-slop.md#the-suppressions-baseline).
- **A module bundled into a Vite config imports `@project/*` by relative path**, or the dev server will not start. See [Build and tooling](docs/agents/build-tooling.md).
- **When the chrome changes, search `test/e2e/` too:** the PostgreSQL and SQLite restart proofs drive it and run only in CI's database jobs.

## Before claiming done

**The full bar runs in CI, on a draft PR.** `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` overload the local machine, so the laptop runs targeted checks and CI runs the suite.

1. **Check locally, aimed at the change.** For TypeScript, run `pnpm typecheck:toolchain` first, then `pnpm typecheck` and `pnpm typecheck:packages`, `pnpm exec eslint <files>`, `pnpm exec vitest run <files>`, and `pnpm exec playwright test <spec>` when iterating on one UI behaviour (`-c playwright.ladle.config.ts` for a story spec under `packages/app/ladle-e2e/`). `pnpm verify:local` is the whole-repo static bar plus coverage at two workers and the TypeScript CRAP gate.
2. **Open a draft PR at the first commit.** Branch off `main`, push, `gh pr create --draft`. CI runs on pull requests and pushes to `main` only, so a pushed branch with no PR is never checked. Asking for the work authorises pushing its branch and opening its draft PR; marking it ready, merging and pushing to `main` wait for the user.
3. **Done is `CI passed` green** — the gate job over every required job. Watch with `gh pr checks --watch`; when the gate is red, find the red job in that list and read it with `gh run view <run-id> --log-failed`. `main` is gated, so the baseline is green and a red job is yours until `git stash` or `git log` on the file shows otherwise.
4. **Report the evidence**: the local commands you ran and those you skipped, the `CI passed` result with each job behind it, and which CI job read what changed, or that none did. Claim success only for a result you watched arrive.

## Scope discipline

Keep to the MVP. Don't over-generalize the domain model and don't add features beyond what's asked.

## Commands

| Task | Read |
| --- | --- |
| Install tools, set up PostgreSQL or SQLite, build the app | [Developing InfinityCube](README.md#developing-infinitycube), [package scripts](package.json) |
| Inspect a dev host, run an isolated Aggregate or database host, check or serve an Aggregate over MCP | [Running hosts](docs/agents/verification.md#running-hosts), [Storage and hosts](docs/requirements/storage.md#operations-index) |
| Choose targeted checks, troubleshoot CI, or run browser, database or Rust proofs | [Verification commands](docs/agents/verification.md#verification-commands), [CI](.github/workflows/ci.yml) |
| Build a preview archive or desktop bundle | [Building from source](README.md#building-from-source), [release workflow](.github/workflows/release.yml) |

## Package layout & boundaries

- Keep domain logic in `core` and `graph`. Put reusable React UI in `ui` and application composition in `app`. The React Flow projection belongs in `react-flow-adapter`; only it and `app` reach React Flow.
- Resource plugins use the `resource-api` domain and view contracts. Register plugin packages through `plugins`.
- For cross-package imports, host entry points, plugin registration, or Space composition, read [Package boundaries](docs/agents/architecture.md).
