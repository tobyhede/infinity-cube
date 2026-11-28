# Mutation audit of the Rust PostgreSQL store

The Rust PostgreSQL store's mutation audit: `cargo-mutants` over the SQL repository, PostgreSQL's statements and the commit decision against every PostgreSQL test, then every hand mutant the store's tickets named, each with the test that kills it. Like StrykerJS (`engine.md`), this is a local diagnostic, never a CI check and never a threshold: a survivor is a question about the tests, answered here with a test or with why the mutant is equivalent.

## Running `cargo-mutants`

`cargo-mutants` 27.1.0, read from `.cargo/mutants.toml`, which names the three files it mutates (`crates/host/src/sql.rs`, `crates/host/src/sql/postgres.rs`, `crates/host/src/commit.rs`), the test binaries it builds and the nextest filter it runs. The tests are every PostgreSQL test (each `postgres*` test file of `host`, ignored or not, and the CLI's `serve_postgres`) and the library unit tests of the files it mutates (`sql::tests`, the concurrency seam's; `sql::postgres::tests`; `commit::tests`).

It needs a PostgreSQL server whose role may create databases and roles, as the `rust` CI job's does, with password login so the misconfiguration cases can tell a wrong password from a right one. From the repository root:

```sh
INFINITY_CUBE_POSTGRES_TEST_URL=postgres://<role>:<password>@127.0.0.1:<port>/postgres \
CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 \
  cargo mutants --in-place --minimum-test-timeout 240
```

- `--in-place` mutates the working tree, so nothing else may edit it while the run lasts, and an interrupted run can leave one mutant applied: `git diff crates/host/src` before going on. Without it, `cargo-mutants` copies the tree and builds a target directory per job, which needs several gigabytes of free disk per job.
- The three `CARGO_*` variables build without debug information or incremental state, which keeps the target directory near 600 MB. A build that runs out of disk is scored unviable, not caught, so check `mutants.out/unviable.txt` against `rustc`'s own unviable mutants before trusting it.
- `--minimum-test-timeout 240` gives a mutant that makes a lock wait forever four minutes before it is scored a timeout. A run takes about 55 seconds unmutated.
- With `mise`, `mise exec cargo:cargo-mutants@27.1.0 -- cargo mutants …` runs the pinned version without installing it.
- The config names the CLI's package in `additional_cargo_args` (`--package=infinity-cube`) rather than in `test_package`. The audit's commit said `test_package` was not passed to the build in 27.1.0; it did not record how that was found. On 2026-11-28, checked with a copy of `.cargo/mutants.toml` that set `test_package = ["host", "infinity-cube"]` and dropped `--package=infinity-cube`, run as `cargo mutants --config <copy> --in-place --check --baseline skip -F 'replace rejection -> CommitResult with Default::default'`, the logged `cargo check --tests` did carry `--package=infinity-cube@0.1.0-preview.1`. That covers `--check` only, not the `cargo test --no-run` build of a full run, so the config keeps the CLI in `additional_cargo_args`.

Output goes to the ignored `mutants.out/`.

## The audit's run

