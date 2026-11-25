# 04 — Port the commit cases to Rust on SQLite

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** A Rust port, on a SQLite file reopened between write and read, of each contract case about commits that 03 lists for this ticket: successful Space creation and deletion, linking, dropping Resources, Resource ownership and moves, id order with unsorted input, large revisions and the revision ceiling, and the lifecycle doors (`initialize_aggregate`, `replace_aggregate`, `mark_exported`), concurrent first initialization among them. Each port carries its `// Case:` line and asserts what the contract asserts, as absolute values read back from the reopened file, not only as agreement with the memory store.

No SQLite test today commits through the aggregate write path (the `CommitDecision::Write` branch of `commit` in `crates/host/src/sql.rs`); aborting there leaves every Rust test green. These ports are what reach it.

- [ ] Each commit case 03 lists for this ticket has a port, and its pending exemption is deleted. The revision-ceiling case's port is 01's test. A commit creating a Space already stored answers a conflict on SQLite, asserted as an absolute answer, not only against the memory store.
- [ ] Replacing the `CommitDecision::Write` branch with `std::process::abort()` fails at least one port in the `host` crate (not only `crates/cli/tests/serve.rs`, which already fails on it), and so does each of: deleting no Space row, deleting no dropped Resource row, ignoring the expected revision on that path, not advancing the revision on that path, and running a commit's deletes after its first write. The PR description records each mutant and the port that kills it.
- [ ] A Rust test, not a port, holds the change-order decision: a Resource move listing the receiving Space first commits on the memory store and on SQLite, with the same end state, the Resource's row naming the receiving Space, as the same move listing the releasing Space first. Both directions between a lower and a higher Space id.
- [ ] A Rust test holds that a Space's exported revision survives a commit that rewrites that Space's row on the aggregate write path (mark it exported, commit a multi-Space change touching it, reopen, read the exported revision).
- [ ] `replace_aggregate` over stored Spaces the input drops leaves none of them, read back after a reopen.
- [ ] The intake corpus's commit cases, which `crates/host/tests/corpus.rs` runs on the memory store, also run on SQLite.
