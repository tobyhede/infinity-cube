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

What the run says about the hand catalogue below: ticket 07 named "`23505` on `resources_pkey` during creation not answered as the ownership refusal", killed by the port of `postgres-space-repository.test.ts:375`, but that port is an initialization race, and `write_created`'s `23505` handling survived every PostgreSQL test until the two `write_created` tests above.

## The hand-mutant catalogue

Every hand mutant tickets 02 to 12 of the PostgreSQL store named, with the test that kills it as that ticket's pull request or Comments recorded it, applied by hand one at a time against the tests named and then restored. This file checked that each named test exists at the commit that added it; a killer marked _(re-run)_ was also run against its mutant for this audit. To re-run one, make the change described, run the named test's binary (`cargo nextest run -p host --test <binary> --run-ignored all`, with the server variable set), see it fail, and restore the file.

Test paths: `contract::…` cases are the repository contract table (`crates/host/tests/repository_contract/`), run on PostgreSQL by `crates/host/tests/postgres.rs` and on SQLite by `crates/host/tests/sqlite_contract.rs`; `sql::tests::…` are `crates/host/src/sql/tests.rs`; `sql::postgres::tests::…` are `crates/host/src/sql/postgres/tests.rs`.

### 02, the shared repository contract (on SQLite, PR #557)

