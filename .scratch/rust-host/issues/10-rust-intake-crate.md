# 10 — The Rust intake crate

**Status:** ready-for-agent

**Blocked by:** 07, 09.

**What to build:** `intake`: parse an Aggregate's files (given as bytes by path, no IO), validate references and each listed plugin's content and Map content, index the Space. Newtype ids (`SpaceId`, `ResourceId`, `MapId`, `GraphId`; an Edge has no id, since its identity is its endpoints, so it is located as its Graph's id with `from` and `to`, as in 07), a `thiserror` error enum whose variants carry kind, file, id and field, an unknown kind kept, and a Rust plugin list mirroring `packages/plugins`. A test runner reads the corpus's directory cases from 07; its commit cases run in 11, where the commit path is.

- [ ] Every corpus case answers as the TypeScript intake does.
- [ ] No IO, no async, no `unwrap`/`expect`/`panic!`.
