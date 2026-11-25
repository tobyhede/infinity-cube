# 09 — Port the start-up branches to Rust

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** Rust tests in `crates/host/tests/startup.rs`, with its scripted store, for the start-up branches `test/unit/database-startup.test.ts` holds and Rust does not. Back-off from 5 s doubling to 60 s and the stop on confirmed broken state are tested already.

- [ ] An unclassified failure, code 14 among them (01), stops start-up after the confirming retry.
- [ ] A one-off invariant failure that the second attempt does not confirm does not stop it.
- [ ] Forty unavailable attempts in a row keep retrying at the cap.
- [ ] Invalid Default Content stops start-up at once, with no confirming retry (the spec's Settled questions).
