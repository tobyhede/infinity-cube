# 02: Move the SQLite host rules into the Storage requirements

**What to build:** Someone running or changing the SQLite host finds its rules in the Storage requirements, each naming the test that holds it, and the README carries only how to use it. Today the README is the only place these rules are written: `SQLITE_PATH` refused when unset, blank, relative, or with a missing or unwritable parent; the CLI refusing a file that does not exist; one InfinityCube process per file and what happens when two meet (fail at once, or wait out the busy timeout, answered `503 persistence-unavailable`, never `409`, with no partial write or stuck lock); and the rollback journal with full synchronous writes.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Why:** A rule that lives only in a README has no owning doc and no named test, against the repository's rule that a requirement names the test that holds it. Found by the README audit (`../audit/duplication.md`). Read the Workflow doc's section on ADRs and the requirements snapshot first: if a rule is a decision no accepted ADR records, it needs an ADR, not only an ST rule.

- [ ] Each SQLite rule above is an ST rule in Storage, naming the test that holds it, or is recorded as unbuilt with no test
- [ ] Any rule that is a new decision has an ADR, and Storage's marker is updated in the same change
- [ ] The README's SQLite section is its commands, one line per rule, the backup tip and a link to the Storage rules that says what they hold
- [ ] The driver-internal detail (the migration error code, the helper that mints temp files) is gone from the README
