# 07 — Rust property tests for commits

**Status:** resolved

**Blocked by:** 04.

**What to build:** Property tests with `proptest`, already a `host` dev-dependency used only in `src/product.rs`. They compare the Rust stores with each other, and with `decide_commit`; they cannot catch a defect both Rust stores share through `decide_commit` (the revision ceiling was one), which is why 04's ports, holding TypeScript's answers, come first.

- [x] Generated single-Space updates: the fast path (`decide_single_space`) either hands the update on or answers exactly as `decide_commit` does. `decide_single_space` is `pub(crate)`, so this property lives inside the `host` crate.
- [x] Generated commit sequences, Space creation, a Space Resource referencing a new Space, deletion, Resource moves in either order and revisions near the ceiling included, give the same answer at every step and the same final aggregate on the memory store and on a SQLite file reopened at the end.
- [x] Generated Spaces include Resources in an order that is not ascending by id, and each store's answer is asserted in ascending id order (ST-21) before the stores are compared; no normalisation removes the order. The Rust memory store appears to answer a Space's Resources as committed (`crates/host/src/memory.rs` stores and returns the snapshot as given; not yet run), which ST-21 does not allow: if so, a failing test is written first and the memory store fixed here.
- [x] Each of the five fixed differential scripts in `crates/host/tests/sqlite.rs` is deleted when a generator produces its commit shape, or keeps a comment naming the shape no generator produces.

## Comments

### Resolved (2026-11-26)

- `crates/host/src/commit/tests.rs`' `hands_an_update_on_or_answers_it_as_decide_commit_does` generates a single update (a rename, a Map, Graph or default Map moved, a placement of a Resource it does not hold, a Resource added or its kind changed, a selection changed, a Space no store holds), stored revisions low or at the ceiling, an exported revision or none, an expected revision at, around, at zero or at the ceiling, and a Meta identity or none: `decide_single_space` hands it on or answers exactly as `decide_commit` does. Mutants of `decide_single_space` it kills: a conflict forgetting the stored Space, the written Space dropping its exported revision, no ceiling check, and a write to a store with no Meta identity.
- `crates/host/tests/store_properties.rs` generates up to eleven steps from Meta and two linked Spaces: renames and Resources added or dropped at a current, stale, ahead or near-ceiling revision; a Resource moved between Spaces, the receiver listed first or last; a Space created, linked from Meta or not, one already stored among them; a Space deleted, Meta among them, unlinked or not; a Graph Meta selects removed. Every snapshot lists its Resources out of ascending order. Each step answers the same on both stores, each conflict's Space and each stored Space lists its Resources ascending on each store before the two are compared, and the SQLite file, read again by a fresh repository, holds the memory store's aggregate. `the_generated_steps_reach_every_kind_of_answer` holds that the steps reach a commit, a conflict and a refusal. The memory store sorted Resources by id since 04 (`in_id_order`). Mutants it kills: the memory store keeping Resources as committed, and SQLite reading a Space's or every Resource in descending order.
- `crates/host/tests/sqlite.rs`: `answer_commits_the_same_and_keep_what_they_wrote` is deleted, its renames, Meta deletion and create of a stored Space generated. The others in `given_the_memory_store_and_a_sqlite_file` each name what no generator produces: reads of the tracked fixture, assets, the lifecycle doors and marking exported, an uninitialized store.
