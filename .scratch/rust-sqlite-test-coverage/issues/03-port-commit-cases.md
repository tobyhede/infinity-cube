# 03: Port commit cases to shared conformance

**Status:** ready-for-agent

**Blocked by:** 02.

**What to build:** Every commit behaviour the TypeScript repository contract tests runs as a shared case on both runtimes. That includes Space create, link and delete written and read back; Resource move and Resource ownership; stale and conflicting revisions; refused deletes; a single edit beside a broken Space writing only the changed rows; and large revisions. Today no Rust test commits a successful Space create or delete, or a Resource move, against SQLite.

- [ ] Every commit case in the TypeScript contract is moved to the shared format and removed from the contract.
- [ ] Each runs on all five stores, and the resulting aggregate is compared after reopening the SQLite file, not only in memory.
- [ ] The corpus commit cases, which run on Rust memory only today, also run over the Rust SQLite repository.
- [ ] Each case was seen to fail on the Rust SQLite repository with the code under test deliberately broken (noted per case group in Comments).
