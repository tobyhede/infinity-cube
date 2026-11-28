# Independent case map

Built at `32d316f3` from the TypeScript test files alone, not from `.scratch/rust-postgresql-store/case-map.md` and not from the ports test's lists.

Re-read at `5a0956f8`. Twenty-one rows say what holds there: the five once "ported, unmarked", the two blank-`DATABASE_URL` rows of `prisma-foundation`, and the fourteen "one test per value" rows, whose marks now name their values. The restart-proof row and the summary below are corrected too. Every other row, and every line number not in those rows, is as read at `32d316f3`.

## How it was built

1. Which TypeScript tests run on PostgreSQL: a search of `test/` and `packages/*/test` for `postgres`, `1213812818`, `from 'pg'` or `DATABASE_URL` (case-insensitive), then each hit read to see whether it reaches a PostgreSQL store, a PostgreSQL host or `DATABASE_URL`. Kept: the contract (`test/support/repository-contract.ts`, run on PostgreSQL by `test/integration/postgres-space-repository.test.ts`), `test/support/fast-path-races.ts` (run on PostgreSQL by `test/integration/fast-path-races.test.ts`), every `postgres-*` and `prisma-postgres*` file, the PostgreSQL arms of `aggregate-commit-differential`, `database-http-runtime` and `database-cli-targets`, `test/integration/infinity-cube-cli.test.ts`, the PostgreSQL describe blocks of `sql-connection-failure`, `database-startup` and `vite-hono-host`, `prisma-foundation` and `test/e2e/postgres-persistence.spec.ts`. Left out, each read: `cli-database-entry-phases`, `database-entry` and `test/unit/infinity-cube-cli.test.ts` (a `postgres` key on a fake target, no store), `shared-migrations` (migration files, rust-host 16), `e2e-ports`, `ci-container-image-pin` and `restart-proof-host` (tooling), the SQLite files, and the store-independent describes of `database-startup` and `vite-hono-host` and its "Database HTTP runtime shutdown" describe, which run over fakes or the memory store.
2. Every `it` and `test` call in those files, with its describe chain and line, by a TypeScript AST walk of my own (`evidence.md` › `cases.mjs`).
3. Every `// Case:` line in every Rust file the workspace tracks, with the test function below it (`evidence.md` › `map.mjs`). At `5a0956f8` the `// TypeScript case:` lines of `crates/cli/tests/serve_postgres.rs`, which the ports test reads as that file's marks, count as marks too. A case counts as ported on PostgreSQL only by a mark in a file that runs on PostgreSQL: `crates/host/tests/postgres*.rs`, `crates/cli/tests/serve_postgres.rs`, `crates/host/src/sql/postgres/tests.rs`, or the contract table, which `crates/host/tests/postgres.rs:241` runs.
4. Every row without such a mark read by hand against the Rust tests (`evidence.md` › `render.mjs` holds those verdicts), and every exemption judged against the code.

## Result

153 cases: **137 ported** (122 marked one to one, 14 marked once per value over one test per value, 1 ported by CI configuration), **16 exempt**, every exemption judged true, and **0 missing**. That is 2 more ported and 2 fewer exempt than at `32d316f3`: the two blank-`DATABASE_URL` rows of `prisma-foundation`, which the ports test counts as ported by their marks.

What the counts hide, at `5a0956f8`:

- **The ports test holds most of this.** `test/unit/repository-contract-rust-ports.test.ts:732-752` reads every file this map counts as running on PostgreSQL but `crates/host/tests/postgres_wire.rs` and `postgres_rows.rs`. It pins 178 runs ported and 0 pending (`:925-935`), and passes. The three rows of `postgres-rows-across-runtimes.test.ts` are in none of its lists. Ticket 01.
- **Every port carries a mark.** The five rows ticket 02 names carry `// TypeScript case:` marks in `crates/cli/tests/serve_postgres.rs`, which the ports test reads (`:744`, `:750`).

"Ported (one test per value)": the TypeScript case runs once per value, and Rust has one test per value, named by its function (or one `each!` arm per value in `crates/host/src/sql/postgres/tests.rs`). At `5a0956f8` each carries a mark naming the case and its value, `// Case: <name> (<value>)`. The evidence column names the first test; the others follow it. Every value count matches the TypeScript table: 12 SQLSTATEs, 6 socket failures (the sixth, `EAI_AGAIN`, answered unclassified as ADR 0177 accepts), 4 error codes, 4 cause-chain values, 4 operations, 3 and 2 SQLSTATEs inside and outside a transaction, 2 and 3 while connecting, 2 and 2 misconfigurations, 3 initialization boundaries. Rust keeps no cause chain, so the four "walks the cause chain to %s" ports and "terminates on a cyclic cause chain" test the real failure each wrapped error stands for, which I judge a faithful port.

The contract rows name the function in `crates/host/tests/repository_contract/`; each runs on PostgreSQL through `crates/host/tests/postgres.rs:241`, whose harness provides every member (`:164-234`, no `Unprovided`).

