# Sentences an author reads write Space capitalised

Status: ready-for-agent

**What to build:** in `packages/app/src/authoring-refusal.ts` and the persistence sentences, write Space and Space Resource capitalised, as Resource, Map and Graph already are ("Two Spaces in this edit share one identity.", "A Space Resource points at a Map that no longer exists.", and so on).

**Why:** ruling UI C7 (20 November 2026): `CONTEXT.md` capitalises domain terms, and lower-case "space" reads as a different word from the Space ADR 0164 says a person is shown. UI-111 is bug: code differs until this lands. Coordinate with ticket 03, which rewrites one of these sentences.

**Acceptance criteria:**

- [ ] A test asserts the case of every sentence that names a Space or Space Resource.
- [ ] UI-111's capitalisation clause moves to **built**.
