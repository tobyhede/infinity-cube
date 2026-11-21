# README.md audit: duplication and caching

Lens: writing-for-agents, "Pruning" (single source of truth; duplication; environment as cache; relevance/sediment) plus "Information hierarchy" (disclosure, sprawl).
Scope: `/home/claude/hyper/README.md`, 252 lines, 26.5 KB, ~3,900 words (~5.5k tokens). Read-only audit; no repo file changed.

## Who reads the README, and why it matters

- `plugins/infinity-cube/skills/infinity-cube-getting-started/SKILL.md:44` names the README's "How Running works" as **the full description of Running**. So README 39–57 is a disclosed reference an agent actually follows, not human-only prose.
- `docs/agents/workflow.md:170` names the README's "Installing the skills elsewhere" as where the install commands live.
- `AGENTS.md` is the agent authority and README:94 calls README's dev section "the human summary". Everything under "Developing InfinityCube" (92–252) is therefore, by its own declaration, a second copy of material whose source of truth is elsewhere.

## Drift already present (evidence that the duplication costs)

These are not hypothetical drift risks; the copies already disagree.

| # | README | Other location | Disagreement |
|---|---|---|---|
| D1 | 45: "does not lock the directory … or run InfinityCube twice on one directory, InfinityCube's next write replaces what is on disk" | `docs/requirements/storage.md` ST-124 (l.177), ST-66 (l.176), ST-64; `AGENTS.md` Run bullet (ADR 0162) | A run **does** lock `<dir>` (`.infinity-cube.lock`); a second run is refused. README is stale, and it is the doc the getting-started skill delegates to. The skill itself repeats the stale claim at SKILL.md:35 ("a second run on the same directory"). |
| D2 | 48: "A `*.md` file beside `space.json` or in `resources/` is not a Resource and is left alone" | getting-started SKILL.md:38: "is refused by the run, naming it, and removed by the next Export" | README agrees with `storage.md` l.48 / ST-31 ("is the author's"); the **skill** is the stale copy. Both are copies of ST-31. |
| D3 | 215: plugin list `ur, image, markdown, reference, space, default` | `packages/` listing; `AGENTS.md` package list | `plugin-mermaid` missing (ADR 0158). Cheap-lookup cache, gone stale. |
| D4 | 116: `pnpm verify # typecheck + lint + prettier check + unit/property tests` | `package.json` `verify:static`/`verify` | Omits `typecheck:toolchain`, `typecheck:packages`, `ui:catalog:check`, `lint:anti-slop`, coverage. AGENTS says the list "lives in package.json and nowhere else". |
| D5 | 218: `@project/ui` "framework-agnostic React" | `AGENTS.md`: "presentation-agnostic" | Wording drift; "framework-agnostic React" is self-contradictory. |
| D6 | 241: "Graph navigation behaviour, with fast-check property tests for clamping/monotonicity" | `packages/graph/test/` (no clamp/monotonic tests; only a comment in placement.test.ts:633); Navigation lives in `packages/app/src/navigation.ts` | Stale claim about tests. |
| D7 | 210: `@project/graph` owns "Graph navigation" | `AGENTS.md`: graph owns "traversal"; Navigation is `app` | Imprecise/stale. |
| D8 | 252: bundle sizes "~1.2 MB (381 kB gzipped) … ~623 kB", "Remeasured after elkjs left" | `AGENTS.md` Conventions: "a measurement goes in a ticket … history goes in the commit" | A measurement plus lineage in a top-level doc; guaranteed to rot. |

## Duplication within the README

