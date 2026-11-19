# 03: Cut Architecture and Tests down to a link to AGENTS.md

**What to build:** A contributor reading the README's developer section is sent to AGENTS.md's package layout for the architecture and to each requirement's named tests for coverage, instead of reading a second, already-drifted copy. The README keeps at most a few sentences: that the repository is a pnpm workspace plus a Cargo workspace with enforced boundaries, and the three design rules.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Why:** The Architecture section (~600 words) and the Tests list restate AGENTS.md and have drifted: the package table misses the Mermaid plugin, the desktop package and the Rust crates; it places Graph navigation in `graph`, where Navigation is `app`'s; it claims clamping and monotonicity property tests that do not exist; it calls `ui` framework-agnostic; and it says only four `cube` verbs touch a directory. Found by the README audit (`../audit/staleness.md` and `../audit/duplication.md`).

- [ ] The package table, the function names, the `LayoutStrategy` signature and the Tests list are gone from the README
- [ ] What remains links to AGENTS.md's package layout with wording that says what it holds and when to read it
- [ ] No claim left in the section contradicts AGENTS.md
