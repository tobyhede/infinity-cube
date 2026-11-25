# 02 — One Rust repository contract, run by every store

**Status:** ready-for-agent once rust-host/15 and 01 land (Q1 answered yes)

**Blocked by:** rust-host/15, 01.
**Waits on:** nothing outside this plan: #520, #521 (rust-host 15) and #528 have merged. Lands **instead of** the SQLite-only ports #528's 04, 05, 06 and 12 describe, and before #528's 03 and 13, which this rewrites in its first commit: #528's 03 reads the table file as part of the SQLite adapter, its pending exemptions name this ticket for every contract case, and #528's 13 keeps only the races that are not table cases.

**What to build:** The Rust counterpart of `spaceRepositoryContract` (`test/support/repository-contract.ts:347`): the contract's cases written once in `crates/host/tests/repository_contract/`, generated per store by a `repository_cases!(harness)` macro, as `http_conformance::cases!` generates the HTTP cases per adapter. Each case asserts the contract's absolute answers (values read back after a reopen), never agreement with another store.

- [ ] A `Harness` trait mirrors `RepositoryHarness` (`repository-contract.ts:234-279`): open, reopen as a fresh host, arrange each broken state, remove the Meta identity, write a raw revision, take the Resource ids written since the last call, and recreate a Space's Resource rows before the next row lock. A store that cannot provide a member says so, and the macro emits that case as a test that reports a skip with its reason (never an empty pass), which the ports test counts as an exemption.
- [ ] The Resource-write recording reaches the store of statements behind a `test-support` Cargo feature of `host`, off by default and enabled only by `host`'s dev-dependency on itself. The recreation hook needs the row-lock step 04 adds, so until 04 lands that member is unprovided and the cases needing it (`repository-contract.ts:2444`, both values) are pending exemptions naming 04.
- [ ] The memory store and SQLite run the table. Every case #528's 04, 05, 06 and 12 assigned to SQLite is written here, with its `// Case:` line in the table file.
- [ ] Each looped name (`repository-contract.ts:530`, `:889`, `:2444`) is one case per value.

**Named mutants (on SQLite, each killed by a table case; the PR records which):** aggregate write path replaced by `abort()`; the Space row not deleted on the aggregate path; `delete_resources_except` a no-op; the expected revision ignored on the aggregate path; the revision not advanced on the aggregate path; deletes interleaved with writes (#528's m05a); `clear` leaves Space rows; `exported_revision` dropped when a row is rewritten.
