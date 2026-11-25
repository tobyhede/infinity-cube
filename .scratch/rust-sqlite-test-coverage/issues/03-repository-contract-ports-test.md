# 03 — A ports test for the repository contract

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** A unit test, shaped as `test/unit/http-conformance-rust-ports.test.ts` is, that reads the cases of the TypeScript repository contract (`test/support/repository-contract.ts`) and fails for any case with no Rust test carrying its `// Case:` line in the Rust SQLite repository's test files, unless the test exempts it with its reason. TypeScript's contract is not changed.

- [ ] Case names come from each `it` call's first argument: the leading `${name} ` (the harness's store name) is dropped and any other substitution is written `*`, which gives 73 names. Three of them are written once and run for two values each (the loops at lines 530, 889 and 2444 today, 76 runs in all); the ports test lists each such name's values, and one Rust test per value carries `// Case: <name> (<value>)`.
- [ ] The test fails on a case with neither a port nor an exemption, on an exemption or port naming no case, and on a case both ported and exempt, as the HTTP ports test's `exemptAndPorted` does.
- [ ] "writes a moved Resource through the ownership check, which refuses it before its Space releases it" is exempt, naming the spec's decision on change order.
- [ ] "names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower" is **ported**, not exempt: the Rust port asserts the fast-path half as the case does, and asserts Rust's `load_space` answers broken stored state, with a comment naming ST-7 (02) for why Rust's answer is not TypeScript's narrower one.
- [ ] Until 04, 05, 06 and 12 land, every other case unported today is listed as a pending exemption naming the ticket that ports it, so the test is green from its first commit and each port deletes a line. Every pending case names exactly one of those tickets: commits and lifecycle doors to 04, broken state and classification to 05, assets to 06, stored content and Export to 12.
