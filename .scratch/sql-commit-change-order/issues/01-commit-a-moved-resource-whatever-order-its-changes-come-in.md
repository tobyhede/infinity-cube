# 01 — Commit a moved Resource whatever order its changes come in

**Status:** needs-triage

**Blocked by:** None.

**Why it waits:** the SQLite test-coverage effort freezes TypeScript's behaviour (its spec's Decisions, "TypeScript is frozen"). Until that decision is lifted, or the TypeScript server is retired, this stays a recorded divergence, which that effort writes into the Storage requirements.

**What's wrong:** one commit that moves a Resource from Space A to Space B updates both Spaces: A without the Resource, B with it. The finished Aggregate passes intake either way, but the two SQL hosts answer it differently by the order the changes come in.

- The Rust SQL repository (`crates/host/src/sql.rs` › `write_changes`) deletes every Resource row a written Space drops before it writes any, so it commits in either order.
- The TypeScript SQL repository (`src/persistence/sql-space-repository.ts`) writes each Space in change order. Listing B first, it writes B's Resource row while A still owns it, the ownership check refuses it, and the whole commit rolls back as `invalid-commit`. `test/support/repository-contract.ts` › "writes a moved Resource through the ownership check, which refuses it before its Space releases it" holds that behaviour today.

So the same request succeeds on one host and is refused on the other. ST-4 calls a repository that answers differently defective, and ST-18 judges a commit by the Aggregate it leaves, not by the order of its changes.

**What to build:**

- [ ] The TypeScript SQL repository commits a move in either change order, releasing a Resource every written Space drops before any written Space takes one, as the Rust repository does.
- [ ] The contract case above is rewritten to assert that both orders commit and leave the Resource in B, and runs on PostgreSQL and SQLite.
- [ ] A Rust test on SQLite commits the move in both orders (`crates/host/tests/sqlite.rs`), carrying `// Case:` with the contract case's new name.
- [ ] The divergence the Storage requirements record for it is removed in the same change.

Found by CodeRabbit's review of PR #520 (`crates/host/src/sql.rs`, `delete_resources_except`); left out of that PR because the defect is TypeScript's.
