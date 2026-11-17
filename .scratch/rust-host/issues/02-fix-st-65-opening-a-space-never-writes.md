# 02 — Opening a Space never writes the directory (ST-65)

**Status:** resolved

**Blocked by:** None.

**What to build:** Under Running, the first working read's initialization (MG-74) is committed to the memory store but does not schedule an Export. Today every commit the store accepts schedules one (`src/run/run.ts`, `ObservedRepository`), so viewing a talk can rewrite its files. Fix it in the TypeScript host now; the Rust host inherits the rule through the conformance suite (07, 08).

- [x] A failing test first: run a directory, load a Space that has no Map, stop; the directory is byte-for-byte unchanged.
- [x] The next Edit's Export writes the initialization.
- [x] ST-65 status in `docs/requirements/storage.md` moves from `bug: code differs` to `built`, with the test as evidence.

## Answer

Fixed in the TypeScript host. `readsMarked` (`src/run/run.ts`) answers every `GET` and `HEAD` request inside a read context, and the run's memory store schedules an Export only for a commit made outside one, so the first working read's initialization is committed but not written; the next Edit's Export writes it, since a write reads the whole store. Held by `test/unit/run.test.ts`: "writes nothing when opening a Space initializes it and nothing is edited (ST-65)", "writes the initialization with the next Edit (ST-65)" and "initializes a Space with no Map when it is read, and writes those same ids with the next Edit (ST-65)". ST-65 in `docs/requirements/storage.md` is `built`.
