# 05 — Port the broken-state and classification cases to Rust

**Status:** ready-for-agent

**Blocked by:** 02, 03.

**What to build:** A Rust port of each contract case about broken stored state and store failures that 03 lists for this ticket, a Rust test for each broken stored state and each classification, naming its glossary term (02), and the tests for the behaviours the spec calls already right.

- [ ] Each broken-state case 03 lists for this ticket has a port with its `// Case:` line, and its pending exemption is deleted. Replacing an Aggregate over broken stored state (`replace_aggregate` must not decode the rows it replaces), initializing over a document that is not JSON, and a fast-path commit over a broken Space are among them.
- [ ] One Rust test on SQLite for each broken stored state, each answering broken stored state (ST-7): a Meta id that is not a UUID, a Meta id naming no Space, a non-canonical exported revision, `load_space` on a row whose document fails intake, a stored document that is not JSON, and one holding a lone UTF-16 surrogate.
- [ ] One Rust test per classification, asserting the repository's answer and the HTTP status: busy and an operation after `close()` are **unavailable** (503), as is a file that does not exist; a constraint violation and code 14 for a directory are **unclassified failures** (500, 01); a missing table (01), a BLOB document (01) and each broken state are **invariant failures** (500). `SQLITE_LOCKED` is unavailable, and an extended result code (e.g. `SQLITE_BUSY_SNAPSHOT`, `SQLITE_CANTOPEN_ISDIR`) is classified by its primary code. Together these fail if `classify` answers unavailable for every error, or for `SQLITE_ERROR`, drops `SQLITE_LOCKED`, or stops masking extended codes.
- [ ] Text that is not well-formed Unicode is refused where it enters: the HTTP decode's 400 is already held on SQLite by the wire case "answers 400 invalid-request for a lone surrogate escape, as for malformed JSON", and Import's `invalid-json` by the corpus case `invalid-json-lone-surrogate`; this item is checking both still run, not new tests.
- [ ] The `list_spaces` tests for each broken document shape are 01's; this ticket adds their `// Case:` lines where they port a case.
- [ ] Each case of `test/integration/sqlite-space-repository.test.ts` outside the contract has a Rust port or a written exemption (03): overlapping reads, two repositories on one handle, a Meta identity that moves, an outage during a conflict reload, a named failure not re-wrapped, and start-up through contention.
