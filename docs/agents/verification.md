# Running and verifying InfinityCube

Read the host procedure before opening content or serving a database, and the verification procedure before choosing checks.

## Running hosts

- **Development hosts.** Inspect listeners with `lsof -nP -iTCP:5173-5299 -sTCP:LISTEN`. An ordinary `pnpm dev` can take the next port and collide with another named host. A running Vite host picks up ordinary source edits. Config-time changes need its owner to restart it. Use Playwright's isolated hosts to verify changes.
- **Aggregate runs.** Use an agent-owned temp directory and `--no-open` when testing with `pnpm cube run` or `infinity-cube run`. Use the getting-started skill when asked to run the user's content. Stop your run with SIGINT and wait for it to exit before editing files or starting another run on that directory. See [Running](../requirements/storage.md#running) for locks, writes, and shutdown.
- **Intake and MCP.** Use `pnpm cube check <dir>` to validate without serving or writing. It can read a directory another run holds. Invoke the stdio server with `pnpm --silent cube mcp <dir>` so stdout carries only the protocol. Stop a run before editing the same directory via MCP. See [CLI requirements](../requirements/storage.md#cli).
- **Database hosts.** Use your own migrated SQLite file or PostgreSQL database for `infinity-cube serve --store`. Set `SQLITE_PATH` or `DATABASE_URL` for the test input. Stop the SQLite host before running Import or Export against its file. See [database setup](../../README.md#local-postgresql) and [Storage and hosts](../requirements/storage.md).

## Verification commands

Follow [Before claiming done](../../AGENTS.md#before-claiming-done). The [scripts](../../package.json) and [CI jobs](../../.github/workflows/ci.yml) own the exact commands.

- **TypeScript.** The per-package pass covers the app's Vite and server build configs. Use [Build & Tooling](build-tooling.md) for compiler, mutation and build configuration.
- **Browser and story tests.** Install Chromium with `pnpm exec playwright install chromium`. Normal Playwright tests own fresh memory HTTP hosts and repositories. Ladle and Mount each run a separate config and CI job. Mount verifies a static build against intercepted GitHub requests and fails on CSP violations. Use [Workflow](workflow.md#stories-are-production-evidence) for story parity.
- **Database restart proofs.** For Space chrome changes, inspect `test/e2e/` and `test/support/restart-proof.ts` as well as the normal Playwright specs. The CI database jobs run the restart proofs against both the Vite and Rust hosts. Run `pnpm e2e:postgres` with `DATABASE_URL` naming a migrated test database, or `pnpm e2e:sqlite` with `SQLITE_PATH` naming a file prepared by `pnpm db:migrate:sqlite`. These use Vite by default. For a Rust host, use the `INFINITY_CUBE_RESTART_PROOF_HOST` command from the corresponding CI job. For local PostgreSQL integration, stop the Compose service you started after the tests and keep its volume. SQLite integration creates its own temp file.
- **Rust and desktop.** Keep local Cargo parallelism modest (`-j 2`). Run doctests separately from nextest. Desktop checks that build Tauri need both browser and desktop shell assets ahead of Cargo, plus the platform dependencies. See [desktop builds](../../.agents/skills/infinity-cube-desktop/SKILL.md#builds-and-updates). The [HTTP conformance harness](../../conformance/http/README.md) documents external host invocation.
- **Complexity.** TypeScript CRAP uses coverage from the verification run. Rust CRAP uses its own pinned CI tools. Reduce complexity or exercise missed branches when the gate fails. Keep the allow-lists shrinking.