### `test/support/repository-contract.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 485 | preserves the established aggregate across a fresh repository host | ported | `crates/host/tests/repository_contract/lifecycle.rs:81` `preserves_the_established_aggregate_across_a_fresh_host` |
| 498 | persists first-working-load initialization for a fresh repository host | ported | `crates/host/tests/repository_contract/lifecycle.rs:131` `persists_first_working_load_initialization_for_a_fresh_host` |
| 530 | replaces * stored state through the destructive lifecycle door | ported | `crates/host/tests/repository_contract/broken.rs:56` `replaces_an_invalid_space_document` (invalid-space-document)<br>`crates/host/tests/repository_contract/broken.rs:61` `replaces_an_invalid_aggregate` (invalid-aggregate) |
| 562 | names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower | ported | `crates/host/tests/repository_contract/broken.rs:68` `names_a_broken_document_broken_on_the_fast_path_and_load_space` |
| 577 | truncates stored Spaces without a Meta identity only when none was expected | ported | `crates/host/tests/repository_contract/broken.rs:141` `truncates_spaces_without_a_meta_identity_only_when_none_was_expected` |
| 597 | initializes and replaces only through explicit Meta-rooted aggregates | ported | `crates/host/tests/repository_contract/lifecycle.rs:176` `initializes_and_replaces_only_through_meta_rooted_aggregates` |
| 630 | classifies canonical and different initialization proposals | ported | `crates/host/tests/repository_contract/lifecycle.rs:232` `classifies_canonical_and_different_initialization_proposals` |
| 656 | refuses a replacement proposal naming a Meta Space it does not hold | ported | `crates/host/tests/repository_contract/lifecycle.rs:267` `refuses_a_replacement_naming_a_meta_space_it_does_not_hold` |
| 677 | ignores object-key insertion order when classifying initialization | ported | `crates/host/tests/repository_contract/lifecycle.rs:290` `ignores_object_key_order_when_classifying_initialization` |
| 709 | lets only one different concurrent initialization establish state | ported | `crates/host/tests/repository_contract/lifecycle.rs:329` `lets_only_one_different_concurrent_initialization_establish_state` |
| 725 | rolls back a refused replacement | ported | `crates/host/tests/repository_contract/lifecycle.rs:358` `rolls_back_a_refused_replacement` |
| 742 | refuses replacement before initialization | ported | `crates/host/tests/repository_contract/lifecycle.rs:380` `refuses_replacement_before_initialization` |
| 754 | reads the stored Meta identity as each lifecycle door leaves it | ported | `crates/host/tests/repository_contract/lifecycle.rs:402` `reads_the_meta_identity_as_each_door_leaves_it` |
| 770 | refuses a replacement expecting no Meta identity where one is stored | ported | `crates/host/tests/repository_contract/lifecycle.rs:424` `refuses_a_replacement_expecting_no_meta_identity_where_one_is_stored` |
| 785 | refuses a replacement authorized against a superseded Meta identity | ported | `crates/host/tests/repository_contract/lifecycle.rs:451` `refuses_a_replacement_authorized_against_a_superseded_meta_identity` |
| 816 | refuses to record an exported revision for a Space it does not store | ported | `crates/host/tests/repository_contract/lifecycle.rs:490` `refuses_to_record_an_exported_revision_for_a_space_it_does_not_store` |
| 824 | refuses an aggregate that repeats a Space identity, storing none of it | ported | `crates/host/tests/repository_contract/lifecycle.rs:506` `refuses_an_aggregate_repeating_a_space_identity` |
| 849 | refuses an aggregate that repeats a Resource identity, storing none of it | ported | `crates/host/tests/repository_contract/lifecycle.rs:529` `refuses_an_aggregate_repeating_a_resource_identity` |
| 889 | refuses a replacement that repeats a * identity, keeping the stored aggregate | ported | `crates/host/tests/repository_contract/lifecycle.rs:576` `refuses_a_replacement_repeating_a_space_identity` (Space)<br>`crates/host/tests/repository_contract/lifecycle.rs:589` `refuses_a_replacement_repeating_a_resource_identity` (Resource) |
| 909 | refuses an initialization that fails domain intake, storing none of it | ported | `crates/host/tests/repository_contract/lifecycle.rs:604` `refuses_an_initialization_failing_domain_intake` |
| 930 | replaces everything stored, freeing the Resource ids it clears | ported | `crates/host/tests/repository_contract/lifecycle.rs:625` `replaces_everything_stored_freeing_the_resource_ids_it_clears` |
| 954 | raises an identifiable invariant failure for a stored Space whose revision is not canonical | ported | `crates/host/tests/repository_contract/broken.rs:179` `fails_a_stored_revision_that_is_not_canonical` |
| 970 | becomes committable from an empty store | ported | `crates/host/tests/repository_contract/lifecycle.rs:658` `becomes_committable_from_an_empty_store` |
| 993 | stores and reloads an Image Resource unchanged | ported | `crates/host/tests/repository_contract/content.rs:109` `stores_and_reloads_an_image_resource_unchanged` |
| 1043 | stores and reloads an Ur Resource and a Reference Resource to it unchanged | ported | `crates/host/tests/repository_contract/content.rs:144` `stores_and_reloads_an_ur_resource_and_a_reference_to_it` |
| 1079 | stores, renames and reloads a Resource whose plugin is missing unchanged | ported | `crates/host/tests/repository_contract/content.rs:203` `stores_renames_and_reloads_a_resource_whose_plugin_is_missing` |
| 1137 | carries a Resource whose plugin is missing through Import and Export byte-identical | ported | `crates/host/tests/repository_contract/content.rs:266` `carries_a_missing_plugin_resource_through_import_and_export` |
| 1235 | hands a Resource whose plugin is missing to that plugin when it returns | ported | `crates/host/tests/repository_contract/content.rs:335` `hands_a_missing_plugin_resource_to_its_plugin_when_it_returns` |
| 1325 | refuses a topology-preserving update when stored Spaces have no Meta identity | ported | `crates/host/tests/repository_contract/broken.rs:192` `refuses_an_update_when_stored_spaces_have_no_meta_identity` |
| 1340 | stores an initialized Space, then lists, loads and commits it | ported | `crates/host/tests/repository_contract/commits.rs:84` `stores_an_initialized_space_then_lists_loads_and_commits_it` |
| 1366 | keeps an Edge's Title and hidden flag through initialization, commit and load | ported | `crates/host/tests/repository_contract/content.rs:451` `keeps_an_edges_title_and_hidden_flag` |
| 1403 | keeps a Graph's head shape through initialization, commit and load | ported | `crates/host/tests/repository_contract/content.rs:470` `keeps_a_graphs_head_shape` |
| 1440 | keeps every Resource's Map content through initialization, commit and load | ported | `crates/host/tests/repository_contract/content.rs:485` `keeps_every_resources_map_content` |
| 1503 | keeps every Resource through a topology-preserving commit's own delete | ported | `crates/host/tests/repository_contract/commits.rs:122` `keeps_every_resource_through_a_topology_preserving_commits_own_delete` |
| 1522 | refuses to create a new unreachable Space by removing its last reference alone | ported | `crates/host/tests/repository_contract/commits.rs:143` `refuses_to_create_an_unreachable_space_by_removing_its_last_reference` |
| 1544 | atomically creates, links, reads, converges on, and deletes a Space | ported | `crates/host/tests/repository_contract/commits.rs:168` `atomically_creates_links_reads_converges_on_and_deletes_a_space` |
| 1645 | refuses an authored commit that deletes the Meta Space | ported | `crates/host/tests/repository_contract/commits.rs:238` `refuses_an_authored_commit_deleting_the_meta_space` |
| 1668 | keeps each Space Resource's own selection across a later default Map change | ported | `crates/host/tests/repository_contract/content.rs:509` `keeps_each_space_resources_selection_across_a_default_map_change` |
| 1787 | reports every conflict and rolls back every refused aggregate | ported | `crates/host/tests/repository_contract/commits.rs:258` `reports_every_conflict_and_rolls_back_every_refused_aggregate` |
| 1823 | answers a stale expected revision with the current aggregate | ported | `crates/host/tests/repository_contract/commits.rs:290` `answers_a_stale_expected_revision_with_the_current_space` |
| 1838 | refuses a commit that fails domain intake and stores nothing | ported | `crates/host/tests/repository_contract/commits.rs:315` `refuses_a_commit_failing_domain_intake_storing_nothing` |
| 1851 | refuses a commit for a Space it does not store | ported | `crates/host/tests/repository_contract/commits.rs:330` `refuses_a_commit_for_a_space_it_does_not_store` |
| 1863 | refuses a commit whose Space id differs from its snapshot id | ported | `crates/host/tests/repository_contract/commits.rs:343` `refuses_a_commit_whose_space_id_differs_from_its_snapshot_id` |
| 1884 | refuses an update whose snapshot names another stored Space at a matching revision | ported | `crates/host/tests/repository_contract/commits.rs:365` `refuses_an_update_naming_another_stored_space_at_a_matching_revision` |
| 1916 | places a single update's failed intake at its Space's position in the aggregate | ported | `crates/host/tests/repository_contract/commits.rs:396` `places_a_single_updates_failed_intake_at_its_position` |
| 1949 | refuses a commit that names one Space more than once | ported | `crates/host/tests/repository_contract/commits.rs:437` `refuses_a_commit_naming_one_space_more_than_once` |
| 1976 | refuses a commit claiming a Resource another Space owns | ported | `crates/host/tests/repository_contract/commits.rs:456` `refuses_a_commit_claiming_a_resource_another_space_owns` |
| 2001 | scopes Graph identities to their containing Space | ported | `crates/host/tests/repository_contract/commits.rs:490` `scopes_graph_identities_to_their_space` |
| 2029 | refuses an unreferenced ordinary Space even when its Graph identity is reused | ported | `crates/host/tests/repository_contract/commits.rs:529` `refuses_an_unreferenced_space_even_reusing_a_graph_identity` |
| 2044 | permits a Graph and Resource to share an identity | ported | `crates/host/tests/repository_contract/commits.rs:566` `permits_a_graph_and_a_resource_to_share_an_identity` |
| 2055 | refuses two Maps in one Space that own the same Graph identity | ported | `crates/host/tests/repository_contract/commits.rs:588` `refuses_two_maps_owning_one_graph_identity` |
| 2086 | keeps the Resources a commit names and drops the ones it omits | ported | `crates/host/tests/repository_contract/commits.rs:641` `keeps_the_resources_a_commit_names_and_drops_the_rest` |
| 2099 | drops every Resource when a commit omits them all | ported | `crates/host/tests/repository_contract/commits.rs:659` `drops_every_resource_when_a_commit_omits_them_all` |
| 2123 | returns a Space's Resources in ascending id order however they were supplied | ported | `crates/host/tests/repository_contract/commits.rs:672` `answers_resources_in_ascending_id_order_however_supplied` |
| 2151 | records an exported revision and carries it across later commits | ported | `crates/host/tests/repository_contract/commits.rs:714` `records_an_exported_revision_and_carries_it_across_commits` |
| 2166 | refuses to mark an exported revision above the storage ceiling | ported | `crates/host/tests/repository_contract/commits.rs:736` `refuses_to_mark_an_exported_revision_above_the_ceiling` |
| 2178 | stores and commits a revision above Number.MAX_SAFE_INTEGER as canonical decimal text | ported | `crates/host/tests/repository_contract/commits.rs:759` `stores_and_commits_a_revision_above_the_largest_safe_integer` |
| 2208 | refuses to store a revision above the 2^63-1 ceiling | ported | `crates/host/tests/repository_contract/broken.rs:217` `refuses_to_store_a_revision_above_the_ceiling` |
| 2227 | raises an identifiable invariant failure for a stored Space whose revision exceeds the 2^63-1 ceiling | ported | `crates/host/tests/repository_contract/broken.rs:241` `fails_a_stored_revision_above_the_ceiling` |
| 2243 | raises an identifiable invariant failure for a commit whose fast-path candidate has a non-canonical stored revision | ported | `crates/host/tests/repository_contract/broken.rs:256` `fails_a_fast_path_commit_over_a_revision_that_is_not_canonical` |
| 2262 | writes only the Resource a topology-preserving commit changed | ported | `crates/host/tests/repository_contract/commits.rs:788` `writes_only_the_resource_a_topology_preserving_commit_changed` |
| 2295 | writes only the new and changed Resources on the complete-aggregate path | ported | `crates/host/tests/repository_contract/commits.rs:833` `writes_only_the_new_and_changed_resources_on_the_aggregate_path` |
| 2332 | writes no Resource for a commit at a stale revision | ported | `crates/host/tests/repository_contract/commits.rs:873` `writes_no_resource_for_a_commit_at_a_stale_revision` |
| 2382 | moves an unchanged Resource between Spaces in one commit | ported | `crates/host/tests/repository_contract/commits.rs:918` `moves_an_unchanged_resource_between_spaces_in_one_commit` |
| 2397 | writes a moved Resource through the ownership check, which refuses it before its Space releases it | exempt | Accepted difference (ADR 0176, Storage ST-20): a commit's answer does not depend on change order. **True**: `write_changes` deletes, then row-locks, then drops every Resource before writing any (`crates/host/src/sql.rs:730-797`), so the receiving-first move commits; `commits_a_move_whichever_space_it_lists_first` (`crates/host/tests/repository_contract/commits.rs`) holds it on PostgreSQL through the table. |
| 2444 | stores a * commit's whole snapshot over Resource rows recreated before its row lock | ported | `crates/host/tests/repository_contract/commits.rs:1181` `stores_a_topology_preserving_commits_whole_snapshot_over_recreated_resource_rows` (topology-preserving)<br>`crates/host/tests/repository_contract/commits.rs:1194` `stores_a_complete_aggregate_commits_whole_snapshot_over_recreated_resource_rows` (complete-aggregate) |
| 2477 | stores an asset of any type and loads its bytes and media type unchanged | ported | `crates/host/tests/repository_contract/assets.rs:26` `stores_an_asset_of_any_type_and_loads_it_unchanged` |
| 2511 | holds a Markdown Resource decoded from its file, and its text, as the same value | ported | `crates/host/tests/repository_contract/assets.rs:99` `holds_a_markdown_resource_from_its_file_and_its_text_as_one_value` |
| 2545 | stores the same bytes once, keeping the first media type | ported | `crates/host/tests/repository_contract/assets.rs:176` `stores_the_same_bytes_once_keeping_the_first_media_type` |
| 2557 | answers an asset it does not store as absent | ported | `crates/host/tests/repository_contract/assets.rs:195` `answers_an_asset_it_does_not_store_as_absent` |
| 2564 | holds the asset of zero bytes already, under the type it always has | ported | `crates/host/tests/repository_contract/assets.rs:204` `holds_the_asset_of_zero_bytes_already` |
| 2574 | keeps stored assets outside the aggregate its lifecycle doors replace | ported | `crates/host/tests/repository_contract/assets.rs:217` `keeps_stored_assets_outside_the_aggregate_the_doors_replace` |
| 2590 | keeps a stored asset across a fresh repository host | ported | `crates/host/tests/repository_contract/assets.rs:246` `keeps_a_stored_asset_across_a_fresh_host` |

