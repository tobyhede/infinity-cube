# 01 — Fix the seven Rust divergences before rust-host 15 merges

**Status:** ready-for-agent

**Blocked by:** None. This lands on the rust-host 15 branches (PR #520 for the repository and start-up, PR #521 for `serve`) before either merges, not on `main`.

**What to build:** The seven behaviours the spec's Decisions and Settled questions name as Rust defects, each fixed with a failing Rust test first, and the owning requirement changed in the same commit.

- [ ] **Revision ceiling.** A commit from a Space stored at revision 2^63−1 is refused as an invariant failure and leaves the stored revision where it was, on the memory store and on SQLite. Today `Revision::next` (`crates/host/src/repository.rs`) holds at the ceiling, so the commit succeeds and a second commit with the same expected revision overwrites the first. The test commits twice with one expected revision and asserts the second is not committed. (ST-6.)
- [ ] **A file SQLite cannot open.** SQLite's code 14 (`SQLITE_CANTOPEN`) is an unclassified failure, not unavailable (`crates/host/src/sql/sqlite.rs`'s classification): HTTP answers 500 and start-up stops after the confirming retry. `serve --store sqlite` refuses a `SQLITE_PATH` naming something other than a regular file (a directory) before it takes a port, as it refuses a missing file; a process test in `crates/cli/tests/serve.rs` holds it. ST-126 gains that clause.
- [ ] **Text that is not well-formed Unicode.** A request body or an Import file holding a lone UTF-16 surrogate (for example a Title `"A\ud800B"`) is refused where it enters, with a named refusal and no 500, so no Rust store ever holds one. A stored document holding one stays broken stored state, as today. The browser side is `title-well-formed/issues/01`.
- [ ] **Broken stored states.** One Rust test on SQLite for each of: a Meta id that is not a UUID, a Meta id naming no Space, a non-canonical exported revision, and `load_space` on a row whose document fails intake. Each answers broken stored state (ST-7). Two of the four are tested in neither runtime today.
- [ ] **A schema missing a table.** A file missing the `resources` table answers broken stored state (500), not `uninitialized`. Today the emptiness check reads only `spaces` (`crates/host/src/sql.rs`).
- [ ] **A document stored as a BLOB.** A `spaces` or `resources` row whose document is a BLOB answers broken stored state (500), as TypeScript answers it. A Rust test on SQLite holds it.
- [ ] **A `SQLITE_PATH` that is not UTF-8.** `serve --store sqlite` refuses it with a message naming `SQLITE_PATH`, before it takes a port, instead of opening a mangled path. A process test in `crates/cli/tests/serve.rs` holds it on Linux. ST-126 gains that clause.
- [ ] The tests above run in CI's `rust` job, and #520 and #521 stay green.
