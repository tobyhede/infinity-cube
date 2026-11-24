# 04: Port broken stored state and error classification

**Status:** ready-for-agent

**Blocked by:** 02.

**What to build:** Every broken-stored-state variant and every error-classification rule is held on both runtimes. Broken states include: no Meta Space, a Meta id naming no Space, a Meta id that is not a UUID, a Space document or Resource document that is not JSON, a bad revision, and a non-canonical exported revision. Error classification decides whether a failure answers 503 (the browser retries) or 500, and whether start-up retries or stops, so a wrong answer changes product behaviour. It is untested in Rust today.

- [ ] Every broken-state variant is a shared case asserting `BrokenStoredState` for loads and for commits, on both runtimes' SQL stores.
- [ ] Classification cases cover a file with its tables missing (unclassified, HTTP 500), a closed repository (unavailable), a busy file (unavailable, 503), and a constraint failure. Each asserts both the repository answer and the HTTP status.
- [ ] Cases that only a SQL store can produce are marked as such in the shared format, so the memory stores skip them visibly rather than silently.