Run on 2026-11-28 with `cargo-mutants` 27.1.0 against PostgreSQL 14.19, at `6ac8678b` (ticket 06's branch with tickets 10 and 11 merged in), by the command above. Its summary line:

```text
364 mutants tested in 2h: 16 missed, 153 caught, 195 unviable
```

Two of the 195 unviable mutants were not: the disk filled while their tests were being linked (`No space left on device` in their logs). Run again alone, both were caught: `commit.rs` `request_refusal` answering `None`, and `sql.rs` `set_probe` doing nothing. Every other unviable mutant is a type error `rustc` refuses, such as `Outcome::new(None)`, which `Outcome`, a `Result`, has no constructor for. So the run's answer is 16 missed, 155 caught, 193 unviable, and no timeouts.

### The survivors

Each of the 16 got a test that kills it, but one, which is equivalent. With those tests, the 16 were run again (`-F` naming each, 26 mutants matched): 1 missed, 21 caught, 4 unviable, the one missed being the equivalent one.

| Survivor | Killed by |
| --- | --- |
| `commit.rs:291` and `commit.rs:371`, the `OrdinarySpaceUnreferenced` arms of `decide_commit` deleted, so a Space the stored aggregate already left unreferenced is no longer forgiven (ADR 0095) | `commit::tests::given_a_stored_space_nothing_references::writes_an_edit_that_leaves_it_alone`, `…::refuses_only_the_space_the_commit_itself_leaves_unreferenced` |
| `sql.rs:374`, `Shared`'s `Debug` writing nothing | `sql::postgres::tests::describe_the_repository::names_the_store_it_runs_over` |
| `sql.rs:463`, `recreate_before_row_lock` doing nothing; `sql.rs:559`, its Space guard `false` or `!=`, so the recreation never lands | both `contract::commits::stores_…_whole_snapshot_over_recreated_resource_rows` cases, which now also assert the commit wrote the two Resource rows the recreation changed and dropped. Before, a recreation that never happened left them passing: the commit stores the same snapshot either way |
| `sql.rs:559`, the guard `true`, so the recreation lands in whichever commit writes a Space first | `postgres.rs` › `given_resource_rows_to_recreate_for_one_space::leaves_them_to_the_next_commit_writing_that_space` |
| `sql.rs:986`, `initialize` reading the store again after any database failure, not only a lost primary-key race | `postgres_outages.rs` › `given_a_server_that_refuses_this_client::answers_an_initialization_it_refuses_without_asking_again` (the stand-in counts one connection) |
| `sql.rs:1068`, `every_table`'s `==` made `!=`, so a database missing one table passes the check | `postgres.rs` › `given_a_database_missing_a_table::fails_every_operation_as_broken_naming_the_table` |
| `sql.rs:1145`, `write_created`'s `unique_violation` guard `false`, so a created Space's Resource meeting a row already written fails unclassified instead of being refused | `postgres.rs` › `given_a_row_changed_outside_the_decision::refuses_a_commit_creating_a_space_whose_resource_row_is_already_written` |
| `sql.rs:1145`, the guard `true`, so any failure inserting a created Space's Resource is refused as another Space's | `postgres.rs` › `given_a_row_changed_outside_the_decision::fails_a_created_space_whose_resource_jsonb_refuses_unclassified` |
| `postgres.rs:236`, `connect_options` dropping every `sslcert` and `sslkey` (`&&` made `\|\|`), so a named client certificate never reaches `sqlx` | `sql::postgres::tests::read_sslmode_as_pg_does::hands_a_named_client_certificate_and_key_to_sqlx` |
| `postgres.rs:522`, `update_space` answering that a row was there when none was | `postgres.rs` › `given_a_row_changed_outside_the_decision::fails_a_commit_updating_a_space_whose_row_is_already_gone` |
| `postgres.rs:534`, `delete_space` answering that a row was removed when none was | `postgres.rs` › `given_a_row_changed_outside_the_decision::fails_a_commit_deleting_a_space_whose_row_is_already_gone` |
| `postgres.rs:670`, `close` leaving the pool open | `postgres.rs` › `given_a_closed_repository::holds_no_connection_to_the_database` |

**Equivalent: `commit.rs:174`, `==` made `!=` in `grouped`'s `position`.** `position` is read only for a `DuplicateSpaceId` refusal, and intake never refuses the candidate aggregate so. The candidate is a map keyed by Space id, and each Space in it carries its own key as its id: a stored Space is keyed by its snapshot's id, and `request_refusal` refuses a change whose snapshot names another Space before `decide_commit` builds the candidate. So no two Spaces in it share an id.

The `given_a_row_changed_outside_the_decision` tests stand a PostgreSQL trigger in for the outside writer, inside the commit's own transaction, as `crates/host/tests/sqlite.rs`'s module of that name does on SQLite.

What the run says about the hand catalogue below: ticket 07 named "`23505` on `resources_pkey` during creation not answered as the ownership refusal", killed by the port of `test/integration/postgres-space-repository.test.ts` › "classifies initialization when a concurrent winner takes a shared Resource identity", but that port is an initialization race, and `write_created`'s `23505` handling survived every PostgreSQL test until the two `write_created` tests above.

## The hand-mutant catalogue

Every hand mutant tickets 02 to 12 of the PostgreSQL store named, with the test that kills it as that ticket's pull request or Comments recorded it, applied by hand one at a time against the tests named and then restored. This file checked that each named test exists at the commit that added it; a killer marked _(re-run)_ was also run against its mutant for this audit. To re-run one, make the edit described, run the named test's binary (`cargo nextest run -p host --test <binary> --run-ignored all`, with the server variable set), see it fail, and restore the file.

Each mutant names the file, the function and the edit, written against the code at this file's commit. The tickets recorded each mutant and its killer but not always the edit, and 02 and 04 applied theirs to code since reshaped. So an edit not marked _(re-run)_ is this file's statement of the mutant the ticket named, and has not been run again in that form.

File names: `sql.rs` is `crates/host/src/sql.rs`, and a `Shared::…` or `SqlSpaceRepository::…` function is in it; `postgres.rs`, as the file a mutant edits, is `crates/host/src/sql/postgres.rs`; `sqlite.rs`, as the file a mutant edits, is `crates/host/src/sql/sqlite.rs`; `commit.rs` is `crates/host/src/commit.rs`.

Test paths: `contract::…` cases are the repository contract table (`crates/host/tests/repository_contract/`), run on PostgreSQL by `crates/host/tests/postgres.rs` and on SQLite by `crates/host/tests/sqlite_contract.rs`; `sql::tests::…` are `crates/host/src/sql/tests.rs`; `sql::postgres::tests::…` are `crates/host/src/sql/postgres/tests.rs`; `postgres.rs` › and `postgres_*.rs` › name a test file in `crates/host/tests/`. A TypeScript test is named by its file and its title.

### 02, the shared repository contract (on SQLite, PR #557)

| Mutant | Killed by |
| --- | --- |
| The aggregate write path replaced by `abort()`: `Shared::aggregate_commit`'s `CommitDecision::Write` arm made `std::process::abort()` | 12 contract cases, for example `contract::commits::writes_only_the_new_and_changed_resources_on_the_aggregate_path` |
| The Space row not deleted on the aggregate path: `sqlite.rs` `delete_space`'s `DELETE FROM spaces` statement removed, answering `true` | `contract::commits::atomically_creates_links_reads_converges_on_and_deletes_a_space`, `contract::commits::adopts_a_resource_id_from_the_space_a_commit_deletes` |
| `delete_resources_except` a no-op: `sqlite.rs` `delete_resources_except` answering `Ok(())` without its statement | 7 contract cases, for example `contract::commits::keeps_the_resources_a_commit_names_and_drops_the_rest` |
| The expected revision ignored on the aggregate path: `commit.rs` `decide_commit`'s `stale` made `false`. Since 04, `Shared::write_changes` also compares the revision under the row lock, so in today's code the mutant also needs that comparison (`prior.is_none() \|\| prior != expected.get(id).copied()`) made `false` | `contract::commits::answers_a_stale_revision_on_the_aggregate_path_as_a_conflict` |
| The revision not advanced on the aggregate path: `commit.rs` `committed_revision` answering `*expected_revision` instead of `expected_revision.next()` | 12 contract cases, for example `contract::commits::keeps_an_exported_revision_through_an_aggregate_commit` |
| Deletes interleaved with writes (#528's m05a): `Shared::write_changes`'s loop deleting `deleted` moved after the loop writing `encoded` | `contract::commits::commits_a_move_whichever_space_it_lists_first` |
| `clear` leaving Space rows: `sqlite.rs` `clear`'s `DELETE FROM spaces` removed from its statements | 10 contract cases, for example `contract::lifecycle::leaves_no_dropped_space_after_a_replacement_across_a_reopen` |
| `exported_revision` dropped when a row is rewritten: `sqlite.rs` `update_space`'s `UPDATE` also setting `exported_revision = NULL` | `contract::commits::records_an_exported_revision_and_carries_it_across_commits`, `contract::commits::keeps_an_exported_revision_through_an_aggregate_commit` |
| Resource rows judged against the decision read (04's, deferred): `Shared::recreate_before_row_lock` called in `Shared::write_updated` after its `S::resources_of` re-read, instead of in `Shared::write_changes` before the row lock | both `contract::commits::stores_…_whole_snapshot_over_recreated_resource_rows` cases |

### 03, the ports test (PR #559)

Each is an edit to `test/unit/repository-contract-rust-ports.test.ts` or the case reader it imports, `test/support/case-names.ts`, and each fails tests of `test/unit/repository-contract-rust-ports.test.ts` (run with `pnpm exec vitest run test/unit/repository-contract-rust-ports.test.ts`). Each was re-run for this file on 2026-11-28 in the form given.

| Mutant | Killed by |
| --- | --- |
| Reading names across describes, so a name the SQLite describe of a file shares goes unnoticed: `casesFrom`'s filter keeping every case whatever its first describe (`\|\| true` added) | "the repository cases the Rust PostgreSQL repository is held to" › "are each named once, by text, read block by block where a file holds more than one store", and seven more _(re-run)_ |
| Dropping `describe.each` values: `case-names.ts` `describedCasesIn` visiting a describe's arguments with `each` instead of `each \|\| block.each` | "the PostgreSQL port check" › "finds the values of every case under a describe.each unlisted when they are dropped", "the case reader" › "reads every case with the describe blocks around it, outermost first", and two more _(re-run)_ |
| Treating an accepted difference as a port: `postgresTally` counting an `acceptedDifference` exemption under `ported` | "the PostgreSQL port check" › "counts an accepted difference as an exemption, never as a port", "…" › "counts each kind of exemption by its kind", "the Rust PostgreSQL repository" › "ports the table and its own cases, every other case exempt" _(re-run)_ |
| Leaving an exempt case out of the adapter instead of listing it as an exemption: `POSTGRES_EXEMPT`'s entry for "starts from this module’s own directory when given no starting point" removed | "the Rust PostgreSQL repository" › "ports or exempts every case and value", "…" › "ports the table and its own cases, every other case exempt" _(re-run)_; the check itself by "the PostgreSQL port check" › "finds an exempt case left out of the adapter: its name dropped from the exemptions" |

### 04, the concurrency seam (ticket 04's Comments)

| Mutant | Killed by |
| --- | --- |
| The fast path taking the exclusive lock: `Shared::fast_path`'s `begin_locked(LockMode::Shared, true)` made `LockMode::Exclusive`. The fast path taking no lock: `Shared::begin_locked` not calling `lock_aggregate` for `LockMode::Shared`. The aggregate path taking the shared lock: `Shared::aggregate_commit`'s `begin_locked(LockMode::Exclusive, true)` made `LockMode::Shared` | `sql::tests::statement_order::the_fast_path_takes_the_shared_lock_before_its_read_and_locks_the_row`, `sql::tests::statement_order::an_aggregate_commit_takes_the_exclusive_lock_before_the_meta_and_complete_reads` (the scripted store's lock log) |
| The fast path and the aggregate decision in one transaction: `Shared::fast_path`'s `SingleSpaceDecision::Aggregate` arm calling `self.aggregate_commit(request)` before it rolls `transaction` back | `sql::tests::statement_order::a_handed_on_update_ends_the_fast_path_before_taking_the_exclusive_lock`, `sql::tests::dropped_callers::at_the_hand_off` |
| The revision compared from the decision read instead of the row lock's answer: `Shared::write_changes` setting `prior` to `expected.get(id).copied()` instead of the revision `lock_space` answers | `sql::tests::races::a_revision_moved_under_the_row_lock_conflicts_with_the_space_read_afresh` |
| The Meta relock retry removed: `Shared::lock_meta_identity`'s `for attempt in 0..2` made `0..1` | `sql::tests::races::a_meta_row_moved_once_is_locked_again_and_answered` |
| Replacement skipping the per-row relock: `Shared::replace`'s `for row in &rows` loop, which locks each row with `lock_space` and compares its revision, removed | `sql::tests::statement_order::load_aggregate_and_both_lifecycle_doors_take_the_exclusive_lock`, `sql::tests::races::a_replacement_meeting_a_moved_row_conflicts_with_the_identity_read_afresh` |
| The upsert's ownership read-back dropped: `Shared::write_updated`'s `if owner != row.id` refusal after `upsert_resource` removed | `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::refuses_an_update_writing_a_resource_another_space_owns` |
| `install` upserting instead of inserting: `sqlite.rs` `insert_space`'s `INSERT` given `ON CONFLICT (id) DO UPDATE`, so `Shared::install` overwrites a Space row already written | `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::fails_an_initialization_meeting_a_space_row_already_written` |
| An operation run on the caller's future instead of a spawned task: `SqlSpaceRepository::run` aborting its spawned task when the caller's future is dropped (tried as an abort-on-drop guard on the `JoinHandle`) | all four `sql::tests::dropped_callers` tests at the row lock, the hand-off, the Meta read and the Resource re-read |

04 moved three mutants to 07, below.

### 05, the PostgreSQL store (ticket 05's Comments)

| Mutant | Killed by |
| --- | --- |
| `updated_at` not set on a Space update: `postgres.rs` `update_space`'s `updated_at = now()` removed | `postgres.rs` › `given_rows_it_writes::advances_a_spaces_updated_at_when_it_is_updated` |
| `updated_at` not set on a Resource update: `postgres.rs` `upsert_resource`'s `DO UPDATE` without `updated_at = excluded.updated_at`. `created_at` overwritten by the upsert: that `DO UPDATE` also setting `created_at = now()` | `postgres.rs` › `given_rows_it_writes::advances_a_resources_updated_at_and_keeps_its_created_at_when_it_is_updated` |
| `load_space` outside a transaction: `Shared::read_space` running its two reads, `S::space` and `S::resources_of`, each in a transaction of its own. Or as one `READ COMMITTED` transaction: `postgres.rs` `begin`'s `Access::Read` statement made `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY` | `postgres.rs` › `given_its_transactions::reads_a_space_and_its_resources_from_one_side_of_a_commit` |
| No isolation level on a locking transaction: `postgres.rs` `begin`'s `Access::Write \| Access::Locked { .. }` statement made plain `BEGIN`. `SERIALIZABLE` or `REPEATABLE READ` for one: that statement's level made `SERIALIZABLE` or `REPEATABLE READ` | `postgres.rs` › `given_its_transactions::answers_overlapping_edits_to_one_space_a_commit_and_a_conflict_under_a_serializable_default` |
| In `postgres.rs` `classify`: `40001`, `53300` or `57P03` removed from `UNREACHABLE_STATES`; `UnexpectedEof` or `ConnectionRefused` removed from the `sqlx::Error::Io` arm; `28P01` or `3D000` added to `UNREACHABLE_STATES`; `unreachable` made `true`; the `UNDEFINED_TABLE` (`42P01`) return removed; `sqlx::Error::PoolTimedOut` removed from its arm | `sql::postgres::tests::classify_a_failure` |
| `DATABASE_URL` not trimmed: `crates/host/src/sql/database_url.rs` `DatabaseUrl::parse`'s `trim_matches(is_space)` removed | `postgres_url.rs` › `trims_the_value` |
| The `.env` value preferred over the environment's: `DatabaseUrl::resolve` (same file) reading `nearest_env_file` first and `variable` only when the `.env` names none | `postgres_url.rs` › `prefers_the_environments_value_to_the_env_files` |
| `sslmode` passed to `sqlx` unchanged: `postgres.rs` `connect_options` keeping `sslmode` in `kept` and not calling `options.ssl_mode(mode)` | `sql::postgres::tests::read_sslmode_as_pg_does::verifies_the_certificate_and_host_for_prefer_require_and_verify_ca` |
| The test support returning early instead of panicking without a server: `crates/host/tests/postgres_support/mod.rs` `server()` returning, not panicking, when `INFINITY_CUBE_POSTGRES_TEST_URL` is unset | every server test, run without `INFINITY_CUBE_POSTGRES_TEST_URL`, fails at `server()` |

### 06, the contract on PostgreSQL (PR #561)

Applied to `crates/host/src/sql/postgres.rs` (and, for the last, `sql.rs`) and run against the whole `postgres` binary on PostgreSQL 14.19.

| Mutant | Killed by |
| --- | --- |
| The Space row not deleted (`delete_space`'s `DELETE FROM spaces` made a `SELECT`) | `contract::commits::atomically_creates_links_reads_converges_on_and_deletes_a_space`, `contract::commits::adopts_a_resource_id_from_the_space_a_commit_deletes` |
| `delete_resources_except` deleting every row (its `AND NOT (id::text = ANY($2))` removed) | `contract::commits::writes_only_the_new_and_changed_resources_on_the_aggregate_path`, `contract::commits::writes_only_the_resource_a_topology_preserving_commit_changed`, `given_rows_it_writes::advances_a_resources_updated_at_and_keeps_its_created_at_when_it_is_updated` |
| `delete_resources_except` deleting no row (answering `Ok(())` without its statement) | `contract::commits::drops_every_resource_when_a_commit_omits_them_all`, and six more contract cases |
| `exported_revision` dropped when a Space row is rewritten (`update_space` sets it `NULL`) | `contract::commits::records_an_exported_revision_and_carries_it_across_commits`, `contract::commits::keeps_an_exported_revision_through_an_aggregate_commit` |
| Assets stored with `DO UPDATE` instead of `DO NOTHING` (`insert_asset`'s `ON CONFLICT (hash)`) | `contract::assets::stores_the_same_bytes_once_keeping_the_first_media_type` alone |
| `spaces` read without `ORDER BY id` (the `spaces` statement) | `postgres.rs` › `given_rows_out_of_id_order::loads_and_lists_spaces_in_ascending_id_order_whatever_their_heap_order` alone |
| `clear` leaving Space rows (`clear`'s `DELETE FROM spaces` removed from its statements) | `contract::lifecycle::replaces_everything_stored_freeing_the_resource_ids_it_clears`, and nine more contract cases |
| `replace_aggregate` decoding the rows it replaces (`every_space` called before `install` in `sql.rs`'s `Shared::replace`) | `contract::broken::replaces_an_invalid_space_document` alone |
| Equivalent: a Space delete leaving that Space's Resource rows (`delete_space`'s `DELETE FROM resources` removed); `clear` leaving Resource rows (`clear`'s `DELETE FROM resources` removed) | none can: `resources.space_id` references `spaces(id) ON DELETE CASCADE` (`migrations-sql/postgres/202609200949_rename_thing_to_resource.sql`), so deleting the Space rows deletes their Resource rows |

### 07, the PostgreSQL concurrency cases (ticket 07's Comments)

All in `crates/host/tests/postgres_concurrency.rs`. Some port cases of `test/integration/postgres-space-repository.test.ts`, named below by title.

| Mutant | Killed by |
| --- | --- |
| The fast path taking the exclusive lock: `postgres.rs` `lock_aggregate`'s `LockMode::Shared` statement made `pg_advisory_xact_lock` | `given_another_host_holding_the_aggregate_lock::commits_a_single_space_edit_while_it_is_held_shared` (times out), `given_the_lock_key::is_the_same_key_in_the_exclusive_and_the_shared_mode` (reads `ExclusiveLock`) |
| The fast path taking no lock: `postgres.rs` `lock_aggregate` answering `Ok(())` without a statement for `LockMode::Shared` | `given_another_host_holding_the_aggregate_lock::waits_with_a_single_space_edit_while_it_is_held_exclusively` |
| The advisory key differing from TypeScript's: `postgres.rs` `AGGREGATE_LOCK_KEY` made `(1_213_812_818, 2)` | `given_the_lock_key::is_the_key_the_typescript_store_names_in_each_mode`, `given_the_lock_key::is_the_same_key_in_the_exclusive_and_the_shared_mode` _(re-run)_ |
| `23505` on `resources_pkey` during creation not answered as the ownership refusal: `Shared::write_created`'s `Err(error) if unique_violation(&error)` guard made `false` | named by the ticket with the port of "classifies initialization when a concurrent winner takes a shared Resource identity", which does not kill it (above); killed by `postgres.rs` › `given_a_row_changed_outside_the_decision::refuses_a_commit_creating_a_space_whose_resource_row_is_already_written` _(re-run, as `cargo-mutants`' `write_created` guard `false`)_ |
| Replacement skipping the per-row relock: `Shared::replace`'s `for row in &rows` relock loop removed | `given_overlapping_replacements::conflicts_when_an_authored_commit_wins_after_replacement_reads_its_baseline` (port of "conflicts when an authored commit wins after replacement reads its baseline"), `given_overlapping_replacements::rolls_back_an_earlier_rows_relock_when_a_later_row_in_the_same_replacement_conflicts` (port of "rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts") |
| `23505` on `spaces_pkey` or `repository_state_pkey` rethrown instead of re-read: `Shared::initialize`'s `Err(Failure::Database(error)) if unique_violation(&error)` arm removed | the three `given_a_writer_outside_the_lock::classifies_initialization_when_a_concurrent_winner_takes_…` cases |
| The Meta relock answering the first identity it read (04's, deferred): `Shared::lock_meta_identity` keeping the first attempt's `meta_space_id` and answering it once the second attempt's relock succeeds | `given_overlapping_replacements::conflicts_a_replacement_authorized_against_an_identity_a_concurrent_replacement_retired` (port of "conflicts a replacement authorized against an identity a concurrent replacement retired"), `given_overlapping_replacements::judges_a_complete_aggregate_commit_against_an_identity_a_concurrent_replacement_retired` (port of "judges a complete-aggregate commit against an identity a concurrent replacement retired") |
| The revision compared from the decision read: `Shared::write_changes` setting `prior` to `expected.get(id).copied()` instead of the revision `lock_space` answers | `given_a_writer_outside_the_lock::refuses_an_unlocked_single_space_write_whose_row_moved_after_it_read_the_revision` (port of "refuses an unlocked single-Space write whose row moved after it read the revision") |
| Equivalent: the conflict answered with the Space read inside the aborted transaction (04's, deferred): `Shared::land`'s `Landing::Stale` arm reading the Space with `one_space` on `transaction` before rolling it back, instead of `self.read_space` after | none can on PostgreSQL: the locking transaction is `READ COMMITTED`, so a statement after the row lock sees the other writer's committed row as a fresh read does, and the commit has written nothing to that Space before every row lock is taken |
| Resource rows judged against the decision read (04's, deferred): `Shared::recreate_before_row_lock` called in `Shared::write_updated` after its `S::resources_of` re-read, instead of in `Shared::write_changes` before the row lock | `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::refuses_an_update_writing_a_resource_another_space_owns` at 07; on PostgreSQL since 06 by both `contract::commits::stores_…_whole_snapshot_over_recreated_resource_rows` cases |

### 08, classification, outages and start-up (ticket 08)

The classification mutants are edits to `postgres.rs` `classify`; the start-up ones to `crates/host/src/startup.rs` `keep_establishing`.

| Mutant | Killed by |
| --- | --- |
| A refused connection classified unclassified: `ConnectionRefused` removed from `classify`'s `sqlx::Error::Io` arm | `postgres_outages.rs` › `given_a_server_that_refuses_connections` |
| A connection closed mid-conversation classified unclassified: `UnexpectedEof` removed from that arm | `postgres_outages.rs` › `given_a_server_that_hangs_up::names_a_connection_closed_with_a_fin_unavailable_at_once` |
| A wrong password classified Unreachable: `28P01` added to `UNREACHABLE_STATES` | `postgres_outages.rs` › `given_a_server_that_refuses_this_client::leaves_a_wrong_password_unclassified_inside_and_outside_a_transaction` and `…_raised_while_connecting_unclassified` |
| `53300` or `57P03` classified unclassified: either removed from `UNREACHABLE_STATES` | `postgres_outages.rs` › `given_a_server_that_refuses_this_client::recognises_too_many_clients_raised_while_connecting`, `…recognises_a_server_starting_up_raised_while_connecting` |
| Start-up counting `53300` toward giving up: `keep_establishing`'s `RepositoryError::Unavailable(_) => uncured = 0` arm removed, so an Unreachable failure counts as the `EstablishError::Repository(_)` arm counts any other | `postgres_outages.rs` › `given_start_up_over_a_server_that_refuses_this_client::keeps_waiting_out_too_many_connections_past_the_confirming_limit` |
| Start-up not stopping on a confirmed `28P01`: `keep_establishing`'s `if uncured == CONFIRMING_FAILURES { return Err(failure) }` removed | `postgres_outages.rs` › `given_start_up_over_a_server_that_refuses_this_client::gives_up_on_a_wrong_password_once_a_second_attempt_confirms_it` |
| A classification that reads the message instead of the code (port of `test/unit/sql-connection-failure.test.ts` › "leaves a defect, an unknown code and a code named only in prose unclassified"): `classify`'s `sqlx::Error::Database` arm asking whether `error.to_string()` contains a code of `UNREACHABLE_STATES` instead of reading `code` | `sql::postgres::tests::classify_a_failure` (its `leaves_a_code_named_only_in_…` tests) |
| `COMMIT`-time `40001` left unclassified: `Shared::land`'s `transaction.commit().await?` mapping its error to `RepositoryError::Unclassified` instead of passing it through `classify` | `postgres_outages.rs` › `given_a_real_server::names_a_serialization_failure_at_commit_unavailable` |

### 09, HTTP and `serve --store postgres` (ticket 09's Comments)

All in `crates/cli/tests/serve_postgres.rs` unless named otherwise, run on PostgreSQL 16.15. The edits are to `crates/cli/src/serve.rs` unless named otherwise.

| Mutant | Killed by |
| --- | --- |
| `serve` taking the port before refusing a blank `DATABASE_URL`: `database_url`, which `database` calls from `crates/cli/src/main.rs` before `serve`, called instead in `serving` after `bind` | `given_a_database_url_it_cannot_serve::refuses_an_unset_or_blank_database_url_before_taking_a_port`, `given_a_database_seeded_with_the_fixture::serves_on_the_port_port_names` |
| `serve` migrating: `serving` applying the migrations under `migrations-sql/postgres/` before it spawns `keep_establishing` | `given_an_unmigrated_database::gives_up_after_two_confirmed_invariant_failures_and_keeps_serving` |
| `--store postgres` opening SQLite: `serve`'s `Database::Postgres` arm opening `SqliteSpaceRepository` | all 12 tests |
| Reseeding an initialized database: `crates/host/src/startup.rs` `establish_meta_space` replacing a loaded aggregate with Default Content through `replace_aggregate`, instead of answering its Meta identity | `given_a_database_seeded_with_the_fixture::serves_it_without_reseeding` |
| The `Host` check missing: `crates/cli/src/listener.rs` `serve`'s `if !names_own_host(&request, &own)` early return of `misdirected()` removed | `given_a_database_seeded_with_the_fixture::answers_421_to_a_request_naming_any_host_but_its_own` |
| `DATABASE_URL` not trimmed: `crates/host/src/sql/database_url.rs` `DatabaseUrl::parse`'s `trim_matches(is_space)` removed | `crates/host/tests/postgres_url.rs` › `trims_the_value` (`serve_postgres` cannot: the `url` crate strips surrounding spaces) |
| Announcing only after start-up succeeds: `serving`'s `announce_listening(port)` moved to after `keep_establishing` answers `Ok` | `given_a_database_that_does_not_answer::announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env`, `given_a_migrated_database_holding_nothing::announces_before_the_database_answers_and_initializes_it_once_it_does` |

### 10, rows across runtimes and the restart proof (PR #556)

| Mutant | Killed by |
| --- | --- |
| Rust writing a document key TypeScript does not read: `crates/host/src/sql/codec.rs` `encode_space` adding a key to the Space row's `document` | `crates/host/tests/postgres_rows.rs` › `writes_the_rows_checked_in`, and `test/integration/postgres-rows-across-runtimes.test.ts` › "holds the Rust rows to the rows this host writes" (the read-back test alone cannot: zod drops unknown keys) |
| Rust writing `revision` as a number rather than text: `postgres.rs` `insert_space` and `update_space` binding `row.revision` parsed as an `f64` (or an `i64`) rather than the text `codec.rs` `encode_revision` writes | as `f64`: `crates/host/tests/postgres_rows.rs` › `writes_the_next_revision_as_the_decimal_text_typescript_reads`, at revision 2^53+1. Equivalent as `i64`: PostgreSQL writes the same decimal text, and the revision ceiling fits in an `i64` |
| The restart proof's command host ignored: `test/support/restart-proof-host.ts` `startRestartProofHost` calling `startVite` whatever host it is given | `test/unit/restart-proof-host.test.ts` › "starts the command named, and never the Vite host" |

### 11, property tests on PostgreSQL (PR #568)

None of its own: a property test that only compares stores is the wrong killer for a store defect. For information, against `crates/host/tests/postgres_properties.rs` alone, it also kills 06's "Space row not deleted", "`delete_resources_except` deleting no row" and "`spaces` read without `ORDER BY id`".

### 12, the races (ticket 12's Comments)

All in `crates/host/tests/postgres_races.rs`.

| Mutant | Killed by |
| --- | --- |
| A process-wide mutex around `commit`: `sql.rs` `SqlSpaceRepository`'s `SpaceRepository::commit` holding one process-wide `tokio::sync::Mutex` across its `self.run(…)` | four races, `lets_map_internal_edits_to_different_spaces_commit_side_by_side` among them |
| The fast path's lock taken exclusive in the statement while the probe still reports shared: `postgres.rs` `lock_aggregate`'s `LockMode::Shared` statement made `pg_advisory_xact_lock`, while `Shared::begin_locked` still reports `Step::Locked(LockMode::Shared)` | `lets_map_internal_edits_to_different_spaces_commit_side_by_side` |
| The fast path's lock dropped: `postgres.rs` `lock_aggregate` answering `Ok(())` without a statement for `LockMode::Shared` | four races, `keeps_a_replacement_from_landing_between_a_fast_path_read_and_its_write` (the recreation race) among them |
