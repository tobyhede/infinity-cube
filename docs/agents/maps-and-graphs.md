# Maps and Graphs

This topic's rules are in the requirements docs below; [workflow](workflow.md#adrs-and-the-requirements-snapshot) says how they relate to the ADRs. This page only forwards existing citations of its old path.

- [Maps and Graphs](../requirements/maps-and-graphs.md)

[Source mapping and code notes](../requirements/trace/maps-and-graphs.md) explain where the old guide’s material went.

The [archived guide](../adr/archive/agent-guides/maps-and-graphs.md) is history: the requirements docs and ADRs replace it, and it is not updated.

Remove this page once no source comment, test, configuration or document cites `docs/agents/maps-and-graphs.md`; `grep -rln maps-and-graphs.md --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive . | grep -v '^./docs/agents/maps-and-graphs.md$'` finds them, relative links such as `../agents/maps-and-graphs.md` included.