### `test/integration/postgres-space-repository.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 287 | refuses a write of text that is not JSON into spaces.document | ported | `crates/host/tests/postgres_concurrency.rs:377` `refuses_a_write_of_text_that_is_not_json_into_spaces_document` |
| 317 | settles two overlapping truncations of Spaces stored without Meta as results | ported | `crates/host/tests/postgres_concurrency.rs:906` `settles_two_overlapping_truncations_of_spaces_stored_without_meta_as_results` |
| 375 | classifies initialization when a concurrent winner takes a shared Resource identity | ported | `crates/host/tests/postgres_concurrency.rs:613` `classifies_initialization_when_a_concurrent_winner_takes_a_shared_resource_identity` |
| 416 | conflicts when an authored commit wins after replacement reads its baseline | ported | `crates/host/tests/postgres_concurrency.rs:957` `conflicts_when_an_authored_commit_wins_after_replacement_reads_its_baseline` |
| 475 | conflicts the loser when two replacements overlap on the Meta row lock | ported | `crates/host/tests/postgres_concurrency.rs:997` `conflicts_the_loser_when_two_replacements_overlap_on_the_meta_row_lock` |
| 535 | conflicts a replacement authorized against an identity a concurrent replacement retired | ported | `crates/host/tests/postgres_concurrency.rs:1086` `conflicts_a_replacement_authorized_against_an_identity_a_concurrent_replacement_retired` |
| 604 | judges a complete-aggregate commit against an identity a concurrent replacement retired | ported | `crates/host/tests/postgres_concurrency.rs:1120` `judges_a_complete_aggregate_commit_against_an_identity_a_concurrent_replacement_retired` |
| 725 | rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts | ported | `crates/host/tests/postgres_concurrency.rs:1175` `rolls_back_an_earlier_rows_relock_when_a_later_row_in_the_same_replacement_conflicts` |
| 765 | prevents direct deletion of the Meta Space while repository state names it | ported | `crates/host/tests/postgres_concurrency.rs:402` `prevents_direct_deletion_of_the_meta_space_while_repository_state_names_it` |
| 778 | commits a topology-preserving edit without waiting for the repository singleton lock | ported | `crates/host/tests/postgres_concurrency.rs:730` `commits_a_topology_preserving_edit_without_waiting_for_the_repository_singleton_lock` |
| 812 | refuses an unlocked single-Space write whose row moved after it read the revision | ported | `crates/host/tests/postgres_concurrency.rs:764` `refuses_an_unlocked_single_space_write_whose_row_moved_after_it_read_the_revision` |
| 855 | refuses a multi-Space write whose row moved after the conflict check read it | ported | `crates/host/tests/postgres_concurrency.rs:854` `refuses_a_multi_space_write_whose_row_moved_after_the_conflict_check_read_it` |
| 947 | serializes concurrent topology commits so the loser observes the complete winner | ported | `crates/host/tests/postgres_concurrency.rs:1223` `serializes_concurrent_topology_commits_so_the_loser_observes_the_complete_winner` |