| Meaning | Occurrences | Verdict |
|---|---|---|
| Presenting keys | 5 (prose: Right/Left/Up-Down/Leaving), 27 (`→ ← ↑ ↓ Esc`) | Keep 27 (the step a user performs); cut the key list from 5. Source of truth: `navigation.md` NV-65 (which also has Page Down, Space, Home — both README copies are partial). |
| "[Navigation requirements]" link | 5 (twice in one paragraph), 109, 251 | Drop the second link in 5. |
| Node ≥ 26.8.1 and pnpm 9 | 11, 98 | Keep 11; 98 → "Requirements as in Quick start, plus Docker…". Environment holds it: `.node-version`, `package.json` `engines` / `packageManager` (the skill already points there, SKILL.md:14). |
| `pnpm install` | 16, 101 | Cut from 101. |
| Edge anchors / four handles | 26 (four handles, user gesture), 111, 223 | 111 and 223 say the same thing (anchor facing the other Resource, chosen while drawn, follows a drag); both duplicate `rendering.md` RD-34. Keep 26; cut 111 and the anchor sentence of 223 to a pointer. |
| Ctrl-C / signals / second Ctrl-C | 28, 44, 46 | Fine in 28 (step) and 44 (rule); 46 repeats "second Ctrl-C exits without waiting" — merge into 44. |
| Git is the undo | 45, 248 | 248 duplicates 45; and "no undo in the application" duplicates `editing.md`. Cut 248 or reduce to pointer. |
| Whole-aggregate unit, `--store sqlite`, SQLITE_PATH absolute/migrated, one process per file | 170–174 and 196 | 196 re-says 172/174 (refuse relative, need migrated file, don't share a file a host has open). Merge. |
| Export writes in place, only the files Import reads | 47, 194 | 194 restates 47 for Export; replace with "Export writes as a run does (above)". |
| Pictures/Markdown text in `assets/` named by content | 48, 49 | Merge into one bullet. |
| Import/Export boundary: browser never touches files | 180, 235 | 235 restates the CLI-is-server-side point; cut 235 or move. |
| `pnpm cube run` the persistence destination | 107 last sentence, whole of 39–57 | Cut sentence from 107. |

## Section verdicts

Ranked list at the end. Words are `wc -w` per range.

### 1–8 Intro (160 w) — **keep**, trim

- 3, 7: unique product framing; keep.
- 5: presenting is defined in detail ("one 16:9 frame letterboxed…", key semantics) that duplicates `navigation.md` (letterbox, NV-15/17/65) and line 27. **Cut to one sentence + one link**: "Presenting traverses one Graph on a full-window Stage ([Navigation](docs/requirements/navigation.md))." Saves ~70 w.

### 9–37 Quick start (300 w) — **keep** (core user steps)

- 11: keep (the corepack gotcha is a valuable cache: "no config confesses it"). Note it is also in getting-started SKILL.md:14; acceptable because the skill is a separately installed artifact that must work without the clone's README.
- 24: "`init` … must be empty apart from dot-entries" repeats 50 and `storage.md` ST-67/68. Acceptable in a quick start; could shorten.
- 26: the only user-facing description of editing gestures (Dock, toolbar, handles, Option/Alt drop). Overlaps `ui.md`/`rendering.md` but is a user tutorial. Keep.
- 27: keep (see within-README dup).
- 37: "relative path is relative to where you ran pnpm" duplicates AGENTS Run bullet; this is a genuine gotcha, keep **here** as the user copy.

### 39–57 How Running works (713 w) — **keep as the single user-facing source, but fix D1 and make it the one copy**

This is the largest and most valuable section, and the getting-started skill delegates to it. It duplicates three places: `storage.md` ST-62–ST-68, ST-124, ST-31, ST-57 (normative); `AGENTS.md` "Run:" bullet (very long, agent copy); getting-started SKILL.md step 6 (a paraphrased copy).

- Decide the chain explicitly: `storage.md` is the normative source; README 39–57 is the user-facing restatement; the skill should point at README rather than re-list six bullets (it says "in your own words", so a pointer plus "tell them each point in that section" would do). Today three copies drift independently (D1, D2).
- 45: **fix** to say a run locks the directory and a second run is refused (ST-124); keep "git pull while running → next write wins" (still true, ST-66).
- 46: valuable cache — the exact stdout strings (`Could not write the directory:`, `Stopped, but…`, `Stopped; <dir> holds every edit.`) are what a user/agent greps for. Keep; the skill copies them too (SKILL.md:30, 36).
- 47–49: merge 48 and 49 (both "assets/ named by content"). The `*.md` rule (48) is the single correct copy (vs D2); keep.
- 50: "Opening a Space can itself be an edit (defaultMap / Meta Space)" — implementation-level, but a real gotcha (a run with "no edits" may still write). Keep, short.
- 51–55 Ports: cache of `pnpm cube help` (`src/cli/arguments.ts:40-61` synopses) and ST-68. Lookup is cheap (`pnpm cube help`), but `--port` failing when taken vs auto-next is behaviour help does not confess. Keep one sentence; drop the example block (~25 w).
- 57: pointer to `docs/aggregate-directory.md`; keep.

Estimated trim with fixes: ~150 w, and removes one live contradiction.

### 59–66 Using InfinityCube with agents (≈130 w) — **keep, trim**

- 63–64: skill one-liners duplicate the skills' `description` frontmatter. Low cost, useful to humans browsing; keep but don't elaborate further (64's "stops the run first" duplicates authoring SKILL.md:18 — fine as a one-clause reason).
- 66: keep.

### 68–90 Installing the skills elsewhere (≈180 w) — **keep commands; move the maintainer rule out**

- 70 second half ("cache the plugin by version … all three of plugin.json … `test/unit/skills-marketplace.test.ts`") is maintainer policy, duplicated verbatim in `docs/agents/workflow.md:170` and `AGENTS.md` "Tracked skills". **Cut from README** (a user installing does not bump versions); workflow.md is the source of truth. Saves ~50 w.
- 74–88 install/update commands: workflow.md:170 points here, so README is the source of truth for these. Keep. (They are a cache of `claude plugin --help`/`codex plugin --help`, but the exact marketplace/plugin naming is not discoverable — valuable cache.)
- 90: keep (zip-for-chat-app gotcha is unique).

### 92–94 Developing intro — **keep** (it is the correct pointer to AGENTS.md)

### 96–111 Development servers (275 w) — **cut to pointer + minimal block**

- 98, 101: duplicate 11/16 (within README) and AGENTS "Install".
- 100–105 script block: cache of `package.json` scripts and AGENTS "Dev:" (which also lists dev:roadmap, dev:sqlite and port strictness). Port numbers are not in `package.json` root scripts (they are in `packages/app/package.json`/vite configs), so the port list is a moderately useful cache for humans. Keep the three lines, drop prose duplicates.
- 107: duplicates AGENTS Dev ("Edits in any memory runtime survive browser reloads for that server's lifetime") and the UI labels are a cache of `packages/ui/src/PersistenceIndicator.tsx:41-42`. Keep the first two clauses (where an edit lands per host is useful to a human); cut the label strings and the `cube run` sentence. ~30 w.
- 109: product behaviour (durable URLs, Copy link, Back/Forward) — belongs in `navigation.md`/`ui.md` (where "Copy link" is already defined). It is not about development servers at all; misplaced. **Cut to pointer or move to intro** as a one-liner. ~60 w.
- 111: rendering rule, duplicate of 223 and `rendering.md` RD-34. **Cut.** ~60 w.

### 113–121 Verify (95 w) — **cut to pointer**

- 116: stale cache (D4). Replace comment with "runs the whole static bar and tests; see AGENTS.md › Commands".
- 117–121: duplicate AGENTS "E2E:" (new-space vs chromium projects, isolated servers, `playwright install chromium`). The install-once line is a valuable gotcha; keep it. Cut the `new-space`/catalog explanation (~45 w), which is internal test topology.
- Consider adding the one rule humans most need and AGENTS states: the full bar runs in CI on a draft PR. (Optional; not duplication.)

### 123–159 Local PostgreSQL (134 w) — **keep, it is a valuable how-to; trim 147–159**

- 125–145: same steps as AGENTS "PostgreSQL integration". AGENTS is terser; README's `.env` example with the port 55432 is a cache of `.env.example`/`compose.yaml` (one-file lookups). Acceptable for humans; could collapse 132–137 to "fill both blanks in `.env` with the same password".
- 147–149: "emits the Prisma Next contract, applies pending migrations, performs a typed JSONB write and read" — cache of `package.json` `test:integration:postgres` plus test internals. Cut. 151–154 (`contract:emit`, `db:migrate`) is a cheap `package.json` lookup; low value.
- 156–159: secret-manager note and destructive reset duplicate AGENTS; the reset command is a valuable gotcha. Keep 158–159.

### 161–176 Local SQLite (487 w) — **move most to `storage.md`; keep 3–4 lines**

Highest implementation-detail density in the file, and `storage.md` has **no SQLITE_PATH rules at all** (grep: zero hits); only ST-3 mentions SQLite. So README is currently the sole source of truth for several host rules, which is the wrong home for normative behaviour.

- 166–167: keep (commands).
- 170: internals (`PN-CLI-4005`, `prisma-next.config.sqlite.ts` declaring no `db.connection`, `openSqliteRepository` minting temp files). Not referenced anywhere else; this is test-harness explanation. **Move to a comment in `vitest.sqlite.config.ts` / the test, or a ticket.** Cut from README. ~90 w.
- 172: the refusal rules (unset/blank, parent missing, file missing for CLI, relative refused, why relative is dangerous) are normative host behaviour → **move to `storage.md`** as ST rules, with tests named. README keeps: "Use an absolute path; relative, unset or missing are refused." ~130 w saved.
- 174: one-process-per-file contention semantics (5 s busy timeout, synchronous wait, 503 not 409, citing `test/integration/sqlite-contention.test.ts`) → **move to `storage.md`**. README keeps: "One InfinityCube process per file; stop `dev:sqlite` before `cube import/export --store sqlite`." AGENTS already says "must not share a file a running host has open". ~140 w saved.
- 176: `journal_mode=delete`, `synchronous=FULL`, no WAL → storage requirement/ADR (it's a deployment property). Backup advice (`sqlite3 … ".backup"`, don't copy mid-transaction) is a genuine operator gotcha; keep that sentence.

### 178–201 Importing and Exporting a database (409 w) — **cut to commands + pointer to `storage.md`**

- 180: whole-aggregate unit — duplicates `storage.md` (lifecycle doors, l.22) — keep one clause.
- 182–186: commands — cache of `pnpm cube help` (`src/cli/arguments.ts:51-56`), but the comments explain the doors concisely. Keep.
- 188: "Two doors and no mode parameter on either" is an internal design maxim copied from AGENTS' `persistence` package description; meaningless to a user. "authorized by the Meta identity the repository just reported" is implementation. **Cut**; storage.md holds it (ST lifecycle rules, `dangerous-replace` hits in storage.md and trace).
- 190: "permission to destroy rather than a demand" + conflict-in-the-gap wording — normative, already in `storage.md`/trace; cut to one sentence ("On an empty repository `--dangerous-replace` just initializes").
- 192: useful operator gotcha (a database a host started on already holds an aggregate, so import needs the flag). Keep, shortened.
- 194: duplicate of 47 + storage.md (two links in one sentence). Cut to "Export writes in place as a run does."
- 196–201: duplicates 172/174 and AGENTS Dev bullet. Keep the cross-database recipe (198–201, unique and useful); cut the rest of 196.

Saves ~250 w.

### 203–235 Architecture (689 w) — **cut to a pointer to AGENTS.md › Package layout; drop internals**

- 205–219 package table: a lossy second copy of AGENTS.md "Package layout & boundaries", already drifted (D3 mermaid missing, D5 framework-agnostic, D7 Graph navigation). Also a cache of `ls packages/` + each `package.json`. AGENTS is the declared authority. **Replace with**: "Eighteen workspace packages with enforced boundaries; see AGENTS.md › Package layout." If a human-facing table is wanted, keep names + ≤8-word roles and accept drift risk — but this is the single biggest drift source in the file.
- 221: design rules duplicate AGENTS "Hard rules". Cut.
- 223: function names (`buildGraphRenderEdges`, `buildLayoutStrategyGraph`, `projectResourceNodes`, `projectGraphEdges`, `edge-attachment.ts`) are code identifiers — cheap grep, stale-able; anchor rule duplicates RD-34 and line 111. Cut; keep at most "Switching Graphs changes emphasis, not visibility or placement" (which belongs in the intro if anywhere).
- 225–231 Maps and layout strategies: `LayoutStrategy` type signature is a cache of `packages/graph/src` (one grep); "nothing selects gridStrategy today", "positionedStrategy is what the canvas draws" duplicate AGENTS `graph` and `react-flow-adapter` entries and `maps-and-graphs.md`. Cut.
- 233 Resources: plugin owns its rect / Reference for a second position — duplicates `space-and-resources.md` and `maps-and-graphs.md` (it links both, three times). The user-facing nugget ("a Resource occupies one position on a Map; use a Reference to show it twice") could move to the intro as one sentence.
- 235: duplicate of 180 and AGENTS. Cut.

Saves ~600 w. Lowest value / highest drift in the file.

### 237–244 Tests (103 w) — **cut**

A cache of `packages/*/test`, `test/unit`, `test/integration`, `packages/app/e2e` directory listings, already stale (D6). Test inventory is a one-command lookup; requirements docs cite tests per rule (`**built**: …`), which is the maintained source. Replace with nothing, or one line: "Each requirement names the test that holds it."

### 246–252 Current limitations (234 w) — **keep the list, strip implementation**

- 248: duplicate of 45 → cut or one clause.
- 249: Overlay legibility — a genuine user-visible limitation not stated as a limitation elsewhere (rendering.md has the rules). Keep, could trim the parenthetical.
- 250: "size authored, never measured", 260×146, `shape` only for Ur, `COLLAPSED_RESOURCE_SIZE` in `packages/core/src/resource-geometry.ts:5`. The constant name + path is a code cache (one grep); the Closed Size number duplicates `maps-and-graphs.md`/`rendering.md`/`ui.md` (all define "Closed Size"); the Ur shape rule duplicates MG-30. This is a design rule, not a limitation. **Move/cut to pointer** to maps-and-graphs.md. ~70 w.
- 251: Presentation Notes is a feature, not a limitation; pointer only. Move to intro or cut.
- 252: measurement with lineage (D8). **Cut** (ticket). Keep "React Flow ships in one chunk; bundle not tuned" if wanted.

## Ranked recommendations (token savings × drift risk)

| Rank | Lines | Action | ~Words saved | Drift risk now |
|---|---|---|---|---|
| 1 | 203–235 Architecture | Replace with pointer to AGENTS.md › Package layout; cut function names, type signature, design rules | ~600 | **High, already drifted** (D3, D5, D7) |
| 2 | 161–176 SQLite | Move refusal, contention and journal rules to `storage.md` (currently absent there); move 170 to the test config; keep commands + 3 one-line rules + backup tip | ~350 | High: README is sole normative source for host behaviour |
| 3 | 178–201 Import/Export | Keep commands + cross-DB recipe + "host-started DB needs the flag"; cut door/Meta internals and dups of 47/172 | ~250 | Medium (internal maxims copied from AGENTS) |
| 4 | 39–57 How Running works | **Fix D1 (lock, ST-124) first**; merge 48/49 and 44/46 dup; drop port example; make the skill point here instead of re-listing (fixes D2 in the skill) | ~150 | **High, live contradiction** in the doc a skill delegates to |
| 5 | 237–244 Tests | Cut | ~100 | High, already stale (D6) |
| 6 | 96–111 Dev servers | Cut 98/101 dups, 109 (navigation), 111 (anchors), label strings in 107 | ~170 | Medium |
| 7 | 246–252 Limitations | Cut 248, 250 constant/path, 251, 252 measurement | ~150 | High for 252 (measurement), 250 (code path) |
| 8 | 113–121 Verify | Fix/remove stale `verify` comment (D4); cut new-space topology; keep playwright install line | ~50 | Already stale |
| 9 | 1–8 Intro | Cut key list and duplicate link from 5 | ~70 | Low/medium (partial key list vs NV-65) |
| 10 | 68–90 Install | Cut maintainer version-bump rule from 70 (workflow.md:170 owns it) | ~50 | Medium (three copies: README, workflow.md, AGENTS) |
| 11 | 123–159 PostgreSQL | Cut 147–154 internals/cheap lookups | ~50 | Low |

Total: roughly 2,000 of ~3,900 words (~50%) can go to pointers without losing anything a user cannot reach in one step, and the cuts remove every currently-drifted passage except D1, which needs a fix rather than a cut.

## What the README should keep (the valuable cache)

The gotchas no config confesses: corepack no longer bundled (11); commit before the first run (24); relative paths resolve against where pnpm ran (37); the exact stop/failure stdout lines (46); notes outside `assets/` are safe (48); opening a Space can itself write (50); `--port` fails rather than moving on (51); `playwright install chromium` once (121); `docker compose down --volumes` is destructive (159); SQLite absolute-path and one-process rules, one line each, and the backup caveat (172/174/176); a host-started database already holds an aggregate (192); cross-database moves go through an exported directory (196–201); install/update commands for both agent products (74–88).

## Follow-ups outside the README (found during the audit)

- `plugins/infinity-cube/skills/infinity-cube-getting-started/SKILL.md:35` and `:38` are stale against ST-124 and ST-31 (second run; `*.md` beside `space.json`). Changing the skill needs the three-manifest version bump (workflow.md:170).
- `docs/requirements/storage.md` has no SQLITE_PATH host rules; if README 172/174 move, they need ST numbers and named tests (`test/integration/sqlite-contention.test.ts`, `sqlite-http-runtime.test.ts`).
