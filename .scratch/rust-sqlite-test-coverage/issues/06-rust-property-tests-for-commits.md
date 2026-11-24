# 06: Property tests for Rust commit paths

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** Rust's commit paths are held by generated inputs, as the TypeScript side's are by fast-check. Two properties:

1. The single-Space fast path either hands an update on to the general path or decides exactly what `decide_commit` decides for the same input.
2. Any generated sequence of commits gives the same answer at every step, and the same final aggregate, on the memory store and the SQLite repository.

`proptest` is already a host dev-dependency.

- [ ] Both properties run in the default nextest run, with a case count that keeps the `rust` job's time reasonable, and print a reproducible seed on failure.
- [ ] Generators cover creates, links, deletes, renames, Resource moves, stale revisions and refused operations, not only renames.
- [ ] Each property was seen to fail against a deliberately broken fast path and a deliberately broken SQL write (noted in Comments).
- [ ] The five fixed differential scripts are kept only where they pin a case the generators do not reach, and each says which.
