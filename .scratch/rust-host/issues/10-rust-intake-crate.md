# 10 — The Rust intake crate

**Status:** resolved

**Blocked by:** 07, 09.

**What to build:** `intake`: parse an Aggregate's files (given as bytes by path, no IO), validate references and each listed plugin's content and Map content, index the Space. Newtype ids (`SpaceId`, `ResourceId`, `MapId`, `GraphId`; an Edge has no id, since its identity is its endpoints, so it is located as its Graph's id with `from` and `to`, as in 07), a `thiserror` error enum whose variants carry kind, file, id and field, an unknown kind kept, and a Rust plugin list mirroring `packages/plugins`. A test runner reads the corpus's directory cases from 07; its commit cases run in 11, where the commit path is.

- [x] Every corpus case answers as the TypeScript intake does.
- [x] No IO, no async, no `unwrap`/`expect`/`panic!`.

Every directory case of the corpus answers as the TypeScript intake does (`crates/intake/tests/conformance.rs`, no known divergences); the commit cases run in 11. `unwrap`, `expect` and `panic!` appear only in tests. Where an answer depends on the engine (lone surrogates, nesting depth, URL parsing, key order) is in the crate docs and Storage ST-118. The commit path's half of intake (`decode_space_snapshot`, the stored document's shape, `refused_unrooted_space_ids`) is built here ahead of 11; no commit case runs against it until 11 does.
