# 06 — The repository contract on PostgreSQL

**Status:** ready-for-agent once 05 lands

**Blocked by:** 03, 05.

**What to build:** `crates/host/tests/postgres.rs` invokes `repository_cases!` with a PostgreSQL harness, so every contract case runs on a fresh database, reopened between write and read through a new pool, as the TypeScript harness reopens through a new client (`test/integration/postgres-space-repository.test.ts:64-68`). This ticket adds `postgres.rs` to 03's adapter and the check that it invokes `repository_cases!(`.

- [ ] The harness supplies every member the TypeScript PostgreSQL harness does (`:31-103`); no contract case skips on PostgreSQL.
- [ ] Every contract case passes but the one exempt for change order, and 03's pending exemptions for the contract are deleted.
- [ ] Content `jsonb` reorders passes by the contract's own comparison (the comment above `repository-contract.ts:1137`; "ignores object-key insertion order when classifying initialization", `:677`), and a Rust test commits a missing-plugin Resource and Map content with keys out of `jsonb`'s order and asserts what loads back and the bytes an Export of it writes.
- [ ] A test creates Spaces in descending id order, updates the lowest (so its row moves in the heap), and asserts `load_aggregate` and `list_spaces` answer in ascending id order.
- [ ] The revision-ceiling and broken-listing behaviours #528's 01 fixed hold through their table cases.

**Named mutants (on `sql/postgres.rs`, each killed by this ticket's tests):** the Space row not deleted; `delete_resources_except` deleting every row or none; `exported_revision` dropped when a Space row is rewritten; assets stored with `DO UPDATE` instead of `DO NOTHING`; `spaces` read without `ORDER BY id`; `clear` leaving Space rows; `replace_aggregate` decoding the rows it replaces. Equivalent under `ON DELETE CASCADE` (`202609200949_rename_thing_to_resource.sql:14-18`), recorded as such: a Space delete or `clear` leaving that Space's Resource rows.
