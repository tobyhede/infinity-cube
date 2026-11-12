# 01 — Prove the interface on the hard paths

Status: ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** a throwaway branch, never merged, that runs the interface in [`spec.md`](../spec.md) through five paths in the real application: Reference → Image; Replace on an Image inside a Space embedding, where nested Claims meet application-wide exclusivity; creating an Image through the picker; creating a Space with its new Space; a Markdown Resource reading its text as an asset, Opening with a size hint on a Map and drawing on the Stage. A fake or partial host is fine wherever it does not hide the question. Ur alone does not test the interface.

**Questions to answer:** does `Kept<T>` carry withdrawal on each path; do the commits handed to `exclusively`'s work land while a retained commit, the embedding Space's Map selection and Close included, answers refused; does an outer Claim hold while an inner one runs; can `queued` settle a commit honestly; does a plugin need anything `selected` does not give it, in place of the dropped `graphColor`; can a Markdown Resource read its text as an asset and still draw and size acceptably on a Map and the Stage; does any path need a plugin to act on why a commit was refused, which a display-only `{ refused: string }` cannot tell it?

**Acceptance:**

- Each path runs, or the gap that stopped it is named.
- `spec.md` is corrected, and the ADR too if ownership moved.
- The harness is deleted (`docs/agents/build-tooling.md`), and the findings are recorded here under `## Answer`.
