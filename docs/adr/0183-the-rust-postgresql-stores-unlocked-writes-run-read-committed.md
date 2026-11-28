# The Rust PostgreSQL store's unlocked writes run READ COMMITTED

Status: proposed
Date: 2026-11-28
Refines: 0177
Related: 0095, 0174

ADR 0177 sets the isolation level of every transaction the Rust PostgreSQL store begins, rather than inheriting the server's default. It names two kinds: every locking transaction begins `READ COMMITTED`, and an unlocked read of more than one statement begins `REPEATABLE READ READ ONLY`. It does not name the third kind. An unlocked write takes no advisory lock: `mark_exported` and `store_asset` (`Access::Write` in `crates/host/src/sql.rs`). An independent parity audit of the store (`.scratch/rust-postgresql-parity-audit/`, mutant A19) found that changing those writes to `SERIALIZABLE` failed no test. So the level was chosen in the code but neither decided nor held.

## The decision

- **An unlocked write begins `BEGIN ISOLATION LEVEL READ COMMITTED`**, as a locking transaction does (`PostgresStore::begin` in `crates/host/src/sql/postgres.rs`). Like every other level the store uses, it is set, never inherited.
- **An unlocked write that meets another writer's row lock waits, then writes.** `mark_exported`, meeting a commit that holds its Space's row, writes the exported revision once that commit lands. Two `store_asset` calls for one new hash both answer: one `Stored`, one `Existing`. Neither answers Unreachable.
- Two tests in `crates/host/tests/postgres_concurrency.rs` › `given_an_unlocked_write_beside_another_writer` hold this: `marks_a_space_exported_once_a_commit_holding_its_row_lands` and `stores_one_new_asset_written_twice_at_once_and_finds_it_the_second_time`.

## Why

Each unlocked write is one statement on one row or one asset, so `READ COMMITTED` cannot tear what it writes. Under a stricter level, a write that waited on a row another transaction changed fails `40001`. ADR 0177 answers `40001` as Unreachable (503), so a successful Export would report a failure only because a commit was landing at the same moment. TypeScript sets no level and inherits the server's default, which is `READ COMMITTED` unless an operator changes it. So this is TypeScript's answer on a default server, made independent of the server's setting.

## Rejected

- **`SERIALIZABLE` or `REPEATABLE READ` for unlocked writes.** A write meeting a concurrent commit answers 503 where it could succeed. Avoiding that needs a retry on `40001`, and ADR 0177 already rejects a retry bound as a new decision.
- **Inheriting the server's default.** The answer would then depend on a server setting the store never makes. ADR 0177 rejects that for every other transaction.
- **Taking the shared advisory lock for unlocked writes.** `mark_exported` would then wait behind every aggregate commit, not only the one touching its Space's row. ADR 0177 deliberately leaves both operations unlocked, as TypeScript does.

## Consequences

Accepting this closes the third acceptance box of parity-audit ticket 03, and the next requirements refresh folds it into Storage beside ADR 0177. Until then it binds nothing, and the code comment on `PostgresStore::begin` and the two tests above are what hold the level.
