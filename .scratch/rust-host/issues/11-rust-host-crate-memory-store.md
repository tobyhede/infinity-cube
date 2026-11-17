# 11 — The Rust host crate over a memory store

**Status:** ready-for-agent

**Blocked by:** 08, 10.

**What to build:** `host`: a `SpaceRepository` trait mirroring the TypeScript seam (list, load, load aggregate, commit, store and load asset, initialize, replace, mark exported, load Meta id); a memory implementation; the pure commit decision shared by every store; the HTTP application and product resolution as a `Request -> Response` function (no listener); Import from and Export to an Aggregate directory with Export on quiet and an awaitable stop that flushes; ST-65 honoured by an explicit read context: a commit made to initialize a Space during a working read does not schedule an Export (08's ST-65 case holds it), since the TypeScript host's way of telling them apart is Node-only. Export writes the bytes the TypeScript Export writes (07). A typestate builder requires the directory, id source and clock (ADR 0109).

- [ ] Unit tests for the commit decision and Export scheduling.
- [ ] The corpus's commit cases (07) answer as the TypeScript host does, and its Export bytes match.
- [ ] No listener or Tauri dependency in the crate.
