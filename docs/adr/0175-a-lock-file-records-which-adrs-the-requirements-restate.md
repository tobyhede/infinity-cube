# A lock file records which ADRs the requirements restate, and a new ADR edits no requirement

Status: accepted
Date: 2026-11-25
Refines: 0145

ADR 0145 made the seven requirements documents a snapshot of the accepted ADRs, with a hand-written marker near the top of each naming the commit it was checked against and the highest ADR it incorporates, and required that accepting an ADR update the owning document and its marker in the same change. In practice the markers drifted into paragraphs listing ADRs appended rather than reconciled, and the same-change rule made every ADR pull request a requirements pull request as well. Nothing checked either: a marker could say anything, and whether an ADR had been folded in was a matter of reading.

## The decision

- **`docs/requirements/snapshot.lock.json` records which ADRs the requirements restate**, each by the SHA-256 of its text. `scripts/adr_snapshot.py`, copied from the `adr-snapshot` skill, writes it (`stamp`) and checks it (`check`). Nobody writes the lock, a revision, a date or a coverage list by hand.
- **The lock replaces the snapshot markers.** Each requirements document opens with one line linking the lock in place of its marker. An ADR the lock does not record, or whose text changed since it was recorded, is **pending**: it binds where it differs from the requirements, and `check` lists it.
- **Accepting an ADR edits no requirements document.** The pending list is the work list for the next refresh, which reconciles the documents against the pending ADRs and runs `stamp`, naming any ADR it did not reconcile with `--leave-pending` so the lock never claims more than was read. A behaviour change still updates its requirement in the same commit; that rule is about code, not ADRs.
- **CI runs `check` on every pull request, and it fails only on what is mechanically wrong**: a malformed lock, a locked ADR missing from `docs/adr/` without a recorded supersession, a requirements document that cites an ADR without linking the lock, a link to a missing ADR, or a locked ADR that no document cites and that has no recorded reason. Pending ADRs, and a requirement still citing a superseded ADR (one recorded as superseded, or any file in `docs/adr/superseded/`), are warnings; `stamp` refuses the latter.
- **An ADR no requirement needs to cite is recorded with a reason** (`stamp --na`): engineering rules owned by `docs/agents/`, vocabulary owned by `CONTEXT.md`, process, and proposed ADRs.
- **Coverage is a link.** A requirement cites an ADR by a relative Markdown link to its file, which is what `check` counts; a plain `ADR NNNN` is prose.

Everything else ADR 0145 decides stands: ADRs are binding and append-only, the requirements decide nothing, and a requirement that disagrees with an accepted ADR is a defect in the requirement.

## Why

- **A check a machine runs is kept; an instruction an author must remember is not.** The markers were the instruction, and they drifted.
- **The hash, not a number, says what was read.** A marker naming "through 0166" says nothing about an older ADR amended since; the lock reports it as changed.
- **An ADR pull request stays about the decision.** Restating it in the requirements is a separate act of reconciliation, best done for several ADRs at once, and the pending list keeps it from being forgotten.

## Consequences

- Between refreshes the requirements can be behind the ADRs, as they could under 0145. The difference is that `check` names exactly which ADRs, in CI output and locally.
- A pull request that moves an ADR into `docs/adr/superseded/` records it in the same change with `supersede OLD NEW`, or `check` fails. That command changes nothing else in the lock, so pending ADRs stay pending, and a requirement still citing the superseded ADR is pending too until the next refresh cites its replacement. Renaming an ADR still needs a `stamp`.
- The requirements `trace/` files and `.scratch/requirements-rewrite/` checks remain the audit of where each source rule went; the lock does not replace them.

## Rejected

- **Keeping the markers beside the lock.** Two records of the same fact, one checked and one not, disagree.
- **Failing CI on pending ADRs** (`check --fail-stale`). It restores the same-change rule by machine, which is the ceremony this removes.
