# Rust SQLite test coverage

**Why:** Rust-host ticket 15 requires the Rust SQL repository to answer every `SpaceRepository` method as the memory store does. Its acceptance criteria named only the shared HTTP wire and store-condition cases and four rules (ST-10, ST-126, ST-127, ST-128), so the work shipped with far less repository coverage than the TypeScript side has. The TypeScript repository contract (about 80 behaviours, run on memory, SQLite and PostgreSQL) and its fast-check properties have no Rust counterpart. Rust has five fixed differential scripts and about 20 examples. Rows cross runtimes in one direction only.

**Goal:** parity that CI enforces, not parity by review. Every repository behaviour the TypeScript side tests is either run by both runtimes from one shared set of cases, or listed as Rust-only or TypeScript-only with the reason. Coverage of the Rust host and CLI is measured in CI and can only go up.

**Source:** the parity review of 2026-11-24, read at `claude/project-thread-pzxhvd-serve` d5b42c96 (PRs #519, #520, #521). That review ran no tests. Every gap below must be confirmed by a failing or missing test before it is closed, not taken on trust.

**Not in scope:** any change to the HTTP contract, the browser application, or the TypeScript SQL repository's behaviour. Where a shared case shows the two runtimes disagree, the disagreement is a finding: record it in the ticket and fix the Rust side, or record why the difference is by design (as ST-126's missing-file rule is).
