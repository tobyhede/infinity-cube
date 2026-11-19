# README audit (writing-for-agents), 2026-11-19

Audited `README.md` at `17aab57` (252 lines, ~3,900 words) with the writing-for-agents lens, in three parallel passes:

- [staleness.md](staleness.md): every checkable claim against code, ADRs and requirements.
- [duplication.md](duplication.md): single source of truth and environment-as-cache.
- [structure.md](structure.md): hierarchy, sprawl, completion criteria, co-location, pointers, leading words, negation, no-ops. Includes full replacement text for five rewrites and a target outline.

The README is agent-facing: `infinity-cube-getting-started` SKILL.md:44 calls "How Running works" the full description of Running, and `docs/agents/workflow.md:170` points at it for the plugin install commands. So its errors propagate.

## Fix first: wrong claims (verified by hand)

| README | Claim | Truth |
| --- | --- | --- |
| L45 | A run "does not lock the directory"; running twice means last write wins | Every host locks `<dir>/.infinity-cube.lock`; a second run is refused (ADR 0162, Storage ST-124, `src/cli/run-refusal.ts`). Mention ignoring the lock file in the content repo. |
| L50 | A run with no edits leaves the directory byte-for-byte as it was | True apart from the empty lock file (ST-64). |
| L50 | Opening a Space can itself be an edit that records a `defaultMap` | Opening never writes; the initialization reaches disk with the next Edit (ST-65). |
| L111, L223, L249 | Several Graphs through one pair draw between the same two points, told apart by colour | Parallel lanes ranked by length; the active Graph takes the centre (Rendering RD-37–39, RD-85–86). |
| L215, L205–219 | Plugin list and package table | Missing `plugin-mermaid`, `@project/desktop` and the Cargo workspace. |
| L235 | Only `init`/`run`/`import`/`export` touch a directory | Also `cube check`, `cube mcp`, the Rust CLI, the desktop app, the sidecar; Mounting reads from GitHub. |
| L210, L241 | `graph` owns Graph navigation, with clamping/monotonicity property tests | Navigation is in `app`; no such tests in `graph`. |
| L116 | `pnpm verify` comment | Partial; AGENTS.md says the list lives only in `package.json`. |

The same stale claims live in the plugin skills, which need fixing in the same change (with the version bump in all three manifests):

- `infinity-cube-getting-started` SKILL.md:35 (second run overwrites) and :38 (says a `*.md` beside `space.json` is refused and removed; ST-31 and README L48 say it is left alone).
- `infinity-cube-authoring` SKILL.md:49 (opening a Space records a `defaultMap` as an edit).

## Then: prune and restructure

1. **Sprawl.** The developer section (L92–252) is 64% of the file and calls itself "the human summary" of AGENTS.md, i.e. a second copy. About 2,000 words can become pointers.
2. **Architecture (L203–235, ~600 words):** replace with a pointer to AGENTS.md › Package layout. It has already drifted.
3. **SQLite (L161–176, ~350 words):** the README is the *only* source for the `SQLITE_PATH` refusals, contention and journal rules. Move those into Storage ST rules with named tests; keep the commands, one line per rule and the backup tip.
4. **Import/Export (L178–201):** keep the commands, the cross-database recipe and "a started host already holds an aggregate"; cut "two doors, no mode parameter" and the Meta authorization detail.
5. **Tests (L237–244) and the bundle measurement in L252:** cut. Requirements already name their tests; measurements and history ("Remeasured after elkjs left") belong in a ticket.
6. **Co-location.** Presenting keys (L5/L27), Edge anchors (L111/L223), undo (L45/L248), Node/pnpm (L11/L98), init's empty-directory rule (L24/L50). Product URLs (L109), anchors (L111), authored size (L250) and Presentation Notes (L251) are user behaviour misfiled under development.
7. **Completion criteria.** The best one in the file, `Stopped; <dir> holds every edit.`, is the last clause of a 139-word bullet (L46). Quick start step 3 should end on it; steps 1, 2, 4 and the PostgreSQL and SQLite procedures have none.
8. **Pointers.** 15 bare "([X requirements](...))" citations say neither what the target holds nor when to read it, several repeated in one paragraph (Navigation twice in L5, Storage four times in L188–194). L57 and L94 show the better wording.
9. **Negation and density.** Prohibitions at L43, L45, L163, L172, L188, L192 can be positive targets; L46, L170, L172, L174 and L190 bury the instruction under reasons.

## Keep (the cache worth having)

Corepack no longer bundled; commit before the first run; relative paths resolve from where pnpm ran; the exact stop and failure messages; `--port` fails rather than moving; `playwright install chromium` once; `docker compose down --volumes` destroys data; the SQLite absolute-path, one-process and backup caveats; the Claude Code and Codex install commands.

## Omissions worth one line each

`cube check` and `cube mcp` (how an agent checks files it wrote), the directory lock, Mermaid Resources, the Rust CLI and desktop app, Mounting. Contributor-only commands (`e2e:ladle`, `e2e:mount`, Rust checks, mutation testing) belong in AGENTS.md, which already has them.

Target: ~150–190 lines (structure.md has the outline).
