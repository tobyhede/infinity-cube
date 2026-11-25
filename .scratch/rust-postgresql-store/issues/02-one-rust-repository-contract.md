# 02 — One Rust repository contract, run by every store

**Status:** blocked (needs-info: Q1)

**Blocked by:** rust-host 15 (#520, #521) and #528's 01 merging; 01. Lands **instead of** the SQLite-only ports #528's 04, 05, 06 and 12 describe, which are rewritten to add their cases to this table (a change to #528's tickets made in this ticket's first commit, before any of them starts).

**What to build:** The Rust counterpart of `spaceRepositoryContract` (`test/support/repository-contract.ts:347`): the contract's cases written once in `crates/host/tests/repository_contract/`, generated per store by a `repository_cases!(harness)` macro, as `http_conformance::cases!` generates the HTTP cases per adapter. Each case asserts the contract's absolute answers (values read back after a reopen), never agreement with another store.

- [ ] A `Harness` trait mirrors `RepositoryHarness` (`repository-contract.ts:234-280`): open, reopen as a fresh host, arrange each broken state, remove the Meta identity, write a raw revision, take the Resource ids written since the last call, and recreate a Space's Resource rows before the next row lock. A store that cannot represent a member says so, and the macro emits the case as a written skip with its reason (never a passing empty test), which the ports test (03) counts as an exemption.
- [ ] The instrumentation the last two members need (`recordResourceWrites`, `recreatingBeforeRowLock` in TypeScript) reaches the store of statements behind a `test-support` Cargo feature of `host`, off by default and enabled only by `host`'s own dev-dependency on itself; no test-only code in the default build.
- [ ] The memory store and SQLite run the table. Every case #528's 04, 05, 06 and 12 assigned to SQLite is written here instead, with its `// Case:` line in the table file, and those tickets keep only SQLite's own cases.
- [ ] Each of the three looped names (`repository-contract.ts:530`, `:889`, `:2444`) is one case per value.
- [ ] The SQLite mutants #528's 04 names (aggregate write path aborted, Space row not deleted, dropped Resources not deleted, expected revision ignored on that path, revision not advanced on that path, deletes interleaved with writes) each fail at least one table case on SQLite; the PR records which.
