# 03 — A ports test for the repository contract

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** A unit test, shaped as `test/unit/http-conformance-rust-ports.test.ts` is, that reads the cases of the TypeScript repository contract (`test/support/repository-contract.ts`, 76 cases, each named by its `it` call's first argument with a template literal's substitutions written `*`) and fails for any case with no Rust test carrying `// Case: <name>` in the Rust SQLite repository's test files, unless the test exempts it with its reason. TypeScript's contract is not changed.

- [ ] The test lists the contract's cases from the source, as the HTTP ports test does, and fails on a case with neither a port nor an exemption, and on an exemption or port naming no case.
- [ ] "writes a moved Resource through the ownership check, which refuses it before its Space releases it" is exempt, naming the spec's decision on change order.
- [ ] "names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower" is ported for its fast-path half, and its exemption says why Rust's `load_space` answers broken stored state where TypeScript's is narrower (ST-7, 02).
- [ ] Until 04, 05 and 06 land, every other case unported today is listed as a pending exemption naming the ticket that ports it, so the test is green from its first commit and each port deletes a line.
