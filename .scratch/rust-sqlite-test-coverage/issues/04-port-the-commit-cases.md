# 04 — Port the commit cases to Rust on SQLite

**Status:** resolved

**Blocked by:** 03.

**What to build:** A Rust port, on a SQLite file reopened between write and read, of each contract case about commits that 03 lists for this ticket: successful Space creation and deletion, a Space Resource referencing a new Space, dropping Resources, Resource ownership and moves, id order with unsorted input, large revisions and the revision ceiling, and the lifecycle doors (`initialize_aggregate`, `replace_aggregate`, `mark_exported`), concurrent first initialization among them. Each port carries its `// Case:` line and asserts what the contract asserts, as absolute values read back from the reopened file, not only as agreement with the memory store.

No SQLite test today commits through the aggregate write path (the `CommitDecision::Write` branch of `commit` in `crates/host/src/sql.rs`); aborting there leaves every Rust test green. These ports are what reach it.

- [x] Each commit case 03 lists for this ticket has a port, and its pending exemption is deleted. The revision-ceiling case's port is 01's test. A commit creating a Space already stored answers a conflict on SQLite, asserted as an absolute answer, not only against the memory store.
- [x] Replacing the `CommitDecision::Write` branch with `std::process::abort()` fails at least one port in the `host` crate (not only `crates/cli/tests/serve.rs`, which already fails on it), and so does each of: deleting no Space row, deleting no dropped Resource row, ignoring the expected revision on that path, not advancing the revision on that path, and running a commit's deletes after its first write. The PR description records each mutant and the port that kills it.
- [x] A Rust test, not a port, holds the change-order decision: a Resource move listing the receiving Space first commits on the memory store and on SQLite, with the same end state, the Resource's row naming the receiving Space, as the same move listing the releasing Space first. Both directions between a lower and a higher Space id.
- [x] A Rust test holds that a Space's exported revision survives a commit that rewrites that Space's row on the aggregate write path (mark it exported, commit a multi-Space change touching it, reopen, read the exported revision).
- [x] `replace_aggregate` over stored Spaces the input drops leaves none of them, read back after a reopen.
- [x] The intake corpus's commit cases, which `crates/host/tests/corpus.rs` runs on the memory store, also run on SQLite.

## Comments

### Resolved (2026-11-26)

The ports are one shared table, `crates/host/tests/repository_contract/` (the maintainer's decision Q1 in `.scratch/rust-postgresql-store/spec.md`): `lifecycle.rs` and `commits.rs` hold each case once, with its `// Case:` line, and `repository_cases!` generates a test per case for each store's harness. `crates/host/tests/sqlite_contract.rs` runs them on a fresh migrated file per case, reopening it before the case's last reads, and `crates/host/tests/memory_contract.rs` on the memory store, where the seven cases needing a reopen, a raw revision or row writes say they were skipped. Resource writes on SQLite are recorded by triggers the harness installs on `resources`.

Non-port cases in the table: the change-order decision in both directions and both orders (`commits_a_move_whichever_space_it_lists_first`), a create of a stored Space (`answers_a_create_of_a_stored_space_as_a_conflict`), the exported revision through an aggregate-path commit, a stale revision on the aggregate path, a Resource id taken from a Space the same commit deletes, and `leaves_no_dropped_space_after_a_replacement_across_a_reopen`. `crates/host/tests/corpus.rs` runs the commit cases on SQLite too.

The ascending-id case failed on the Rust memory store, which kept Resources in the order given (Storage ST-21); `MemorySpaceRepository` now sorts them on install and commit. "Refuses to mark an exported revision above the storage ceiling" is ported as `Revision::new` refusing it: `mark_exported` takes a `Revision`, so the store cannot be handed one.

Mutants, each run with `cargo nextest run -p host`, and the ports that kill them:

- `CommitDecision::Write` replaced by `std::process::abort()`: eight table cases on SQLite, among them `atomically_creates_links_reads_converges_on_and_deletes_a_space` and `moves_an_unchanged_resource_between_spaces_in_one_commit`, and the corpus on SQLite;
- no Space row deleted: `atomically_creates_links_reads_converges_on_and_deletes_a_space`, `adopts_a_resource_id_from_the_space_a_commit_deletes`;
- `delete_resources_except` deleting nothing: `drops_every_resource_when_a_commit_omits_them_all`, `keeps_the_resources_a_commit_names_and_drops_the_rest`, `moves_an_unchanged_resource_between_spaces_in_one_commit`, the corpus on SQLite;
- the expected revision ignored on the aggregate path: `answers_a_stale_revision_on_the_aggregate_path_as_a_conflict` (and on the memory store, the stale-revision port);
- the revision not advanced: nineteen table cases on SQLite;
- deletes run after the first write: `adopts_a_resource_id_from_the_space_a_commit_deletes`, the one test in the crate that fails on it.
