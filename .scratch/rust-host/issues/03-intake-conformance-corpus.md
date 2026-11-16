# 03 — An intake conformance corpus, run against the TypeScript intake

**Status:** ready-for-agent

**Blocked by:** None (ADR 0156 proposed; the corpus is useful to the TypeScript intake either way).

**What to build:** A tracked corpus of Aggregate directories, each with a small manifest of its expected answer: accepted, or refused with a list of `{ kind, file, id?, field? }`. Kinds are a closed list named from the intake's existing error types, not from message text. A Vitest runner reads every case through the same Import `cube check` uses and compares. Start from the JSON Schema examples in `docs/schema/` and add what schemas cannot say: unresolved ids, duplicate ids, duplicate Edges in a Graph, Edge endpoints off the Map, a placement's Map content the plugin refuses, a Space directory named other than its id, and an unknown kind kept.

- [ ] Corpus format documented in the corpus's README, language-neutral so a Rust runner can read it.
- [ ] One case per refusal kind intake has today, and accepted cases for each listed plugin.
- [ ] Runner green against the TypeScript intake.
