# Drawing an Edge the Graph already holds is refused

Status: accepted
Date: 2026-11-03
Refines: 0032, 0104
Related: 0090

ADR 0032 rejects a duplicate `(from, to)` within one Graph at intake and made the authoring gesture that would create one an idempotent no-op. ADR 0104 repeated that drawing an Edge that already exists changes nothing. The maintainer ruled on 3 November 2026 (ruling C3 in `docs/requirements/DECISIONS.md`) that the gesture is refused instead.

## The decision

- **Drawing an Edge the Graph already holds is refused** with the code `edge-already-exists` and its sentence, and nothing is drawn. The Edge, its Title and its `titleHidden` are untouched.
- The refusal's sentence shows where a surface can carry it, such as the Connect list's row. During a drag the already-connected Resource is marked ineligible (ADR 0090), so no release reaches the refusal.
- Intake still refuses a duplicate Edge within a Graph (`duplicate-graph-edge`), and Edge identity stays `(from, to)` within its Graph (ADR 0104).

## Why

- **A silent no-op reads as a failure.** An author who draws an Edge and sees nothing happen cannot tell a duplicate from a broken gesture; a refusal names the reason.

## Consequences

- The code already refuses (Maps and Graphs MG-61, UI UI-101). `CONTEXT.md` describes the refusal rather than a silent no-op.
