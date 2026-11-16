# 11 — The Rust host crate over a memory store

**Status:** ready-for-agent

**Blocked by:** 08, 10.

**What to build:** `host`: a `SpaceRepository` trait mirroring the TypeScript seam (list, load, load aggregate, commit, store and load asset, initialize, replace, mark exported, load Meta id); a memory implementation; the pure commit decision shared by every store; the HTTP application and product resolution as a `Request -> Response` function (no listener); Import from and Export to an Aggregate directory with Export on quiet and an awaitable stop that flushes; ST-65 honoured. A typestate builder requires the directory, id source and clock (ADR 0109).

- [ ] Unit tests for the commit decision and Export scheduling.
- [ ] No listener or Tauri dependency in the crate.
