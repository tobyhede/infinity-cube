# 25 — Review follow-up for the Rust host

**Status:** resolved

**Blocked by:** 11, 12, 13.

**What to build:** The review of 10–13 left findings the maintainer scoped into one follow-up. Each is a small change of its own, test-first where it changes behaviour or adds a guard, and no answer on the wire or in the corpus changes.

- [x] H8: a commit's refusals are grouped by folding over the refusals intake hands in, not by running `load_space` again over every candidate. Intake's Space-stage refusals name each refused Space by its position among the snapshots given (`Refusals::space_stage`).
- [x] H9: each intake plugin module declares its content's keys in its schema's order (`ContentKey`, `intake::plugin_content_keys`); the host's Export reads them through intake, and its own table of them is gone.
- [x] H7: a commit copies only what it writes. `load_aggregate` and `load_space` take borrowed snapshots, and a Write carries only the Spaces it creates or updates and the ids it deletes. Read from the code, for a commit that lands over N stored Spaces changing k: 3N deep copies of a stored snapshot before, k after; the memory store's `load_aggregate` 2N to N, its initialize and replace N to 0. Intake's own per-Space normalisation is unchanged.
- [x] S6: `RunEvent::WriteFailed` borrows the error, so the writer reports it and keeps it, with no unreachable arm.
- [x] The run builder's quiet period, which no method set and nothing in the workspace read but the writer, is gone; the writer waits `RUN_QUIET_PERIOD`.
- [x] `conformance/` is one of the vocabulary scan's authored trees; the one binding it found is renamed.
- [x] `conformance/intake/directory/accepted-resource-file-examples` carries each Resource file `docs/schema/resource/examples` publishes, byte for byte, with its `export/` recorded from the TypeScript Export. Both runtimes accept it and the Rust Export writes those bytes; `test/unit/aggregate-json-schema.test.ts` holds the copies to the examples.
- [x] `test/unit/http-conformance-rust-ports.test.ts` fails when a case of `conformance/http/` has no Rust port, unless it exempts the case for that port with why. Each porting Rust test carries `// Case: <name>`. It found the gaps an audit named, now closed: the three ST-65 process cases in `crates/host/tests/run.rs`, and 30 wire cases through the desktop scheme handler.
- [x] `decide_commit` is tested for a created Space whose id sorts before every stored one (ADR 0159).

## Comments

The ST-65 Rust tests compare the directory with itself before the run, and, for the write the next Edit makes, the Meta Space's file with the Map its opening initialized; they do not compare bytes with the TypeScript Export, which only the process suite (run against the Rust CLI in CI) does.