### `test/integration/postgres-aggregate-initialization.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 124 | preserves the successful proposal when another initializer already read an empty aggregate | ported | `crates/host/tests/postgres_concurrency.rs:1473` `preserves_the_successful_proposal_when_another_initializer_already_read_an_empty_aggregate` |
| 142 | does not replace a concurrent first aggregate using an absent expected Meta identity | ported | `crates/host/tests/postgres_concurrency.rs:1499` `does_not_replace_a_concurrent_first_aggregate_using_an_absent_expected_meta_identity` |
| 157 | reads a consistent uninitialized aggregate while another runtime initializes it | ported | `crates/host/tests/postgres_concurrency.rs:1526` `reads_a_consistent_uninitialized_aggregate_while_another_runtime_initializes_it` |
| 169 | judges a complete-aggregate commit against the aggregate a concurrent initializer establishes | ported | `crates/host/tests/postgres_concurrency.rs:1549` `judges_a_complete_aggregate_commit_against_the_aggregate_a_concurrent_initializer_establishes` |
| 194 | initializes without losing integrity after $boundary with $expected competing proposal | ported (one test per value) | `crates/host/tests/postgres_concurrency.rs:1612` `initializes_without_losing_integrity_after_meta_read_with_already_initialized_competing_proposal`<br>`crates/host/tests/postgres_concurrency.rs:1623` `initializes_without_losing_integrity_after_meta_read_with_existing_competing_proposal`<br>`crates/host/tests/postgres_concurrency.rs:1634` `initializes_without_losing_integrity_after_meta_delete_with_already_initialized_competing_proposal` |

