# 01 — Accept the Rust host ADRs

**Status:** ready-for-human

**Blocked by:** None.

**What to build:** The maintainer reviews ADRs 0155, 0156 and 0157 and accepts, amends or rejects each. Accepting one changes its status to `accepted`, adds `Refines:` lines (0155 refines 0034 and 0124; 0156 refines 0010; 0157 refines 0071) with the matching `Refined by:` on each refined ADR, adds its line to `docs/adr/README.md`, and restates it in its owning requirements doc with the snapshot marker advanced, in the same change (`docs/agents/workflow.md`).

- [ ] Each ADR accepted, amended or rejected by the maintainer.
- [ ] Accepted ones indexed, reciprocal `Refines`/`Refined by` in place, `test/unit/adr-status-blocks.test.ts` green.
- [ ] Storage (0155, 0156) and UI (0157) requirements restated, markers advanced.
