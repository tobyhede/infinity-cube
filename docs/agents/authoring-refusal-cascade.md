# Authoring refusal cascade

This topic's rules are in the requirements docs below, which restate the accepted ADRs as a snapshot; ADRs newer than a doc's snapshot marker bind where they differ ([workflow](workflow.md#adrs-and-the-requirements-snapshot)). This page only forwards existing citations of its old path.

- [Guard order and outcomes](../requirements/editing.md#guard-order)
- [Map, Graph and Edge checks](../requirements/maps-and-graphs.md#operations-index)
- [Resource and Space checks](../requirements/space-and-resources.md)

[Source mapping and code notes](../requirements/trace/editing.md) explain where the old guide’s material went.

The [archived guide](../adr/archive/agent-guides/authoring-refusal-cascade.md) is history: the requirements docs and ADRs replace it, and it is not updated.

Remove this page once no source comment, test, configuration or document cites `docs/agents/authoring-refusal-cascade.md`; `grep -rln authoring-refusal-cascade.md --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive . | grep -v '^./docs/agents/authoring-refusal-cascade.md$'` finds them, relative links such as `../agents/authoring-refusal-cascade.md` included.
