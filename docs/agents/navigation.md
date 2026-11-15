# Navigation & Browser History

This topic's rules are in the requirements docs below, which restate the accepted ADRs as a snapshot; ADRs newer than a doc's snapshot marker bind where they differ ([workflow](workflow.md#adrs-and-the-requirements-snapshot)). This page only forwards existing citations of its old path.

- [Navigation and presenting](../requirements/navigation.md)

[Source mapping and code notes](../requirements/trace/navigation.md) explain where the old guide’s material went.

The [archived guide](../adr/archive/agent-guides/navigation.md) is history: the requirements docs and ADRs replace it, and it is not updated.

Remove this page once no source comment, test, configuration or document cites `docs/agents/navigation.md`; `grep -rln navigation.md --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive . | grep -v '^./docs/agents/navigation.md$'` finds them, relative links such as `../agents/navigation.md` included.
