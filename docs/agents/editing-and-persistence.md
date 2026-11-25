# Editing & Persistence

This topic's rules are in the requirements docs below; [workflow](workflow.md#adrs-and-the-requirements-snapshot) says how they relate to the ADRs. This page only forwards existing citations of its old path.

- [Editing](../requirements/editing.md)
- [Storage and hosts](../requirements/storage.md)
- [Space and Resources](../requirements/space-and-resources.md)

[Source mapping and code notes](../requirements/trace/editing.md) explain where the old guide’s material went.

The [archived guide](../adr/archive/agent-guides/editing-and-persistence.md) is history: the requirements docs and ADRs replace it, and it is not updated.

Remove this page once no source comment, test, configuration or document cites `docs/agents/editing-and-persistence.md`; `grep -rln editing-and-persistence.md --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive . | grep -v '^./docs/agents/editing-and-persistence.md$'` finds them, relative links such as `../agents/editing-and-persistence.md` included.
