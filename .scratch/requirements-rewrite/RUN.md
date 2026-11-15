# Run record: the requirements rewrite

This is the durable record of the requirements rewrite (PR 475, https://github.com/tobyhede/infinity-cube/pull/475). It follows the run record in the `requirements-rewrite` skill (`references/evidence.md`). Update it at each checkpoint or handoff.

## Revisions

| What | Value |
|---|---|
| Repository | `tobyhede/infinity-cube` |
| Branch | `docs/requirements-rewrite` |
| Baseline (the rewrite's first source revision) | `797b2908` |
| Target (main, last checked 15 November 2026) | `d14ff974`. Main had not moved past it when this record was written. |
| Branch head when this record was written | `e503e525` ("docs: keep the ADRs binding and in place"), with the 15 November realignment edits uncommitted on top of it |
| Highest ADR at the target | 0144 (0141 proposed, not incorporated). This pass adds 0145–0153. |

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
- Rulings that change what an accepted ADR decides are ADRs: 0146 (DEC 1, C1, C2: switching Graphs is an Edit), 0147 (C3: drawing an existing Edge is refused), 0148 (Navigation C2: canvas Graph navigation keeps no history), 0149 (Rendering C1: Open content is clipped), 0150 (Space and Resources C1: natural size is not measured), 0151 (UI C3: a sentence quotes the short Title), 0152 (Storage S2: no compatibility promise outside the repository), 0153 (UI C2: Remove from Map asks first only when Edges would go, added after review). `DECISIONS.md`, "Rulings recorded as ADRs", maps each ruling to its ADR and requirements.
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

## Next actions

1. Commit the 15 November realignment and watch `CI passed` on PR 475; record the result here.
2. Rerun the three checkers after any further edit to the docs, traces or ADRs.
3. Re-point any remaining citation of a retired guide's facts to the owning requirement or ADR (review finding 6).
4. When an ADR numbered above a doc's marker is accepted, update that doc and its marker in the same change, add its rows to the doc's trace, and rerun `check-dispositions.py`.
5. Have an independent reader answer `fresh-reader.md`'s questions with the expected answers withheld, and record the result there.
