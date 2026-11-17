# 20 — Retire the TypeScript server

**Status:** needs-triage

**Blocked by:** 13, 17, 18, 19.

**What to build:** With every server-side host answered by Rust, remove the TypeScript server: the production Node host (`src/desktop/`), the `src/` host code (Running, the CLI, the SQL repository, MCP) and the server-side parts of `packages/*`, with `aggregate` keeping what Mounting needs in the page (ADR 0130). `pnpm cube` is retired in favour of the Rust binary. Before removal, the conformance corpus (07) and suite (08) take the Rust host as their reference: the expected answers they hold already state the contract, so nothing they check is lost when the TypeScript host goes.

- [ ] Every verb `pnpm cube` answered (`run`, `check`, `init`, `import`, `export`, `mcp`) has a Rust counterpart that passed its conformance in 12, 17 or 18; `pnpm cube` removed.
- [ ] 07 and 08 green in CI against the Rust host alone; Mounting's e2e (`pnpm e2e:mount`) still green.
- [ ] ADR 0124 (one CLI, `pnpm cube`) refined or superseded by a new ADR naming the Rust binary.
- [ ] Storage requirements, `AGENTS.md` (Commands, package layout) and both infinity-cube skills describe the Rust binary only, with the plugin's version bumped in all three manifests.
