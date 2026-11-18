# 05: Share Open sizing and rail commands

**What to build:** if ticket 02's ADR puts them in scope, the Markdown and Mermaid plugins take Opening with a size hint (measuring the laid-out content, bounded by the load wait) and their Edit, Done, Open and Close rail commands from the same shared place as their edit. A person Opening either kind of Resource sees the same sizing and the same rail as today. If the ADR keeps these in each plugin, this ticket is closed as `wontfix`.

**Blocked by:** 04 (Mermaid edits through the shared text editing), and 02's decision that these are shared.

**Status:** ready-for-agent

- [ ] Open sizing and the rail commands exist once and both plugins use them.
- [ ] The suite from 01 gains Open scenarios (a size hint committed, no hint after the load wait) and passes for both plugins.
- [ ] Both plugins' e2e specs pass in CI.
