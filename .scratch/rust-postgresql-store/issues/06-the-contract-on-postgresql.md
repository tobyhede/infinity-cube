# 06 — The repository contract on PostgreSQL

**Status:** ready-for-agent

**Blocked by:** 03, 05.

**What to build:** `crates/host/tests/postgres.rs` invokes `repository_cases!` with a PostgreSQL harness, so every contract case runs on a fresh database, reopened between write and read through a new pool, as the TypeScript harness reopens through a new client (`test/integration/postgres-space-repository.test.ts:64-68`). This ticket adds `postgres.rs` to 03's adapter and the check that it invokes `repository_cases!(`.

- [ ] The harness supplies every member the TypeScript PostgreSQL harness does (`:31-103`); no contract case skips on PostgreSQL.
- [ ] Every contract case passes but the one exempt for change order, and 03's pending exemptions for the contract are deleted.
- [ ] Content `jsonb` reorders passes by the contract's own comparison (the comment above `repository-contract.ts:1137`; "ignores object-key insertion order when classifying initialization", `:677`), and a Rust test commits a missing-plugin Resource and Map content with keys out of `jsonb`'s order and asserts what loads back and the bytes an Export of it writes.
- [ ] A test creates Spaces in descending id order, updates the lowest (so its row moves in the heap), and asserts `load_aggregate` and `list_spaces` answer in ascending id order.
- [ ] The revision-ceiling and broken-listing behaviours #528's 01 fixed hold through their table cases.

**Named mutants (on `sql/postgres.rs`, each killed by this ticket's tests):** the Space row not deleted; `delete_resources_except` deleting every row or none; `exported_revision` dropped when a Space row is rewritten; assets stored with `DO UPDATE` instead of `DO NOTHING`; `spaces` read without `ORDER BY id`; `clear` leaving Space rows; `replace_aggregate` decoding the rows it replaces. Equivalent under `ON DELETE CASCADE` (`202609200949_rename_thing_to_resource.sql:14-18`), recorded as such: a Space delete or `clear` leaving that Space's Resource rows.

## Comments

**2026-11-28, implement-tickets run.** Built on PR #561 (`feat/rust-postgresql-store-06-the-contract-on-postgresql`, based on 03's branch, head `35eb408b`). `CI passed` is green. The build reports every acceptance criterion met: the harness provides every member, every contract case passes on PostgreSQL but the one change-order exemption, the `pending('06')` exemptions are gone (tally 79 ported, 100 pending), and each named mutant was killed by a hand mutant run against PostgreSQL 14.19 locally. It added no table case for deleting a Space at the revision ceiling: the existing table cases pass and `decide_commit`'s unit tests hold that rule.

The independent review left two minor findings, and fix round 1 stopped before it finished:
- **F1, not finished.** The jsonb test at `crates/host/tests/postgres.rs` seeds the content only through `initialize_aggregate`, never through `commit`, so the commit path's jsonb order and Export bytes are not pinned. The fix agent's uncommitted edit, a second test that seeds, commits an update, and checks jsonb order and Export bytes through a shared helper, was saved unchecked to `wip/rust-postgresql-store-06-fix-r1` (`2eb4c1ae`, on top of `35eb408b`). To finish: cherry-pick or redo it on the PR branch, run it against PostgreSQL, and push.
- **F2, open.** PR #561's body says each named mutant was killed but not by which test. Spec Q12 requires naming the killing test for each. Likely killers: Space row not deleted → the contract's `atomically_creates_links…deletes` commit case; `ORDER BY id` → `given_rows_out_of_id_order::loads_and_lists_spaces_in_ascending_id_order_whatever_their_heap_order` (through `list_spaces`); `exported_revision` dropped → `records_an_exported_revision_and_carries_it_across_later_commits`; `DO UPDATE` on assets → `stores_the_same_bytes_once_keeping_the_first_media_type`. Record the two `ON DELETE CASCADE` mutants as equivalent.

After both, run the audit again (review-audit against #561's head and CI).
