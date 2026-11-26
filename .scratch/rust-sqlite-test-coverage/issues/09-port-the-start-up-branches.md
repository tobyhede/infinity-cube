# 09 — Port the start-up branches to Rust

**Status:** resolved

**Blocked by:** None (01 and `rust-host/issues/15` are resolved).

**What to build:** Rust tests in `crates/host/tests/startup.rs`, with its scripted store, for the start-up branches `test/unit/database-startup.test.ts` holds and Rust does not. Back-off from 5 s doubling to 60 s and the stop on confirmed broken state are tested already.

- [x] An unclassified failure, code 14 for a directory among them (01), stops start-up after the confirming retry.
- [x] A single unclassified failure that the next attempt does not repeat does not stop it.
- [x] An unclassified failure and an invariant failure in a row count together and stop it, as `test/unit/database-startup.test.ts` holds.
- [x] An unavailable attempt resets the count of uncured failures: `[broken, unavailable, broken, success]` does not stop, as `test/unit/database-startup.test.ts` › "counts invariant failures consecutively, so an outage between them resets" holds; a start-up that never resets the count stops at the third attempt. The existing outage test (`crates/host/tests/startup.rs`) cannot fail on this, because its count is already 0 when the outage comes; a start-up that never resets the count passes it today.
- [x] A one-off invariant failure that the second attempt does not confirm does not stop it.
- [x] Forty unavailable attempts in a row keep retrying at the cap.
- [x] Invalid Default Content stops start-up at once, with no confirming retry (the spec's Settled questions). The scripted store answers its initialization with `AggregateRefused` to reach this branch.

## Comments

### Resolved (2026-11-26)

`crates/host/tests/startup.rs` › `given_failures_no_wait_cures` (an unclassified failure confirmed, a directory at `SQLITE_PATH` confirmed on a real file, a one-off unclassified and a one-off invariant failure, the two counted together in either order, the outage resetting the count, Default Content refused at once and on a retry) and `given_an_unreachable_store` › `keeps_trying_through_forty_unreachable_attempts_at_the_bound`. The scripted store gained `Scripted::refusing`, which answers initialization as intake refusing it (`AggregateRefused`).

`keep_establishing` makes its first attempt as the host composes and counts only the retries after it, so each script opens with an outage and the TypeScript retry sequence follows; `[broken, unavailable, broken, success]` as retries is `[unavailable, broken, unavailable, broken]` as scripted. That is the existing `counts_no_outage_between_two_failures_as_confirming_either`'s script, which does fail when the reset is removed (run below), contrary to this ticket's note; the new test repeats it with the second failure unclassified.

Mutants of `crates/host/src/startup.rs`, each run against `--test startup`:

- the outage no longer resets the count: `counts_failures_consecutively_so_an_outage_between_them_resets` and `counts_no_outage_between_two_failures_as_confirming_either` fail;
- an unclassified failure reset as an outage: `counts_an_unclassified_and_an_invariant_failure_in_a_row_together` and `stops_at_an_unclassified_failure_once_a_second_retry_confirms_it` fail, and `stops_at_a_directory_where_the_sqlite_file_should_be` never ends;
- invalid Default Content retried: `stops_at_once_when_default_content_is_refused` fails.