### `test/integration/postgres-misconfiguration.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 69 | leaves the transactional aggregate read unclassified with the raw handshake refusal | ported (one test per value) | `crates/host/tests/postgres_outages.rs:670` `leaves_the_aggregate_read_unclassified_given_a_wrong_password`<br>`crates/host/tests/postgres_outages.rs:681` `leaves_the_aggregate_read_unclassified_given_a_database_that_does_not_exist` |
| 82 | leaves a direct read unclassified with the normalised refusal | ported (one test per value) | `crates/host/tests/postgres_outages.rs:691` `leaves_a_direct_read_unclassified_given_a_wrong_password`<br>`crates/host/tests/postgres_outages.rs:702` `leaves_a_direct_read_unclassified_given_a_database_that_does_not_exist` |
| 101 | gives up once a second attempt confirms the refusal | ported | `crates/host/tests/postgres_outages.rs:712` `gives_up_once_a_second_attempt_confirms_the_refusal` |

### `test/integration/prisma-postgres.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 13 | writes and reads a typed space document with its resource | ported | `crates/host/tests/postgres.rs:252` `writes_and_reads_a_typed_space_document_with_its_resource` |
| 49 | advances updatedAt when a space is updated | ported | `crates/host/tests/postgres.rs:297` `advances_a_spaces_updated_at_when_it_is_updated` |

