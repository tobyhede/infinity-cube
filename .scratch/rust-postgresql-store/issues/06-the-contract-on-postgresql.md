# 06 — The repository contract on PostgreSQL

**Status:** ready-for-agent once 05 lands

**Blocked by:** 03, 05.

**What to build:** `crates/host/tests/postgres.rs` invokes `repository_cases!` with a PostgreSQL harness, so every contract case runs on a fresh PostgreSQL database, reopened between write and read through a new pool, as the TypeScript harness reopens through a new client (`test/integration/postgres-space-repository.test.ts:47-68`).

- [ ] The harness supplies every member the TypeScript PostgreSQL harness does (`:31-99`): reopen, both broken states, Meta removal, raw revision writes, Resource-write recording and recreation before the row lock. No contract case skips on PostgreSQL.
- [ ] Every contract case passes but the one exempt for change order, and 03's pending exemptions for the contract are deleted.
- [ ] Cases whose content `jsonb` reorders (the contract notes it in the comment above `repository-contract.ts:1137`; "ignores object-key insertion order when classifying initialization", `:677`) pass on PostgreSQL by the contract's own comparison, and a Rust test commits a missing-plugin Resource and Map content with keys out of `jsonb`'s order and asserts what loads back and what an Export of it writes.
- [ ] The revision-ceiling and broken-listing behaviours #528's 01 fixed hold on PostgreSQL through their table cases.

**Named mutants (on `sql/postgres.rs`):** Space row not deleted; dropped Resources not deleted; `delete_resources_except` deletes every row; `exported_revision` dropped when a Space row is rewritten; assets stored with `DO UPDATE` instead of `DO NOTHING`; `spaces` read without `ORDER BY id`; `clear` leaves Space rows; `replace_aggregate` decodes the rows it replaces.
