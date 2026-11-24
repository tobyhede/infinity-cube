# 07: Rows read across runtimes, in both directions

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** A SQLite file written by either runtime reads correctly in the other. Today Rust reads a checked-in dump of TypeScript-written rows, and nothing checks that dump is current. TypeScript reads Rust-written rows only in the CI restart proof, after one edit to a Space TypeScript seeded.

- [ ] A Rust test runs a script on a migrated file (initialize from Default Content, store an asset, create and link a Space, delete a Space, edit a Resource) and dumps the rows to a checked-in fixture.
- [ ] A TypeScript test replays that dump into a migrated file and compares `loadAggregate`, `listSpaces` and `loadAsset` with the same script run on the memory store.
- [ ] Each dump has a staleness check: regenerating it and comparing with the checked-in copy, with timestamps normalised, fails CI and names the command that regenerates it.
- [ ] The fixture covers Resources of a kind no plugin lists and hidden Edges.
