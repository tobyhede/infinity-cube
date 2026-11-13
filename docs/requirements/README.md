# Requirements

These seven documents are the binding rules for InfinityCube. A behaviour change updates its document in the same commit. Status and evidence distinguish the intended behaviour from what is built.

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

[Trace files](trace/) record the sources and disposition of old rules. [Conflict records](conflicts/) and [rewrite decisions](DECISIONS.md) preserve the rewrite’s rulings. The [ADR archive](../adr/README.md) is history, not binding.

Rule identifiers are append-only. Keep removed rules as tombstones and never renumber surviving rules. Each document lists known implementation gaps under Bugs or marks them not built; those gaps do not weaken its requirements.
