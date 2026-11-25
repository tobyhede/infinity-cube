# 26 — Import and Export a SQLite file from the Rust CLI

**Status:** needs-triage

**Blocked by:** 15.

**What to build:** `infinity-cube import <dir> --store sqlite [--dangerous-replace]` and `infinity-cube export <dir> --store sqlite`, reaching the migrated file `SQLITE_PATH` names as `pnpm cube import|export --store sqlite` do. Deferred by the user on 2026-11-25 from the Rust SQLite test coverage spec (`.scratch/rust-sqlite-test-coverage/spec.md`, Not in scope), so that until this lands `pnpm cube` stays the only way to fill or Export a SQLite file. The library already has both halves over any `SpaceRepository`: `import_directory` (`crates/host/src/import.rs`) and `export_aggregate` (`crates/host/src/export.rs`); today only `run` and `check` call them, over the memory store. The contract's Import and Export cases are ported through the library by that spec's ticket 12; this issue owns the verbs and their process tests.

- [ ] A process test in `crates/cli/tests/` for each case of `test/integration/sqlite-infinity-cube-cli.test.ts`, each carrying its `// Case:` line: initializing an empty file and answering an identical re-import as unchanged and a different one as refused; replacing only with `--dangerous-replace`; a replacement authorized against a superseded Meta identity answered as a conflict; truncating a file holding broken state with `--dangerous-replace`, and only with it; exporting the canonical directory, recording the projected revisions and surviving a reopen; storing and re-exporting the assets an imported directory carries; refusing a missing or blank `SQLITE_PATH` and a file that does not exist, creating nothing.
- [ ] Each verb refuses a `SQLITE_PATH` as `serve --store sqlite` does (the same path policy and messages), and neither runs while another process holds the file, as the Commands section of `AGENTS.md` already says of the TypeScript verbs.
- [ ] Storage ST-120 and the `AGENTS.md` Commands section name the Rust verbs beside `pnpm cube import|export --store sqlite`.
