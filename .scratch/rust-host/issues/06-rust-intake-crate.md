# 06 — The Rust intake crate

**Status:** ready-for-agent

**Blocked by:** 03, 05.

**What to build:** `intake`: parse an Aggregate's files (given as bytes by path, no IO), validate references and each listed plugin's content and Map content, index the Space. Newtype ids (`SpaceId`, `ResourceId`, `MapId`, `GraphId`, `EdgeId`), a `thiserror` error enum whose variants carry kind, file, id and field, an unknown kind kept, and a Rust plugin list mirroring `packages/plugins`. A test runner reads the corpus from 03.

- [ ] Every corpus case answers as the TypeScript intake does.
- [ ] No IO, no async, no `unwrap`/`expect`/`panic!`.
