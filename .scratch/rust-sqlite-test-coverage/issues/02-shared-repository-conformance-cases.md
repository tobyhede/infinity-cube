# 02: Shared repository conformance cases (tracer)

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** Repository behaviour is defined once and run by both runtimes, as the HTTP conformance cases already are. A language-neutral case format holds a starting state (seeded through the two lifecycle doors), a sequence of repository operations, and the expected answers and resulting aggregate. The TypeScript repository contract runs each case against its memory, SQLite and PostgreSQL stores. The Rust host runs each case against its memory store and its SQLite repository. A ports test fails CI for any case with no Rust port unless it is exempted with a reason, as the HTTP conformance ports test does.

The tracer moves one group end to end: the lifecycle doors (initialize once, replace, mark exported, Meta id), including the answers for a store that is already initialised and one that is empty.

- [ ] One case format, documented beside the HTTP conformance cases, that both runtimes read.
- [ ] The lifecycle-door cases live in that format. The TypeScript contract's copies of them are removed, not kept beside it.
- [ ] Every case runs on TypeScript memory, SQLite and PostgreSQL, and on Rust memory and SQLite, in CI.
- [ ] A ports test lists every case and fails for one with no Rust port and no stated exemption.
- [ ] Any disagreement the cases expose between the runtimes is fixed or recorded with why.
