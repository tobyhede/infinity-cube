# Clip an Open Mermaid diagram wider than its rect

Status: ready-for-agent

**What to build:** set `useMaxWidth: false` in `packages/plugin-mermaid/src/mermaid.ts` `MERMAID_SETTINGS`, so a diagram keeps the scale its text was laid out at and the rect clips what overflows.

**Why:** ruling Rendering C3 (20 November 2026): ADR 0149 clips Open content that does not fit, and a diagram is not the picture it excepts. Rendering RD-5 is marked bug: code differs until this lands.

**Acceptance criteria:**

- [ ] An end-to-end test resizes an Open Mermaid Resource narrower than its diagram and asserts the diagram keeps its width and is clipped at the rect.
- [ ] RD-5's Mermaid case and its Bugs line move to **built**, citing that test; SR-67's pointer is updated.
