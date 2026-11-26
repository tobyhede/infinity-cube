# 13 — Port the in-process SQLite races to Rust

**Status:** resolved

**Blocked by:** 03.

**What to build:** Rust tests of concurrent operations on one SQLite repository in one process, the races `test/integration/sqlite-fast-path-races.test.ts` and `test/integration/sqlite-contention.test.ts` hold for TypeScript beyond the same-Space race Rust already tests (`crates/host/tests/sqlite.rs`, `given_contention`).

- [x] Concurrent commits to different Spaces all commit, each Space at its next revision, read back after a reopen.
- [x] Two concurrent commits adding the same Resource id: one commits, the other is refused, and the file holds one row for it.
- [x] Two concurrent commits creating the same Space id: one commits, the other answers a conflict or refusal as `decide_commit` would sequentially.
- [x] A `replace_aggregate` and a commit started together end in a state one of the two orders produces, never a mix.
- [x] The fast-path races of `test/support/fast-path-races.ts` have Rust ports or written exemptions (03), among them a Map-internal Edit under the shared lock only, a Map-internal Edit and a Graph deletion serialised in either order, a replacement recreating a Space at revision 0 kept from landing between a fast-path read and its write, and a Space deletion kept from passing at a revision an uncommitted fast path has moved.
- [x] Taken together these fail if the repository's serialising lock is removed and the pool holds more than one connection; the PR description records the mutant and the test that kills it. A deferred `BEGIN` cannot be seen in one process (one connection serialises every write); 10 holds it.

## Comments

### Resolved (2026-11-26)

`crates/host/tests/sqlite_races.rs` starts operations together on one repository, the first polled first, with a busy timeout of zero, so an operation that met another's lock on the file would fail unreachable rather than wait. Each ends as the two would run one after the other in that order, read back after a reopen: seven commits to different Spaces each at its next revision; reads before and after a complete-aggregate and a single-Space commit; the Resource identity race (one commit, one refusal, one row for the Resource); the same-id create race (the loser conflicts on the new Space and on Meta, as `decide_commit` answers it run second); a replacement and a commit in either order; and the fast-path races in arrival order. The TypeScript races pause one side inside its transaction and see the other still waiting; the Rust repository has no seam inside an operation, so the Rust tests hold the outcome of that order. "commits a Map-internal Edit under the shared aggregate lock only" does not apply (the Rust repository has one lock mode), written in the ports test; `hands_a_graph_deletion_on_to_the_complete_aggregate_decision`, not a port, keeps its answers.

Mutant: removing `SqlSpaceRepository::alone`'s serialising lock and letting the pool hold four connections fails 12 or 13 of the 15 tests on each of three runs (among them `settles_a_replacement_then_a_commit_in_arrival_order`, `commits_overlapping_edits_to_different_spaces_each_at_its_next_revision` and `refuses_the_loser_of_a_resource_identity_race`): overlapping writes meet each other's lock and fail unreachable, or land out of arrival order. `settles_an_edit_then_a_replacement_recreating_its_space_in_arrival_order` holds the arrival-order outcome only: under that mutant it fails because the replacement is refused as busy, not through a replacement landing inside the Edit.
