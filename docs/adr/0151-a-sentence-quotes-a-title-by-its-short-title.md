# A sentence quotes a Title by its short Title

Status: accepted
Date: 2026-11-12
Refines: 0083
Related: 0065, 0104

ADR 0083 made the first Title Line a Resource's name and had every surface that lists or refers to a Resource show that name and nothing else, the Delete question and every accessible name included. A sentence that quotes only the first line of a multi-line Title reads as if that line were the whole Title. The maintainer ruled on 12 November 2026 (ruling UI C3 in `docs/requirements/DECISIONS.md`).

## The decision

- **Wherever a sentence quotes a Title, it uses the short Title**: the first Title Line, plus "…" when more lines follow. This covers questions such as the Delete question, notices, and Edge labels and their accessible names.
- **Controls, list rows and chrome use the first line alone**, as ADR 0083 decides.

## Why

- **A part of the Title must never read as the whole of it.** In a sentence the ellipsis says more lines follow; in a control or a row the name is a label, and the ellipsis would be noise.

## Consequences

- Code differs today: the delete questions and Edge labels use the short Title, but the enter, exit and open notices, the `resource-has-references` refusal and the drawn-Space failure notice quote the bare name (UI UI-99).
