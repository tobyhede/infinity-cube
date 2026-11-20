# Run record: requirements snapshot refresh, 20 November 2026

The durable record of a refresh of the seven requirements docs against current main, following the `requirements-rewrite` skill (existing-snapshot refresh). The first rewrite's record is [`../requirements-rewrite/RUN.md`](../requirements-rewrite/RUN.md); its checkers are reused from there.

## Revisions

| What | Value |
|---|---|
| Repository | `tobyhede/infinity-cube` (also reachable as `tobyhede/hyper`) |
| Branch | `claude/project-thread-lxn37p-requirements`, stacked on PR 502's branch `claude/project-thread-lxn37p` |
| Source SHA (pinned) | `d461223` — PR 502's head, which contains main `71b2a14` (merge of PR 504, ADR 0164) |
| Target | `origin/main`, last checked at `71b2a14` on 20 November 2026 |
| Highest ADR at source | 0164 (0163 proposed, not incorporated) |

## Markers before this refresh

| Doc | Checked against | ADRs through |
|---|---|---|
| editing | `d14ff974` (2026-11-15) | 0157 |
| maps-and-graphs | `9e9b094` (2026-11-17) | 0159 |
| navigation | `9e9b094` (2026-11-17) | 0164 |
| rendering | `3244b74` (2026-11-18) | 0158 |
| space-and-resources | `9e9b094` (2026-11-17) | 0159 |
| storage | `9e9b094` (2026-11-17) | 0164 |
| ui | `9e9b094` (2026-11-17) | 0164 |

## Scope and authorization

- The maintainer asked (20 November 2026) for this skill to be run by delegated agents, with the work reviewed and everything audited. That authorizes doc edits under `docs/requirements/`, this run record, and a stacked PR. It does not authorize code changes, changes to what an accepted ADR decides, marking the PR ready or merging.
- Cut-over was done by the first rewrite (`AGENTS.md`, `docs/agents/workflow.md`, `docs/agents/domain.md`, `docs/requirements/README.md`); this refresh checks those entry points but does not re-route them.

## Topic owners

One agent per topic, each editing only its doc, its `trace/` file and its `conflicts/` file, and writing its fresh-reader questions to `questions-<topic>.md` here before drafting. Proposed `CONTEXT.md` or cross-topic changes are returned, not made.

## Baseline validation (source `d461223`, before edits)

| Command | Result |
|---|---|
| `python3 .scratch/requirements-rewrite/check-evidence.py` | 1,522 titles; 3 missing files, 5 titles not found, all in `storage.md` |
| `python3 .scratch/requirements-rewrite/check-links.py` | 74 files, 487 links, 0 broken |
| `python3 .scratch/requirements-rewrite/check-dispositions.py` | 164 ADRs (29 superseded); 7 without a row: 0157, 0158, 0160, 0161, 0162, 0163, 0164 |

## Limits

- Node 22 here; the repository needs 26.8.1. Doc-scanning unit tests run; runtime tests are CI's.

## Progress

1. **Inventory and questions.** Seven topic agents, one per doc, wrote their fresh-reader questions (`questions-<topic>.md`) before drafting, then reconciled their doc, `trace/` and `conflicts/` files against `d461223` and ADRs through 0164. None committed.
2. **Review.** Each diff was read by the coordinating session. Its own changes: the `CONTEXT.md` entries Presented Graph, Presentation and Space window (ADR 0164); pointers from ST-90 to ui C5 and from SR-67 to rendering C3; and the `check-evidence.py` root prefixes (`test/`, `src/`, `crates/`, `conformance/`, `packages/`).
3. **Independent audit.** A separate agent answered blind questions before reading the authors' expected answers, and found all 21. It then checked coverage, consistency and the mechanical checks. Its findings and their fixes:
   - RD-5 had softened ADR 0149: the Mermaid case is now **bug: code differs**, not undecided, and rendering C3 asks whether to fix the code or write an ADR.
   - ST-124's lock release on an Import refusal was marked built with no test. It now cites the test that keeps the lock file and marks the release untested in both runtimes.
   - navigation.md still listed Presented Graph and Presentation as undefined, citing ADR 0164 for detail 0164 does not state. Both moved to the defined terms.
   - Trace rows were missing for ADRs the markers call "decide nothing here": navigation 0156, 0159, 0160, 0162; space-and-resources 0157, 0160–0162; ui 0159–0162. Rows were added.
   - The path rule on the Status line didn't match the citations: navigation and maps-and-graphs now name the root prefixes they cite.
   - Vocabulary: the policy is that ADR 0164's rename applies to historical records as well as live rules (DECISIONS.md items 4 and S2 swept). maps-and-graphs' "whole Aggregate" is capitalised.
   - ui C6 asked two questions: it is now split into C6 (the `forbidden` sentence) and C7 (capitalising Space).

## Final validation (working tree after the audit fixes, on source `d461223`)

| Command | Result |
|---|---|
| `python3 .scratch/requirements-rewrite/check-evidence.py` | 1,527 titles; 0 missing files; 0 titles not found |
| `python3 .scratch/requirements-rewrite/check-links.py` | 74 files, 490 links, 0 broken |
| `python3 .scratch/requirements-rewrite/check-dispositions.py` | 164 ADRs (29 superseded); 0 without a row |
| `npx prettier --check docs/requirements CONTEXT.md .scratch/requirements-refresh-2026-11-20` | clean |
| `npx vitest run test/unit/current-domain-vocabulary.test.ts test/unit/adr-status-blocks.test.ts test/unit/docs-agents-citation-accuracy.test.ts` | 3 files, 145 tests passed (Node 22) |
| `git diff --check` | clean |

Freshness: `origin/main` was still `71b2a14` at the audit, the merge-base. `d461223..origin/main` holds only PR 502's own changes, so the refresh holds if PR 502 merges as it stands.

## Rulings (20 November 2026)

The maintainer took the recommended option on all four: rendering C3 (clip), ui C5 (Space at the CLI and on the page), ui C6 (name the cross-site cause) and ui C7 (capitalise Space). None is an ADR; DECISIONS "Refresh rulings" records them, the conflicts are closed, and RD-5, UI-89 and UI-111 mark the code gaps as bug: code differs. The code changes are tickets [01](issues/01-clip-a-wide-mermaid-diagram.md) to [04](issues/04-capitalise-space-in-sentences.md).

## Workflow impact

The snapshot model is unchanged. ADRs stay binding and append-only. The reading order in AGENTS.md is unchanged (CONTEXT.md, then the owning doc, then any ADR newer than its marker). Every marker now reads `d461223`, ADRs through 0164. CONTEXT.md gains Presented Graph, Presentation and Space window. No ADR was archived, rewritten or demoted.

## Further limits

- `check-evidence.py` checks TypeScript test titles and file paths. It does not open a Rust test to confirm a cited function name; the audit checked those by hand.
- `check-dispositions.py` checks that each ADR has a row in some trace, not in every doc whose marker mentions it; the audit checked that per doc.
