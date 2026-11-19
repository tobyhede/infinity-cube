# 09 — One Cargo workspace for crates/ and the desktop shell, with its own CI job

**Status:** resolved

**Blocked by:** None (01 accepted ADR 0155).

**What to build:** A workspace `Cargo.toml` at the repository root (the one directory above both) with `crates/intake`, `crates/host` (empty library crates) and `packages/desktop/src-tauri` (04) as members, a pinned toolchain (`rust-toolchain.toml`), workspace lints that deny `unwrap_used`, `expect_used` and `panic` in library crates, and a CI job running `cargo fmt --check`, `cargo clippy -D warnings` and `cargo nextest run`, required by the `CI passed` gate. Bringing in the shell: `packages/desktop/src-tauri/Cargo.lock` is removed in favour of the workspace's one lock file, `src-tauri/target/` gives way to the workspace's target directory, and the relative paths in `tauri.conf.json` (`frontendDist`, `bundle.resources`, `externalBin`) are rechecked against where Tauri resolves them, with `tauri build` run once to prove them. The CI job builds the shell on Linux (its WebKitGTK system packages installed) as well as the crates.

- [x] CI job green and named in the gate, covering the crates and `packages/desktop/src-tauri`.
- [x] One `Cargo.lock` at the workspace root; `tauri build` succeeds with the rechecked paths.
- [x] `AGENTS.md` package layout and Commands sections name the workspace and its commands.

## Answer

The workspace, its lock file, the `rust` CI job and the `CI passed` gate are in place, and CI is green on the draft PR (`CI passed`). ADR 0155 is accepted, so nothing here waits on it.
