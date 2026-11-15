# Requirements

These seven documents restate InfinityCube's accepted ADRs in current words, as a snapshot. They decide nothing themselves: [ADRs](../adr/README.md) are binding and append-only, and a requirement that disagrees with an accepted ADR is a defect in the requirement. Each document opens with a snapshot marker naming the commit it was checked against, the date, and the highest ADR it incorporates; an ADR accepted after that marker binds where it differs, until the document is updated. Accepting an ADR updates the owning document and its marker in the same change, and a behaviour change updates its document in the same commit ([workflow](../agents/workflow.md#adrs-and-the-requirements-snapshot)). Status and evidence distinguish the intended behaviour from what is built. Presentation-only detail is left out (drafting rule 6 in [DECISIONS.md](DECISIONS.md)), but where an accepted ADR decides it, that ADR still binds.

| Task | Read |
| --- | --- |
| Space identity, Resource kinds, Titles and references | [Space and Resources](space-and-resources.md) |
| Map membership, Graphs, placement, size and layout | [Maps and Graphs](maps-and-graphs.md) |
| Edits, completion, drafts, refusals and recovery | [Editing](editing.md) |
| Stored formats, repositories, HTTP, CLI and mounting | [Storage and hosts](storage.md) |
| Drawn Maps, camera, geometry and projections | [Rendering](rendering.md) |
| Commands, controls, focus and announcements | [UI](ui.md) |
| Selection, URLs, open Spaces and presenting | [Navigation](navigation.md) |

[CONTEXT.md](../../CONTEXT.md) defines names. [AGENTS.md](../../AGENTS.md) routes implementation tasks and links engineering guidance.

Read a document in this order: [CONTEXT.md](../../CONTEXT.md) for terms, the owning document, then any ADR numbered above its marker. Open an older ADR for the full argument, a rejected alternative or the history.

[Trace files](trace/) record the sources and disposition of old rules. [Conflict records](conflicts/) and [rewrite decisions](DECISIONS.md) preserve the rewrite’s rulings; a ruling that changes what an accepted ADR decides is recorded as a new ADR. The product guides these documents replaced are kept, as history, under [`docs/adr/archive/agent-guides/`](../adr/archive/agent-guides/).

Rule identifiers are append-only. Keep removed rules as tombstones and never renumber surviving rules. Each document lists known implementation gaps under Bugs or marks them not built; those gaps do not weaken its requirements.
