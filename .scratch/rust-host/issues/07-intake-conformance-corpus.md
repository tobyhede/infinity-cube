# 07 — An intake conformance corpus, run against the TypeScript intake

**Status:** ready-for-agent

**Blocked by:** None (ADR 0156 proposed; the corpus is useful to the TypeScript intake either way).

**What to build:** First, give the TypeScript intake structured refusals. Today a refusal does not say where it is in a form a runner can compare: `invalid-shape` carries only a message (`packages/graph/src/space.ts`), `SpaceReferenceError` carries a kind and the id it failed on but no file or field (`packages/graph/src/validate.ts`), and a run's refusal is a list of strings (`RunRefusal` in `src/run/run.ts`). Each refusal gains `{ kind, file, id?, field? }` beside its message: `field` from the Zod issue's path, and an Edge, which has no id, located by its Graph's id with its `from` and `to`. The messages and what the CLI prints do not change.

Then a tracked corpus of two kinds of case, each with a small manifest of its expected answer: accepted, or refused with a list of `{ kind, file, id?, field? }`. Kinds are a closed list named from the intake's existing error types, not from message text.

- **Directory cases:** an Aggregate directory, read through the same Import `cube check` uses.
- **Commit cases** (ADR 0156 holds commits to the corpus too): a base directory, a commit body as the browser sends it to `POST /api/spaces`, and the expected answer: accepted with the Space's next state, or refused with its kind and location. The runner Imports the base into a memory store and applies the commit through the same commit path the HTTP application uses.

Start from the JSON Schema examples in `docs/schema/` and add what schemas cannot say: unresolved ids, duplicate ids, duplicate Edges in a Graph, Edge endpoints off the Map, a placement's Map content the plugin refuses, a Space directory named other than its id, and an unknown kind kept; and for commits, a commit that leaves a dangling reference, one that duplicates an Edge, and one whose Resource content its plugin refuses.

**Export bytes.** For each accepted directory case, also record the bytes the TypeScript Export writes for it (key order, indentation, trailing newline), so the Rust Export can be held to write the same files and the first Edit after the swap (13) does not rewrite every file of a talk. A case whose files are already as Export writes them is expected to round-trip unchanged.

- [ ] TypeScript intake refusals carry `{ kind, file, id?, field? }`, with Edges located as (Graph id, `from`, `to`); existing messages unchanged.
- [ ] Corpus format, for directory and commit cases and the expected Export bytes, documented in the corpus's README, language-neutral so a Rust runner can read it.
- [ ] One case per refusal kind intake has today, accepted cases for each listed plugin, and commit cases accepted and refused.
- [ ] Runner green against the TypeScript intake; 10 and 11 run the same corpus.
