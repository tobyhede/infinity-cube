# 09 — A Cargo workspace under crates/ with its own CI job

**Status:** ready-for-agent

**Blocked by:** 01 (ADR 0155 accepted).

**What to build:** `crates/` with a workspace `Cargo.toml`, empty `intake` and `host` library crates, a pinned toolchain (`rust-toolchain.toml`), workspace lints that deny `unwrap_used`, `expect_used` and `panic` in library crates, and a CI job running `cargo fmt --check`, `cargo clippy -D warnings` and `cargo nextest run`, required by the `CI passed` gate.

- [ ] CI job green and named in the gate.
- [ ] `AGENTS.md` package layout and Commands sections name the workspace and its commands.
