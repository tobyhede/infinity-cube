# 09 — One Cargo workspace for crates/ and the desktop shell, with its own CI job

**Status:** ready-for-agent

**Blocked by:** 01 (ADR 0155 accepted).

**What to build:** A workspace `Cargo.toml` at the repository root (the one directory above both) with `crates/intake`, `crates/host` (empty library crates) and `packages/desktop/src-tauri` (04) as members, a pinned toolchain (`rust-toolchain.toml`), workspace lints that deny `unwrap_used`, `expect_used` and `panic` in library crates, and a CI job running `cargo fmt --check`, `cargo clippy -D warnings` and `cargo nextest run`, required by the `CI passed` gate. Bringing in the shell: `packages/desktop/src-tauri/Cargo.lock` is removed in favour of the workspace's one lock file, `src-tauri/target/` gives way to the workspace's target directory, and the relative paths in `tauri.conf.json` (`frontendDist`, `bundle.resources`, `externalBin`) are rechecked against where Tauri resolves them, with `tauri build` run once to prove them. The CI job builds the shell on Linux (its WebKitGTK system packages installed) as well as the crates.

- [ ] CI job green and named in the gate, covering the crates and `packages/desktop/src-tauri`.
- [ ] One `Cargo.lock` at the workspace root; `tauri build` succeeds with the rechecked paths.
- [ ] `AGENTS.md` package layout and Commands sections name the workspace and its commands.
