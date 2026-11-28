# 03 — Hold PostgreSQL's write refusals and its unlocked writes' isolation by tests

**Status:** ready-for-agent

**Blocked by:** nothing.

**Kind:** mutation survivors. Not correctness gaps at `32d316f3`: the code does each thing ADR 0177 or the SQLite store's tests describe. No PostgreSQL test fails if it stops.

## What is wrong

Four fresh mutants (`../mutants.md`) survive every PostgreSQL test:

- **A09**: `upsert_resource` (`crates/host/src/sql/postgres.rs:566-581`) also sets `space_id = excluded.space_id`, so an update meeting a Resource row another Space owns takes the row instead of being refused. ADR 0177 and Storage ST-20 say it is refused as `invalid-commit`. The SQLite store has the test (`crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::refuses_an_update_writing_a_resource_another_space_owns`); `crates/host/tests/postgres.rs` › `given_a_row_changed_outside_the_decision` has creation and gone-row cases but not this one.
- **A22**: `land` commits instead of rolling back on `Landing::Refused` (`crates/host/src/sql.rs:862-865`). On the creation path PostgreSQL has already aborted the transaction, so `COMMIT` rolls back and the mutant is equivalent there; on the update path above it would land the refused commit's earlier writes. The A09 test, asserting the stored aggregate is unchanged, kills it.
- **A19**: an unlocked write (`Access::Write`: `mark_exported`, `store_asset`) begins `SERIALIZABLE` instead of `READ COMMITTED` (`postgres.rs:338-341`). Then `mark_exported` meeting a commit holding the Space's row lock waits, and on that commit fails `40001`, answered Unreachable, where it now succeeds. ADR 0177 says what locking transactions and unlocked reads use and is silent on unlocked writes.
- **A24**: initialization that meets `23505` and then reads the store uninitialized answers Unreachable instead of the driver's failure (`sql.rs:988`). Reaching it needs the colliding committed row gone before the re-read, which no runtime writer does; recorded here so it is decided rather than forgotten.

Each is reachable only through a writer outside the repository's decisions (direct SQL, a trigger, a future writer), because the fast path cannot add a Resource (`crates/host/src/commit.rs:466-485`, `preserves_snapshot_boundary`) and every aggregate commit holds the exclusive lock. So these are defence in depth that no test holds, not answers a user can see today.

## What to build

- [ ] In `crates/host/tests/postgres.rs` › `given_a_row_changed_outside_the_decision`, a trigger that moves a Resource row to another Space after the commit's row lock, as the SQLite module does; the update answers `Rejected` naming the owning Space, and the stored aggregate is what it was (kills A09 and A22).
- [ ] A test that `mark_exported` waiting on a commit's row lock succeeds once the commit lands, and one that two `store_asset` calls for the same new hash both answer (one `Stored`, one `Existing`), neither Unreachable (kills A19).
- [ ] ADR 0177's successor, or the next Storage refresh, says unlocked writes run `READ COMMITTED`.
- [ ] A24: a test through a trigger, or a sentence in the code saying why the branch answers what it does.

**Named mutants:** A09, A19, A22, A24.