### `test/integration/postgres-rows-across-runtimes.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 21 | holds the checked-in TypeScript rows to what the script writes now | exempt | Not a store case: the TypeScript half of the cross-runtime row check (ticket 10), whose Rust half is `crates/host/tests/postgres_rows.rs`. **True**, but the ports test does not list the file (ticket 01). |
| 30 | holds the Rust rows to the rows this host writes | exempt | As above: it reads the rows `crates/host/tests/postgres_rows.rs` › `writes_the_rows_checked_in` writes. **True**. |
| 36 | reads the rows the Rust host wrote as the memory store runs the script | exempt | As above. **True**. |

### `test/support/fast-path-races.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 294 | commits a Map-internal Edit under the shared aggregate lock only | ported | `crates/host/tests/postgres_races.rs:359` `commits_a_map_internal_edit_under_the_shared_aggregate_lock_only` |
| 311 | serialises a Map-internal Edit that read first before a Graph deletion that reads after | ported | `crates/host/tests/postgres_races.rs:398` `serialises_a_map_internal_edit_that_read_first_before_a_graph_deletion` |
| 340 | serialises a Graph deletion that read first before a Map-internal Edit that reads after | ported | `crates/host/tests/postgres_races.rs:441` `serialises_a_graph_deletion_that_read_first_before_a_map_internal_edit` |
| 373 | keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write | ported | `crates/host/tests/postgres_races.rs:481` `keeps_a_replacement_from_landing_between_a_fast_path_read_and_its_write` |
| 403 | keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved | ported | `crates/host/tests/postgres_races.rs:533` `keeps_a_space_deletion_from_passing_at_a_revision_an_uncommitted_fast_path_moved` |
| 436 | lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently | ported | `crates/host/tests/postgres_races.rs:579` `lets_map_internal_edits_to_different_spaces_commit_side_by_side` |

### `test/integration/aggregate-commit-differential.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 21 | gives memory and PostgreSQL the same public outcome over generated aggregate changes | ported | `crates/host/tests/postgres_properties.rs:107` `answers_every_commit_as_the_memory_store_does_and_ends_holding_the_same_aggregate` |

### `test/integration/database-http-runtime.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 102 | establishes Default Content and serves the collection and Meta Space | ported | `crates/cli/tests/serve_postgres.rs:374` `given_a_migrated_database_holding_nothing::initializes_it_from_default_content_and_serves_it`, marked `// TypeScript case: … (PostgreSQL)` at `:371` |
| 135 | recovers through the shared retry after a transient startup failure | ported | `crates/cli/tests/serve_postgres.rs:403` `given_a_migrated_database_holding_nothing::announces_before_the_database_answers_and_initializes_it_once_it_does`, a real outage in place of the injected one, marked `// TypeScript case: … (PostgreSQL)` at `:400` |
| 179 | gives up through the shared retry after two confirmed invariant failures | ported | `crates/cli/tests/serve_postgres.rs:664` `given_an_unmigrated_database::gives_up_after_two_confirmed_invariant_failures_and_keeps_serving`, marked `// TypeScript case: … (PostgreSQL)` at `:661` |

### `test/integration/database-cli-targets.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 112 | imports and exports the same aggregate through the store --store names | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |

