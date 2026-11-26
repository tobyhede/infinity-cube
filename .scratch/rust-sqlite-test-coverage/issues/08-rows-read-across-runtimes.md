# 08 — Rows read across runtimes, in both directions

**Status:** resolved

**Blocked by:** None (01 and `rust-host/issues/15` are resolved).

**What to build:** Repository checks that a SQLite file written by either runtime reads correctly in the other. The review showed both directions work today, by hand. In the repository, Rust reads a checked-in dump of TypeScript-written rows (`crates/host/tests/fixtures/typescript-sqlite-rows.sql`, written by `scripts/sqlite-rows-fixture.ts`) and nothing checks it is current; TypeScript reads Rust rows only in the CI restart proof, after one edit to a Space TypeScript seeded. The TypeScript test this adds reads Rust's output and changes no TypeScript behaviour; changing `scripts/sqlite-rows-fixture.ts` to commit the content below is a tooling change the spec allows.

- [x] A check regenerates the TypeScript-written dump by its own script, normalises timestamps, compares it with the checked-in copy, and fails CI naming the command that regenerates it.
- [x] A Rust test runs a script on a migrated file (initialize from Default Content, store an asset, create a Space and a Space Resource referencing it, delete a Space, edit a Resource) and writes the rows to a checked-in dump, with the same currency check.
- [x] A test in `pnpm test:integration:sqlite` loads that Rust-written dump into a migrated file and compares `loadAggregate`, `listSpaces` and `loadAsset` with the same script run on the TypeScript memory store.
- [x] Both dumps cover a Resource of a kind no plugin lists, an Ur and a Mermaid Resource, and an Edge with no Title drawn. The shared fixture has none of these, so the script commits them itself rather than changing the fixture.

## Comments

### Resolved (2026-11-26)

- `conformance/sqlite-rows/script.json` is the one script both runtimes run: Default Content under fixed ids, four assets (Markdown, Mermaid, SVG, and a media type no plugin reads), then commits adding an Ur, a Mermaid, an Image, a Reference and a `vnd.example.chart` Resource, Map content and a size, an Edge with no Title and one with a hidden Title, a created Space linked by a Space Resource, a Space created and then deleted with its link, and Edits in two Spaces. Snapshots and commits are in the wire's shape, decoded by each runtime's commit decoder; each asset names its hash, which each runner checks.
- `scripts/sqlite-rows-fixture.ts` now runs the script on a freshly migrated file through the TypeScript SQL repository (`test/support/sqlite-rows.ts`) instead of importing the fixture by hand, and writes every timestamp as one fixed value. `test/integration/sqlite-rows-across-runtimes.test.ts`, in `pnpm test:integration:sqlite`, regenerates it, fails naming `pnpm exec tsx scripts/sqlite-rows-fixture.ts` when the checked-in copy differs, and replays `rust-sqlite-rows.sql` into a migrated file, comparing `loadAggregate`, `listSpaces` and `loadAsset` with the script run on `MemorySpaceRepository`.
- `crates/host/tests/sqlite_rows.rs` runs the script on the Rust SQLite repository, holds `fixtures/rust-sqlite-rows.sql` to its rows (failing naming `INFINITY_CUBE_WRITE_ROWS=1 cargo nextest run -p host --test sqlite_rows`), and replays the TypeScript rows against the script run on the Rust memory store; `given_rows_the_typescript_host_wrote` moved here from `sqlite.rs`, and no longer depends on the tracked fixture.
- The two dumps are identical below their headers today: both runtimes write the same rows byte for byte. Nothing requires that, so no test holds it.
- Mutants killed: an edited title in either checked-in dump fails that runtime's currency check and the other runtime's replay.
