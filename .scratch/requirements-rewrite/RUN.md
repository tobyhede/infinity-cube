# Run record: the requirements rewrite

This is the durable record of the requirements rewrite (PR 475, https://github.com/tobyhede/infinity-cube/pull/475). It follows the run record in the `requirements-rewrite` skill (`references/evidence.md`). Update it at each checkpoint or handoff.

## Latest checkpoint: refresh to main `f6e01b9` (21 November 2026)

- **Starting state.** The branch `claude/project-thread-vqr263` was rebased onto main `f6e01b9` as one commit, `495eabb` (the refresh to `a0f5066` and the Editing C4 ruling). Main had merged PR 506 (ADR 0165, the plain-SQL migrations, ST-125) and PR 502 (the README's Running and SQLite sections, ST-126–ST-128, the plugin skills telling a person to ignore `.infinity-cube.lock`). Main's own edits already put ST-125, ST-126–ST-128, the 0165 trace rows and closed conflict Storage S3 in place. A fresh agent reran the skill independently of the previous run.
- **Freshness.** `git diff a0f5066..f6e01b9` classified: Storage (ADR 0165, `migrations-sql/`, `crates/host/tests/shared_migrations.rs`, the `rust` job's PostgreSQL step, the SQLite rules, the README and skills on the lock file); process only (`current-domain-vocabulary` excludes `migrations-sql/`, `build-tooling.md`); nothing for the other six topics. All seven markers now read `f6e01b9` (2026-11-21), accepted ADRs through 0166; each trace ends with a "Refresh to `f6e01b9`" section (storage: §8) with a 0165 row.
- **Storage edits.** The marker attributes ST-125 to ADR 0165 (it said 0155 and 0156) and names ST-126–ST-128; ST-124 says the README and the getting-started skill tell the person to add the `.gitignore` entry (the previous checkpoint's open item: resolved on main, though no command writes the entry); ST-125 cites the unit test's two titles.
- **Re-audit of `495eabb`.** Verified against code at HEAD: ST-124's release on Import refusal and the Rust abandoned-write lock (ADR 0162, `src/run/run.ts`), ST-16's Rust citations, the ST-124/ST-122 Rust test modules, every "restated in" rule id in the refresh rows (each named rule carries that ADR, except as noted). Found and fixed: in six traces the 0166 row and the following code row were fused on one line (`||`), breaking the table; SR-30 lacked ADR 0158 although its trace row sources it; the storage marker misattributed ST-125. ADR 0164: the retired word was still written in the seven 0164 trace rows, now "the word ADR 0164 retires". `DECISIONS.md` and `conflicts/` keep it: they are dated rulings, which the 0164 sweep (`.scratch/talk-to-space/rename-talk.mjs`) excludes on purpose; an edit to them made here was reverted by the parent session. SR-68 was read against the ruling and C4: consistent.
- **Open.** `CONTEXT.md` still lists the retired word in three `_Avoid_` entries, the glossary's way of keeping it out; whether ADR 0164's "not written in … guides" covers them is for the maintainer (`docs/requirements/conflicts/space-and-resources.md` C2, open). ST-120's unwatched CI run and `check-dispositions.py` not in CI stand. RF-Q6 and RF-Q7 in `fresh-reader.md` were self-checked only.
- **Validation (21 November 2026).** See the table under "Validation", last row group.
- **Next action.** The parent session pushes the branch and watches `CI passed` on the draft PR.

## Earlier checkpoint: merged with main `a0f5066` (21 November 2026)

- Main moved to `a0f5066` (PR 504, ADR 0164 "talk" retired; PR 511, ADR 0166 preview builds). Merged into the branch; ui.md, navigation.md and storage.md conflicted, resolved by a word-level three-way merge of each conflicting rule (keeping main's rewording and this refresh's ST-124 edits) and checked by eye. All seven markers now read `a0f5066` (2026-11-20), accepted ADRs through 0166; each trace's refresh section records 0164 and 0166.
- **Ruling, 21 November 2026:** the maintainer chose option (b) for Editing C4. Closed C4; new rule SR-68 (**not built**); `DECISIONS.md` "Refresh rulings"; delivery issue `.scratch/title-well-formed/issues/01-refuse-a-title-holding-a-lone-surrogate.md` (ready-for-agent). Recorded as a ruling, not an ADR, because it adds a rule no ADR states and changes nothing 0042 or 0160 decides.

## Earlier checkpoint: refresh to `17aab57` (19 November 2026)

Read this first; the sections below it record the original rewrite (PR 475).

- **Repository** `tobyhede/hyper` (renamed from `tobyhede/infinity-cube`), branch `claude/project-thread-vqr263`, base and target `17aab57` (origin/main, checked 19 November 2026).
- **Scope.** The maintainer invoked `/skillz:requirements-rewrite` with no further instruction; read as an existing-snapshot refresh. Authorized: edit docs, push the branch, open a draft PR. Not authorized: implementing gaps, marking ready, merging.
- **Starting state.** Markers: editing `d14ff974`/0157, rendering `3244b74`/0158, navigation and UI `9e9b094`/0158, maps-and-graphs and space-and-resources `9e9b094`/0159, storage `9e9b094`/0162. Checkers at `17aab57`: `check-dispositions.py` 6 ADRs without a row (0157, 0158, 0160–0163); `check-evidence.py` 3 missing files and 5 missing titles (the checker read `conformance/` paths as under `packages/`, and ST-65/ST-114 cited titles that moved to `conformance/http/process-cases.ts`).
- **What changed.** All seven markers now read `17aab57` (2026-11-19), accepted ADRs through 0162; proposed 0163 is not incorporated (storage ST-122 restates it as built). Every trace ends with a "Refresh to `17aab57`" section recording each ADR above its old marker and the code merged since; trace/storage.md §1 gained rows for 0160–0163. Editing ED-24, ED-33, ED-37 and ED-80 name the Mermaid edit (ADR 0158). Storage: ST-16, ST-111, ST-113–ST-115, ST-119, ST-120, ST-122, ST-124 and the operations index reconciled (a topic agent drafted; the diff was inspected here). `check-evidence.py` resolves `conformance/` and `src/` from the root. `docs/agents/workflow.md` now asks for trace rows with each ADR. New open question: Editing C4 (a Title holding a lone surrogate).
- **Independence.** Storage was drafted by a delegated topic agent; a second, separate agent audited the whole diff and ran the five refresh fresh-reader questions with answers withheld (all matched; results in `fresh-reader.md`). Its four findings were applied (C4 opened; ADR 0158 added to ED-33 and ED-37 sources; 0161 trace row re-pointed to ST-101/ST-123; workflow wording).
- **Validation (19 November 2026).** `check-evidence.py` 1,515 titles, 0 missing; `check-links.py` 74 files, 489 links, 0 broken; `check-dispositions.py` 163 ADRs, 0 without a row; `prettier --check docs/requirements docs/agents` clean; `vitest run` over `adr-status-blocks`, `current-domain-vocabulary`, `docs-agents-citation-accuracy`, `agent-skill-commands` 158 passed (Node 22.23.5, `pnpm install --config.engine-strict=false`; the repository asks for Node 26.8.1). CI on draft PR 503 at `9ca33cf`: `CI passed` green (19 November 2026), with static-checks, coverage, e2e (1–3), ladle, mount, postgres, sqlite, rust and rust-windows each green.
- **Open.** ADR 0162 says a content repository should ignore `.infinity-cube.lock`, and neither `cube init` nor the getting-started skill adds it. ST-120's note that the `rust` job's CLI conformance run has not been watched was not rechecked (no `gh` here). `check-dispositions.py` is not run in CI. The 33 original fresh-reader questions still lack an independent run.
- **Next action.** The maintainer reviews PR 503; SR-68 waits on its delivery issue. Then, at the next accepted ADR, follow workflow.md's same-change maintenance and rerun the three checkers.

## Revisions

| What | Value |
|---|---|
| Repository | `tobyhede/infinity-cube` |
| Branch | `docs/requirements-rewrite` |
| Baseline (the rewrite's first source revision) | `797b2908` |
| Target (main, last checked 15 November 2026) | `d14ff974`. Main had not moved past it when this record was written. |
| Branch head when this record was written | `e503e525` ("docs: keep the ADRs binding and in place"), with the 15 November realignment edits uncommitted on top of it |
| Highest ADR at the target | 0144 (0141 proposed, not incorporated). This pass adds 0145–0154. |

## Scope and authorization

- Toby (the maintainer) asked for the rewrite: seven requirements docs restating the accepted ADRs and the product guides they overlap, with traces, conflict records and rulings.
- He then asked for the branch to be rebased and reconciled onto main; the reconciliation brought each doc up to main `d14ff974` on 13 November 2026 (each trace's "Sources added or changed on main" section).
- On 15 November 2026, after an independent review (`/mnt/project-files/reviews/pr475-requirements-rewrite-skill-review-2026-11-15.md`, outside the repository), he chose "ADRs bind": ADRs stay binding and append-only in `docs/adr/`, and the requirements are a snapshot of them. That reverses ruling 8 in `docs/requirements/DECISIONS.md` and is recorded as ADR 0145, which supersedes ADR 0115.
- Excluded: code changes the rulings call for (each rule records the ruled behaviour with its status, and the docs' Bugs sections list them); marking the PR ready and merging, which wait for the maintainer.

## Topic owners

| Topic | Owning doc | Trace | Conflicts |
|---|---|---|---|
| Space and Resources | `docs/requirements/space-and-resources.md` | `trace/space-and-resources.md` | `conflicts/space-and-resources.md` |
| Maps and Graphs | `docs/requirements/maps-and-graphs.md` | `trace/maps-and-graphs.md` | `conflicts/maps-and-graphs.md` |
| Editing | `docs/requirements/editing.md` | `trace/editing.md` | `conflicts/editing.md` |
| Storage and hosts | `docs/requirements/storage.md` | `trace/storage.md` | `conflicts/storage.md` |
| Rendering | `docs/requirements/rendering.md` | `trace/rendering.md` | `conflicts/rendering.md` |
| UI | `docs/requirements/ui.md` | `trace/ui.md` | `conflicts/ui.md` |
| Navigation (with Presenting) | `docs/requirements/navigation.md` | `trace/navigation.md` | `conflicts/navigation.md` |

`CONTEXT.md` keeps names. Engineering rules stay in `docs/agents/` (`build-tooling.md`, `anti-slop.md`, `workflow.md`, `domain.md`, `http.md`). The replaced product guides are kept in `docs/adr/archive/agent-guides/`, identical to main's except that their relative links are rebased to the new location.

## Source inventory and dispositions

- Sources: every ADR in `docs/adr/` and `docs/adr/superseded/` (144 at the target, 152 after this pass), the product guides now in `docs/adr/archive/agent-guides/`, and `CONTEXT.md`.
- Every ADR has at least one disposition row in a trace, a conflict file or `DECISIONS.md`; `check-dispositions.py` holds that. The 21 ADRs the review found with none (superseded 0008, 0011, 0012, 0017, 0021, 0022, 0027, 0044, 0045, 0049, 0055, 0058, 0059, 0060, 0072, 0075; accepted 0061, 0062, 0071, 0085, 0088) now have document-level rows, in the last section of the maps-and-graphs, navigation, rendering, space-and-resources and storage traces.

## Decisions

- Drafting rules and maintainer rulings: `docs/requirements/DECISIONS.md` (3, 6 and 12 November 2026; ruling 8 reversed 15 November 2026).
- Rulings that change what an accepted ADR decides are ADRs: 0146 (DEC 1, C1, C2: switching Graphs is an Edit), 0147 (C3: drawing an existing Edge is refused), 0148 (Navigation C2: canvas Graph navigation keeps no history), 0149 (Rendering C1: Open content is clipped), 0150 (Space and Resources C1: natural size is not measured), 0151 (UI C3: a sentence quotes the short Title), 0152 (Storage S2: no compatibility promise outside the repository), 0153 (UI C2: Remove from Map asks first only when Edges would go, added after review), 0154 (UI C4: a permanent rejection is a dialog that takes focus, ruled after review). `DECISIONS.md`, "Rulings recorded as ADRs", maps each ruling to its ADR and requirements.
- ADR 0145: the requirements are a snapshot of the accepted ADRs; it supersedes 0115.

## Limits: what was not preserved or could not be checked

- **The checkpoint pages are not in the repository.** Each ruling was put to the maintainer on a checkpoint page with its evidence; those pages were not preserved. Where a ruling closed a conflict, the conflict file keeps the disagreement, the options and the evidence. For the structural rulings (A, B and 1–8) the evidence is not recoverable.
- **The rN mapping tables (`map-*.md`) were never committed.** Trace rows cite an ADR's rules as "0028 r1" and so on. The numbering does not follow the ADR's text order (0028's r1, "activation is not an Edit", is the second rule its text states), so a number cannot be resolved by counting; each trace's abbreviations now say so, and a row is resolved by its description, which names the claim.
- **The "requirements reference checker" the PR body mentions was not tracked.** `check-evidence.py` below replaces it.
- **Runtime tests cannot run here.** This environment has Node 22; the repository requires Node 26.8.1. The doc-scanning unit tests below run under 22. CI on the draft PR is the full bar.
- **Fresh-reader exercises were not run independently, and have no baseline.** `fresh-reader.md` holds the questions, expected answers and a self-check by the agent that wrote them.
- **The checkers are tracked** through a `.gitignore` exception for `.scratch/requirements-rewrite/*.py`.
- **Snapshot markers.** All seven docs carried a marker naming `d14ff974` at the last run below.

## Validation

Run from the repository root.

| Command | What it checks | Result (15 November 2026, last run) |
|---|---|---|
| `python3 .scratch/requirements-rewrite/check-evidence.py` | Every `` `file` › "title" `` citation in `docs/requirements/*.md` names an existing file containing that test title | 1,432 titles, 0 missing files, 0 titles not found |
| `python3 .scratch/requirements-rewrite/check-links.py` | Relative Markdown links and anchors in `docs/` (ADR bodies skipped), `AGENTS.md`, `CONTEXT.md`, `README.md`, `.agents/skills/`, `plugins/` | 74 files, 475 links, 0 broken, the archived guides included once their relative links were rebased |
| `python3 .scratch/requirements-rewrite/check-dispositions.py` | Every ADR number in `docs/adr/` and `docs/adr/superseded/` appears in a trace row, a conflict file or `DECISIONS.md` | 152 ADRs (29 superseded), 0 without a row |
| `pnpm exec vitest run test/unit/adr-status-blocks.test.ts test/unit/current-domain-vocabulary.test.ts test/unit/docs-agents-citation-accuracy.test.ts test/unit/agent-skill-commands.test.ts test/unit/check-typescript-toolchain.test.ts` | ADR status blocks, vocabulary, citations in agent docs, skill commands, the toolchain check | 5 files, 180 tests passed (Node 22) |
| `pnpm exec prettier --check docs/requirements .scratch/requirements-rewrite` | Formatting | all matched files pass. `.prettierignore` excludes `.scratch/**`, so this checks the docs only |
| CI on PR 475 (`gh pr checks 475 --watch`) | The full bar: `verify:static`, `test:coverage`, `e2e`, `e2e:ladle`, `mount`, the database jobs, gated by `CI passed` | not yet run on the realignment commit |

Results of 21 November 2026, at the refresh to `f6e01b9` (Node 22.23.5, `pnpm install --config.engine-strict=false`): `check-evidence.py` 1,533 titles, 0 missing files, 0 not found; `check-links.py` 74 files, 490 links, 0 broken; `check-dispositions.py` 166 ADRs (29 superseded), 0 without a row; `pnpm exec prettier --check docs/requirements docs/agents` clean; `pnpm exec vitest run` over `adr-status-blocks`, `current-domain-vocabulary`, `docs-agents-citation-accuracy`, `docs-agents-ticket-status` and `conflict-markers`: 5 files, 165 tests passed. CI not run from here (the parent session pushes).

## Next actions

1. Commit the 15 November realignment and watch `CI passed` on PR 475; record the result here.
2. Rerun the three checkers after any further edit to the docs, traces or ADRs.
3. Re-point any remaining citation of a retired guide's facts to the owning requirement or ADR (review finding 6).
4. When an ADR numbered above a doc's marker is accepted, update that doc and its marker in the same change, add its rows to the doc's trace, and rerun `check-dispositions.py`.
5. Have an independent reader answer `fresh-reader.md`'s questions with the expected answers withheld, and record the result there.