| Mutant | Killed by |
| --- | --- |
| The aggregate write path replaced by `abort()` | 12 contract cases, for example `contract::commits::writes_only_the_new_and_changed_resources_on_the_aggregate_path` |
| The Space row not deleted on the aggregate path | `contract::commits::atomically_creates_links_reads_converges_on_and_deletes_a_space`, `contract::commits::adopts_a_resource_id_from_the_space_a_commit_deletes` |
| `delete_resources_except` a no-op | 7 contract cases, for example `contract::commits::keeps_the_resources_a_commit_names_and_drops_the_rest` |
| The expected revision ignored on the aggregate path | `contract::commits::answers_a_stale_revision_on_the_aggregate_path_as_a_conflict` |
| The revision not advanced on the aggregate path | 12 contract cases, for example `contract::commits::keeps_an_exported_revision_through_an_aggregate_commit` |
| Deletes interleaved with writes (#528's m05a) | `contract::commits::commits_a_move_whichever_space_it_lists_first` |
| `clear` leaving Space rows | 10 contract cases, for example `contract::lifecycle::leaves_no_dropped_space_after_a_replacement_across_a_reopen` |
| `exported_revision` dropped when a row is rewritten | `contract::commits::records_an_exported_revision_and_carries_it_across_commits`, `contract::commits::keeps_an_exported_revision_through_an_aggregate_commit` |
| Resource rows judged against the decision read (recreation moved after the re-read; 04's, deferred) | both `contract::commits::stores_…_whole_snapshot_over_recreated_resource_rows` cases |

### 03, the ports test (PR #559)

Each fails `test/unit/repository-contract-rust-ports.test.ts`, the ports test's own unit tests: reading names across describes (a duplicate goes unnoticed); dropping `describe.each` values; treating an accepted difference as a port; leaving an exempt case out of the adapter instead of listing it as an exemption.

### 04, the concurrency seam (ticket 04's Comments)

| Mutant | Killed by |
| --- | --- |
| The fast path taking the exclusive lock, or no lock; the aggregate path taking the shared lock | `sql::tests::statement_order` (the scripted store's lock log) |
| The fast path and the aggregate decision in one transaction | `sql::tests::statement_order::a_handed_on_update_ends_the_fast_path_before_taking_the_exclusive_lock`, `sql::tests::dropped_callers::at_the_hand_off` |
| The revision compared from the decision read instead of the row lock's answer | `sql::tests::races::a_revision_moved_under_the_row_lock_conflicts_with_the_space_read_afresh` |
| The Meta relock retry removed | `sql::tests::races::a_meta_row_moved_once_is_locked_again_and_answered` |
| Replacement skipping the per-row relock | `sql::tests::statement_order::load_aggregate_and_both_lifecycle_doors_take_the_exclusive_lock`, `sql::tests::races::a_replacement_meeting_a_moved_row_conflicts_with_the_identity_read_afresh` |
| The upsert's ownership read-back dropped | `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::refuses_an_update_writing_a_resource_another_space_owns` |
| `install` upserting instead of inserting | `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::fails_an_initialization_meeting_a_space_row_already_written` |
| An operation run on the caller's future instead of a spawned task (tried as an abort-on-drop of the task) | all four `sql::tests::dropped_callers` tests at the row lock, the hand-off, the Meta read and the Resource re-read |

04 moved three mutants to 07, below.

### 05, the PostgreSQL store (ticket 05's Comments)

| Mutant | Killed by |
| --- | --- |
| `updated_at` not set on a Space update | `postgres.rs` › `given_rows_it_writes::advances_a_spaces_updated_at_when_it_is_updated` |
| `updated_at` not set on a Resource update; `created_at` overwritten by the upsert | `postgres.rs` › `given_rows_it_writes::advances_a_resources_updated_at_and_keeps_its_created_at_when_it_is_updated` |
| `load_space` outside a transaction, or as one `READ COMMITTED` transaction | `postgres.rs` › `given_its_transactions::reads_a_space_and_its_resources_from_one_side_of_a_commit` |
| No isolation level on a locking transaction; `SERIALIZABLE` or `REPEATABLE READ` for one | `postgres.rs` › `given_its_transactions::answers_overlapping_edits_to_one_space_a_commit_and_a_conflict_under_a_serializable_default` |
| `40001`, `UnexpectedEof`, `ECONNREFUSED`, `53300` or `57P03` classified unclassified; `28P01` or `3D000` classified Unreachable; every error Unreachable; `42P01` not an invariant failure; `PoolTimedOut` not Unreachable | `sql::postgres::tests::classify_a_failure` |
| `DATABASE_URL` not trimmed | `postgres_url.rs` › `trims_the_value` |
| The `.env` value preferred over the environment's | `postgres_url.rs` › `prefers_the_environments_value_to_the_env_files` |
| `sslmode` passed to `sqlx` unchanged | `sql::postgres::tests::read_sslmode_as_pg_does::verifies_the_certificate_and_host_for_prefer_require_and_verify_ca` |
| The test support returning early instead of panicking without a server | every server test, run without `INFINITY_CUBE_POSTGRES_TEST_URL`, fails at `server()` |

### 06, the contract on PostgreSQL (PR #561)

Applied to `crates/host/src/sql/postgres.rs` (and, for the last, `sql.rs`) and run against the whole `postgres` binary on PostgreSQL 14.19.

| Mutant | Killed by |
| --- | --- |
| The Space row not deleted (`delete_space`'s `DELETE FROM spaces` made a `SELECT`) | `contract::commits::atomically_creates_links_reads_converges_on_and_deletes_a_space`, `contract::commits::adopts_a_resource_id_from_the_space_a_commit_deletes` |
| `delete_resources_except` deleting every row | `contract::commits::writes_only_the_new_and_changed_resources_on_the_aggregate_path`, `contract::commits::writes_only_the_resource_a_topology_preserving_commit_changed`, `given_rows_it_writes::advances_a_resources_updated_at_and_keeps_its_created_at_when_it_is_updated` |
| `delete_resources_except` deleting no row | `contract::commits::drops_every_resource_when_a_commit_omits_them_all`, and six more contract cases |
| `exported_revision` dropped when a Space row is rewritten (`update_space` sets it `NULL`) | `contract::commits::records_an_exported_revision_and_carries_it_across_commits`, `contract::commits::keeps_an_exported_revision_through_an_aggregate_commit` |
| Assets stored with `DO UPDATE` instead of `DO NOTHING` | `contract::assets::stores_the_same_bytes_once_keeping_the_first_media_type` alone |
| `spaces` read without `ORDER BY id` | `postgres.rs` › `given_rows_out_of_id_order::loads_and_lists_spaces_in_ascending_id_order_whatever_their_heap_order` alone |
| `clear` leaving Space rows | `contract::lifecycle::replaces_everything_stored_freeing_the_resource_ids_it_clears`, and nine more contract cases |
| `replace_aggregate` decoding the rows it replaces (`every_space` called before `install` in `sql.rs`'s `replace`) | `contract::broken::replaces_an_invalid_space_document` alone |
| Equivalent: a Space delete leaving that Space's Resource rows; `clear` leaving Resource rows | none can: `resources.space_id` references `spaces(id) ON DELETE CASCADE` (`migrations-sql/postgres/202609200949_rename_thing_to_resource.sql`), so deleting the Space rows deletes their Resource rows |

### 07, the PostgreSQL concurrency cases (ticket 07's Comments)

All in `crates/host/tests/postgres_concurrency.rs`.

| Mutant | Killed by |
| --- | --- |
| The fast path taking the exclusive lock | `given_another_host_holding_the_aggregate_lock::commits_a_single_space_edit_while_it_is_held_shared` (times out), `given_the_lock_key::is_the_same_key_in_the_exclusive_and_the_shared_mode` (reads `ExclusiveLock`) |
| The fast path taking no lock | `given_another_host_holding_the_aggregate_lock::waits_with_a_single_space_edit_while_it_is_held_exclusively` |
| The advisory key differing from TypeScript's (`AGGREGATE_LOCK_KEY` made `(1_213_812_818, 2)`) | `given_the_lock_key::is_the_key_the_typescript_store_names_in_each_mode`, `given_the_lock_key::is_the_same_key_in_the_exclusive_and_the_shared_mode` _(re-run)_ |
| `23505` on `resources_pkey` during creation not answered as the ownership refusal | named by the ticket with the port of `:375`, which does not kill it (above); killed by `postgres.rs` › `given_a_row_changed_outside_the_decision::refuses_a_commit_creating_a_space_whose_resource_row_is_already_written` _(re-run, as `cargo-mutants`' `write_created` guard `false`)_ |
| Replacement skipping the per-row relock | `given_overlapping_replacements::conflicts_when_an_authored_commit_wins_after_replacement_reads_its_baseline` (`:416`), `given_overlapping_replacements::rolls_back_an_earlier_rows_relock_when_a_later_row_in_the_same_replacement_conflicts` (`:725`) |
| `23505` on `spaces_pkey` or `repository_state_pkey` rethrown instead of re-read | the three `given_a_writer_outside_the_lock::classifies_initialization_when_a_concurrent_winner_takes_…` cases |
| The Meta relock answering the first identity it read (04's, deferred) | `given_overlapping_replacements::conflicts_a_replacement_authorized_against_an_identity_a_concurrent_replacement_retired` (`:535`), `given_overlapping_replacements::judges_a_complete_aggregate_commit_against_an_identity_a_concurrent_replacement_retired` (`:604`) |
| The revision compared from the decision read (`:812`) | `given_a_writer_outside_the_lock::refuses_an_unlocked_single_space_write_whose_row_moved_after_it_read_the_revision` |
| Equivalent: the conflict answered with the Space read inside the aborted transaction (04's, deferred) | none can on PostgreSQL: the locking transaction is `READ COMMITTED`, so a statement after the row lock sees the other writer's committed row as a fresh read does, and the commit has written nothing to that Space before every row lock is taken |
| Resource rows judged against the decision read (04's, deferred) | `crates/host/tests/sqlite.rs` › `given_a_row_changed_outside_the_decision::refuses_an_update_writing_a_resource_another_space_owns` at 07; on PostgreSQL since 06 by both `contract::commits::stores_…_whole_snapshot_over_recreated_resource_rows` cases |

### 08, classification, outages and start-up (ticket 08)

| Mutant | Killed by |
| --- | --- |
| A refused connection classified unclassified | `postgres_outages.rs` › `given_a_server_that_refuses_connections` |
| A connection closed mid-conversation (`UnexpectedEof`) classified unclassified | `postgres_outages.rs` › `given_a_server_that_hangs_up::names_a_connection_closed_with_a_fin_unavailable_at_once` |
| A wrong password classified Unreachable | `postgres_outages.rs` › `given_a_server_that_refuses_this_client::leaves_a_wrong_password_unclassified_inside_and_outside_a_transaction` and `…_raised_while_connecting_unclassified` |
| `53300` or `57P03` classified unclassified | `postgres_outages.rs` › `given_a_server_that_refuses_this_client::recognises_too_many_clients_raised_while_connecting`, `…recognises_a_server_starting_up_raised_while_connecting` |
| Start-up counting `53300` toward giving up | `postgres_outages.rs` › `given_start_up_over_a_server_that_refuses_this_client::keeps_waiting_out_too_many_connections_past_the_confirming_limit` |
| Start-up not stopping on a confirmed `28P01` | `postgres_outages.rs` › `given_start_up_over_a_server_that_refuses_this_client::gives_up_on_a_wrong_password_once_a_second_attempt_confirms_it` |
| A classification that reads the message instead of the code (`:179`) | `sql::postgres::tests::classify_a_failure` |
| `COMMIT`-time `40001` left unclassified | `postgres_outages.rs` › `given_a_real_server::names_a_serialization_failure_at_commit_unavailable` |

### 09, HTTP and `serve --store postgres` (ticket 09's Comments)

All in `crates/cli/tests/serve_postgres.rs` unless named otherwise, run on PostgreSQL 16.15.

| Mutant | Killed by |
| --- | --- |
| `serve` taking the port before refusing a blank `DATABASE_URL` | `given_a_database_url_it_cannot_serve::refuses_an_unset_or_blank_database_url_before_taking_a_port`, `given_a_database_seeded_with_the_fixture::serves_on_the_port_port_names` |
| `serve` migrating | `given_an_unmigrated_database::gives_up_after_two_confirmed_invariant_failures_and_keeps_serving` |
| `--store postgres` opening SQLite | all 12 tests |
| Reseeding an initialized database | `given_a_database_seeded_with_the_fixture::serves_it_without_reseeding` |
| The `Host` check missing | `given_a_database_seeded_with_the_fixture::answers_421_to_a_request_naming_any_host_but_its_own` |
| `DATABASE_URL` not trimmed | `crates/host/tests/postgres_url.rs` › `trims_the_value` (`serve_postgres` cannot: the `url` crate strips surrounding spaces) |
| Announcing only after start-up succeeds | `given_a_database_that_does_not_answer::announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env`, `given_a_migrated_database_holding_nothing::announces_before_the_database_answers_and_initializes_it_once_it_does` |

### 10, rows across runtimes and the restart proof (PR #556)

| Mutant | Killed by |
| --- | --- |
| Rust writing a document key TypeScript does not read | `crates/host/tests/postgres_rows.rs` › `writes_the_rows_checked_in`, and `test/integration/postgres-rows-across-runtimes.test.ts` › "holds the Rust rows to the rows this host writes" (the read-back test alone cannot: zod drops unknown keys) |
| Rust writing `revision` as a number rather than text | as `f64`: `crates/host/tests/postgres_rows.rs` › `writes_the_next_revision_as_the_decimal_text_typescript_reads`, at revision 2^53+1. Equivalent as `i64`: PostgreSQL writes the same decimal text, and the revision ceiling fits in an `i64` |
| The restart proof's command host ignored (Vite started instead) | `test/unit/restart-proof-host.test.ts` › "starts the command named, and never the Vite host" |

### 11, property tests on PostgreSQL (PR #568)

None of its own: a property test that only compares stores is the wrong killer for a store defect. For information, against `crates/host/tests/postgres_properties.rs` alone, it also kills 06's "Space row not deleted", "`delete_resources_except` deleting no row" and "`spaces` read without `ORDER BY id`".

### 12, the races (ticket 12's Comments)

All in `crates/host/tests/postgres_races.rs`.

| Mutant | Killed by |
| --- | --- |
| A process-wide mutex around `commit` | four races, `lets_map_internal_edits_to_different_spaces_commit_side_by_side` among them |
| The fast path's lock taken exclusive in the statement while the probe still reports shared | `lets_map_internal_edits_to_different_spaces_commit_side_by_side` |
| The fast path's lock dropped | four races, `keeps_a_replacement_from_landing_between_a_fast_path_read_and_its_write` (the recreation race) among them |
