# 06 — Fold ADR 0177 into a PostgreSQL host section of Storage

**Status:** needs-triage

**Blocked by:** the next requirements snapshot refresh (ADR 0175).

**Kind:** documentation.

## What is wrong

Storage has "The SQLite host" (ST-126 to ST-128) and no PostgreSQL counterpart. Its PostgreSQL claims are spread over the operations table, ST-3, ST-10 and ST-120, and the protocol, isolation levels, classification, pool, TLS and `DATABASE_URL` rules live only in ADR 0177, which `python3 scripts/adr_snapshot.py check` lists as pending. Two Storage sentences are also imprecise (`../claims.md`): ST-3 says `crates/host/tests/postgres*.rs` are "ignored by default; they need a server", but `postgres_url.rs` and the stand-in server cases of `postgres_outages.rs` run without one; and ADR 0177 says `close()` waits "through the pool's own close" where it waits on the repository's gate first (`crates/host/src/sql.rs:469-475`).

## What to build

- [ ] At the next refresh, a "The PostgreSQL host" section restating ADR 0177's rules as ST items, each with the test that holds it, citing `../claims.md` for the evidence, and marking "built (untested)" the rules this audit found no test for (03, 04).
- [ ] ST-3's "ignored by default" sentence corrected.

**Named mutants:** none; documentation.
