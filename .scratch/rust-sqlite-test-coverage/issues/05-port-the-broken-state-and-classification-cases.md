# 05 — Port the broken-state and classification cases to Rust

**Status:** resolved

**Blocked by:** 02, 03.

**What to build:** A Rust port of each contract case about broken stored state and store failures that 03 lists for this ticket, a Rust test for each broken stored state and each classification, naming its glossary term (02), and the tests for the behaviours the spec calls already right.

- [x] Each broken-state case 03 lists for this ticket has a port with its `// Case:` line, and its pending exemption is deleted. Replacing an Aggregate over broken stored state (`replace_aggregate` must not decode the rows it replaces), initializing over a document that is not JSON, and a fast-path commit over a broken Space are among them.
- [x] One Rust test on SQLite for each broken stored state, each answering broken stored state (ST-7): a Meta id that is not a UUID, a Meta id naming no Space, a non-canonical exported revision, `load_space` on a row whose document fails intake, a stored document that is not JSON, and one holding a lone UTF-16 surrogate.
- [x] One Rust test per classification, asserting the repository's answer and the HTTP status: busy and an operation after `close()` are **unavailable** (503), as is a file that does not exist; a constraint violation and code 14 for a directory are **unclassified failures** (500, 01); a missing table (01), a BLOB document (01) and each broken state are **invariant failures** (500). `SQLITE_LOCKED` is unavailable, and an extended result code (e.g. `SQLITE_BUSY_SNAPSHOT`, `SQLITE_CANTOPEN_ISDIR`) is classified by its primary code. Together these fail if `classify` answers unavailable for every error, or for `SQLITE_ERROR`, drops `SQLITE_LOCKED`, or stops masking extended codes.
- [x] Text that is not well-formed Unicode is refused where it enters: the HTTP decode's 400 is already held on SQLite by the wire case "answers 400 invalid-request for a lone surrogate escape, as for malformed JSON", and Import's `invalid-json` by the corpus case `invalid-json-lone-surrogate`; this item is checking both still run, not new tests.
- [x] The `list_spaces` tests for each broken document shape are 01's; this ticket adds their `// Case:` lines where they port a case.
- [x] Each case of `test/integration/sqlite-space-repository.test.ts` outside the contract has a Rust port or a written exemption (03): overlapping reads, two repositories on one handle, a Meta identity that moves, an outage during a conflict reload, a named failure not re-wrapped, and start-up through contention.

## Comments

### Resolved (2026-11-26)

The contract's broken-state cases are the shared table's `broken` group (`crates/host/tests/repository_contract/broken.rs`), run on SQLite and skipped on the memory store, which has no stored form to break. `load_space` over a document failing intake asserts the invariant failure (ADR 0176). A non-canonical exported revision is a non-port case there too.

`crates/host/tests/sqlite_classification.rs` names each state and failure by the glossary's term and reads the HTTP status `GET /api/spaces/<id>` answers over the same store: a Meta id that is not a UUID, one naming no Space, a non-canonical exported revision, a document failing intake (on `load_space`), one that is not JSON, one escaping a lone surrogate (a Space's and a Resource's), a missing table and a BLOB document are invariant failures (500); a lock held past the busy timeout, every operation after `close()` and a file that does not exist are unreachable (503); a constraint a write breaks (a trigger standing in) and a directory at the path are unclassified failures (500). It also holds the outside-contract cases: overlapping reads and initializations on one store, two repositories over one file, the two documents that are not JSON truncated by replacement, the foreign keys refusing a Meta id naming no Space, and start-up through a lock (a clock whose first wait lets the lock go).

The primary-code reading moved into `unavailable_code` (`crates/host/src/sql/sqlite.rs`), whose unit tests read `SQLITE_BUSY_SNAPSHOT`, `SQLITE_BUSY_RECOVERY` and `SQLITE_LOCKED_SHAREDCACHE` as unavailable, `SQLITE_CANTOPEN_ISDIR` by whether the file exists, and `SQLITE_ERROR` and constraint codes as no outage. Mutants: answering unavailable for `SQLITE_ERROR` fails `reads_every_other_code_as_no_outage`; dropping `SQLITE_LOCKED` fails `reads_busy_and_locked_as_unavailable_by_their_primary_code`; not masking fails it and the `SQLITE_CANTOPEN` test; answering unavailable for every error fails the constraint and directory tests here and three in `sqlite.rs`. No extended code reaches the store from a real file in these tests, which is why the masking is held by the unit tests.

Four outside cases do not apply to the Rust repository, with reasons in the ports test: the Meta identity moving under a relock, a named failure re-wrapped, and outages on the two reads the TypeScript repository makes after a rollback. The lone-surrogate wire case runs on SQLite (`sqlite_wire.rs`) and the corpus case through Import (`corpus.rs`), unchanged.