### `test/integration/infinity-cube-cli.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 175 | imports through the real command and durably reports the stored space | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |
| 220 | imports every Space of an aggregate and takes Meta from aggregate.json | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |
| 251 | refuses an import over an initialized repository and leaves the Meta Space alone | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |
| 291 | exports through the real command and records the projected PostgreSQL revision | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |
| 349 | round-trips the stored aggregate through the real export and import commands | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |
| 400 | stores the assets an imported directory carries, and exports them again | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |
| 422 | reports a malformed resource path and stores no partial space | exempt | Owned elsewhere: rust-host 17 and 26 (the CLI's import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb. |

### `test/unit/postgres-unreachable.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 69 | names the aggregate read unavailable, keeping the driver error on cause | ported | `crates/host/tests/postgres_outages.rs:182` `names_the_aggregate_read_unavailable` |
| 76 | names a commit unavailable | ported | `crates/host/tests/postgres_outages.rs:200` `names_a_commit_unavailable` |
| 94 | names establishment unavailable | ported | `crates/host/tests/postgres_outages.rs:215` `names_establishment_unavailable` |
| 109 | names %s unavailable, keeping the refusal on the cause chain | ported (one test per value) | `crates/host/tests/postgres_outages.rs:228` `names_list_spaces_unavailable`<br>`crates/host/tests/postgres_outages.rs:237` `names_load_space_unavailable`<br>`crates/host/tests/postgres_outages.rs:246` `names_load_meta_space_id_unavailable`<br>`crates/host/tests/postgres_outages.rs:255` `names_mark_exported_unavailable` |
| 133 | reaches the database on the next read rather than repeating the first failure | ported | `crates/host/tests/postgres_outages.rs:817` `reaches_the_database_on_the_next_read_rather_than_repeating_the_first_failure` |
| 194 | leaves SQLSTATE %s unclassified inside and outside a transaction | ported (one test per value) | `crates/host/tests/postgres_outages.rs:397` `leaves_a_wrong_password_unclassified_inside_and_outside_a_transaction`<br>`crates/host/tests/postgres_outages.rs:427` `leaves_no_hba_entry_unclassified_inside_and_outside_a_transaction`<br>`crates/host/tests/postgres_outages.rs:433` `leaves_a_missing_database_unclassified_inside_and_outside_a_transaction` |
| 214 | names SQLSTATE %s unavailable inside and outside a transaction | ported (one test per value) | `crates/host/tests/postgres_outages.rs:439` `names_too_many_clients_unavailable_inside_and_outside_a_transaction`<br>`crates/host/tests/postgres_outages.rs:445` `names_a_server_starting_up_unavailable_inside_and_outside_a_transaction` |
| 243 | answers a refused connection on a direct read 503 persistence-unavailable | ported | `crates/host/tests/postgres_outages.rs:282` `answers_a_refused_connection_on_a_direct_read_503_persistence_unavailable` |
| 255 | answers a wrong password on a direct read 500 internal-error | ported | `crates/host/tests/postgres_outages.rs:499` `answers_a_wrong_password_on_a_direct_read_500_internal_error` |

### `test/unit/postgres-aggregate-lock-key.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 16 | is the same key in the exclusive and the shared mode | ported | `crates/host/tests/postgres_concurrency.rs:495` `is_the_same_key_in_the_exclusive_and_the_shared_mode` |

### `test/unit/prisma-postgres-env-path.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 29 | names the root .env from the bundled runtime and from the source alike | exempt | Accepted difference Q7: the search starts at the current directory. **True**: `crates/cli/src/serve.rs:102-105`. |
| 45 | prefers the nearest .env above the starting directory | ported | `crates/host/tests/postgres_url.rs:21` `prefers_the_nearest_env_above_the_starting_directory` |
| 55 | answers undefined rather than a path no file sits at | ported | `crates/host/tests/postgres_url.rs:37` `answers_none_rather_than_a_path_no_file_sits_at` |
| 67 | starts from this module’s own directory when given no starting point | exempt | Accepted difference Q7, as above. **True**. |

### `test/unit/sql-connection-failure.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 70 | recognises %s whatever its transient flag says | ported (one test per value) | `crates/host/src/sql/postgres/tests.rs:111` `recognises_a_connection_the_server_dropped` |
| 80 | recognises the socket failure %s the driver normalised | ported (one test per value) | `crates/host/src/sql/postgres/tests.rs:119` `recognises_econnrefused_with_its_words` |
| 89 | leaves a host name that does not resolve unclassified when the driver normalised it | ported | `crates/host/src/sql/postgres/tests.rs:132` `leaves_a_host_name_that_does_not_resolve_unclassified` |
| 98 | recognises SQLSTATE %s on a statement the driver normalised | ported (one test per value) | `crates/host/src/sql/postgres/tests.rs:139` `recognises_sqlstate_08000` |
| 105 | names the set ticket 31 records | ported | `crates/host/src/sql/postgres/tests.rs:168` `names_the_set_the_typescript_store_names` |
| 126 | recognises SQLSTATE %s raised while connecting | ported (one test per value) | `crates/host/tests/postgres_outages.rs:451` `recognises_too_many_clients_raised_while_connecting`<br>`crates/host/tests/postgres_outages.rs:457` `recognises_a_server_starting_up_raised_while_connecting` |
| 134 | leaves SQLSTATE %s raised while connecting unclassified | ported (one test per value) | `crates/host/tests/postgres_outages.rs:463` `leaves_a_wrong_password_raised_while_connecting_unclassified`<br>`crates/host/tests/postgres_outages.rs:469` `leaves_no_hba_entry_raised_while_connecting_unclassified`<br>`crates/host/tests/postgres_outages.rs:475` `leaves_a_missing_database_raised_while_connecting_unclassified` |
| 144 | recognises the socket failure %s | ported (one test per value) | `crates/host/src/sql/postgres/tests.rs:180` `recognises_the_socket_failure_econnrefused`<br>`crates/host/src/sql/postgres/tests.rs:193` `leaves_a_resolver_that_failed_for_now_unclassified` |
| 153 | leaves the error code %s unclassified | ported (one test per value) | `crates/host/src/sql/postgres/tests.rs:200` `leaves_enotfound_unclassified` |
| 162 | walks the cause chain to %s | ported (one test per value) | `crates/host/tests/postgres_outages.rs:267` `names_a_commit_unavailable_when_its_socket_is_refused`<br>`crates/host/tests/postgres_outages.rs:483` `names_a_commit_unavailable_when_the_server_is_starting_up`<br>`crates/host/tests/postgres_outages.rs:892` `names_a_serialization_failure_at_commit_unavailable`<br>`crates/host/tests/postgres_outages.rs:906` `names_a_commit_whose_connection_the_server_ended_unavailable` |
| 175 | terminates on a cyclic cause chain | ported | `crates/host/src/sql/postgres/tests.rs:213` `reads_a_failure_by_itself_and_not_what_it_wraps` |
| 179 | leaves a defect, an unknown code and a code named only in prose unclassified | ported | `crates/host/src/sql/postgres/tests.rs:220` `leaves_a_unique_violation_unclassified` |

### `test/unit/database-startup.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 455 | gives up on a wrong password once a second attempt confirms it | ported | `crates/host/tests/postgres_outages.rs:577` `gives_up_on_a_wrong_password_once_a_second_attempt_confirms_it` |
| 477 | keeps waiting out too many connections past the confirming limit | ported | `crates/host/tests/postgres_outages.rs:610` `keeps_waiting_out_too_many_connections_past_the_confirming_limit` |

### `test/unit/vite-hono-host.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 974 | composes an application when the repository cannot be reached | ported | `crates/cli/tests/serve_postgres.rs:157` `given_a_database_that_does_not_answer::announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env`, marked `// TypeScript case:` at `:154` |

### `test/unit/prisma-foundation.test.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 26 | advances %s.updatedAt when a record is updated | ported | `crates/host/tests/postgres.rs:297` `advances_a_spaces_updated_at_when_it_is_updated` (Space)<br>`crates/host/tests/postgres.rs:339` `advances_a_resources_updated_at_and_keeps_its_created_at_when_it_is_updated` (Resource) |
| 45 | omits a database connection when DATABASE_URL is blank | ported | `crates/cli/tests/serve_postgres.rs:115` `given_a_database_url_it_cannot_serve::refuses_an_unset_or_blank_database_url_before_taking_a_port`, marked `// TypeScript case:` at `:112`. The port is the settled difference: `serve` refuses a blank URL (`crates/host/tests/postgres_url.rs:128`), and migration is rust-host 16 (Q13). |
| 53 | trims a configured DATABASE_URL | ported | `crates/cli/tests/serve_postgres.rs:157` `given_a_database_that_does_not_answer::announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env`, marked `// TypeScript case:` at `:155`; `crates/host/tests/postgres_url.rs:74` `given_the_environment::trims_the_value` tests the trim too and carries no mark |
| 63 | constructs the runtime client without a blank DATABASE_URL binding | ported | `crates/cli/tests/serve_postgres.rs:115` `given_a_database_url_it_cannot_serve::refuses_an_unset_or_blank_database_url_before_taking_a_port`, marked `// TypeScript case:` at `:113`. The port is the settled difference (rust-host 16 Agent Brief, ADR 0177): Rust refuses a blank `DATABASE_URL` where TypeScript builds a client on the driver's defaults. |
| 73 | bootstraps singleton repository state from the legacy Entry Space | exempt | Owned elsewhere: rust-host 16, migration history. **True**: no Rust migrator exists yet (`infinity-cube migrate` is not built, Storage operations table). |
| 99 | reaches the emitted contract from the existing migration head | exempt | Owned elsewhere: rust-host 16. **True**, as above. |

### `test/e2e/postgres-persistence.spec.ts`

| Line | Case | Verdict | Rust test or reason |
| --- | --- | --- | --- |
| 71 | a PostgreSQL-backed edit survives a fresh host | ported, by CI configuration | `.github/workflows/ci.yml:266` runs this spec against `infinity-cube serve --store postgres`; no Rust file can carry its mark. At `5a0956f8` the ports test exempts it as owned elsewhere, `rust-postgresql-store 10` (`test/unit/repository-contract-rust-ports.test.ts:693-695`). |
