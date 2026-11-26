# 01: Record the Rust toolchain rule as an ADR

**What to build:** A proposed ADR that says which Rust release the repository pins: the latest stable release when the pin is set or bumped, named exactly in the toolchain file, with the workspace `rust-version` naming the same `major.minor`. The pin may lag current stable by one minor release before the weekly check fails. The version an agent or person happens to have installed is never a reason to choose one. The maintainer accepts or rejects it.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A proposed ADR states the rule, why, and what it rejects.
- [x] It edits no requirements document.
