# UI Foundation

This topic's rules are in the requirements docs below; [workflow](workflow.md#adrs-and-the-requirements-snapshot) says how they relate to the ADRs. This page only forwards existing citations of its old path.

- [Controls, keyboard and focus](../requirements/ui.md)
- [Drawing and camera](../requirements/rendering.md)

[Source mapping and code notes](../requirements/trace/ui.md) explain where the old guide’s material went.

The [archived guide](../adr/archive/agent-guides/ui.md) is history: the requirements docs and ADRs replace it, and it is not updated.

Remove this page once no source comment, test, configuration or document cites `docs/agents/ui.md`; `grep -rln ui.md --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive . | grep -v '^./docs/agents/ui.md$'` finds them, relative links such as `../agents/ui.md` included.
