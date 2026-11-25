# 04 — Port the commit cases to Rust on SQLite

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** A Rust port, on a SQLite file reopened between write and read, of each contract case about commits that 03 lists as pending: successful Space creation and deletion, linking, Resource ownership, large revisions, the single-Space fast path beside a broken Space, and the lifecycle doors (`initialize_aggregate`, `replace_aggregate`, `mark_exported`). Each port carries `// Case: <name>` and asserts what the contract asserts.

- [ ] Each commit case 03 lists for this ticket has a port, and its pending exemption is deleted.
- [ ] A Rust test, not a port, holds the change-order decision: a Resource move listing the receiving Space first commits on the memory store and on SQLite, with the same end state as the same move listing the releasing Space first.
- [ ] The intake corpus's commit cases, which `crates/host/tests/corpus.rs` runs on the memory store, also run on SQLite.
