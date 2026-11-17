# 02 — Opening a Space never writes the directory (ST-65)

**Status:** resolved

**Blocked by:** None.

**What to build:** Under Running, the first working read's initialization (MG-74) is committed to the memory store but does not schedule an Export. Today every commit the store accepts schedules one (`src/run/run.ts`, `ObservedRepository`), so viewing a talk can rewrite its files. Fix it in the TypeScript host now; the Rust host inherits the rule through the conformance suite (07, 08).

- [x] A failing test first: run a directory, load a Space that has no Map, stop; the directory is byte-for-byte unchanged.
- [x] The next Edit's Export writes the initialization.
- [x] ST-65 status in `docs/requirements/storage.md` moves from `bug: code differs` to `built`, with the test as evidence.
