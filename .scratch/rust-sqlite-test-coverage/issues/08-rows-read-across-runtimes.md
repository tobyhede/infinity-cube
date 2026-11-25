# 08 — Rows read across runtimes, in both directions

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** Repository checks that a SQLite file written by either runtime reads correctly in the other. The review showed both directions work today, by hand. In the repository, Rust reads a checked-in dump of TypeScript-written rows (`crates/host/tests/fixtures/typescript-sqlite-rows.sql`, written by `scripts/sqlite-rows-fixture.ts`) and nothing checks it is current; TypeScript reads Rust rows only in the CI restart proof, after one edit to a Space TypeScript seeded. The TypeScript test this adds reads Rust's output and changes no TypeScript behaviour; changing `scripts/sqlite-rows-fixture.ts` to commit the content below is a tooling change the spec allows.

- [ ] A check regenerates the TypeScript-written dump by its own script, normalises timestamps, compares it with the checked-in copy, and fails CI naming the command that regenerates it.
- [ ] A Rust test runs a script on a migrated file (initialize from Default Content, store an asset, create and link a Space, delete a Space, edit a Resource) and writes the rows to a checked-in dump, with the same currency check.
- [ ] A test in `pnpm test:integration:sqlite` loads that Rust-written dump into a migrated file and compares `loadAggregate`, `listSpaces` and `loadAsset` with the same script run on the TypeScript memory store.
- [ ] Both dumps cover a Resource of a kind no plugin lists, an Ur and a Mermaid Resource, and an Edge with no Title drawn. The shared fixture has none of these, so the script commits them itself rather than changing the fixture.
