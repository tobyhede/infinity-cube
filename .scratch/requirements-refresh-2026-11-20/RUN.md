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

(updated at each checkpoint)
