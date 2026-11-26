# 03: Warn weekly when the Rust pin falls behind

**What to build:** A scheduled workflow, outside `CI passed`, fails when the pinned Rust release is two or more minor releases behind the current stable release Rust publishes, naming both versions, the gap and the bump steps. It fails, saying so, when it cannot fetch or read Rust's stable channel manifest. It also runs on manual dispatch, and an online pnpm script runs it by hand.

**Blocked by:** 02

**Status:** ready-for-human

- [x] A pure staleness judgment and manifest reader, tested at the same seam as 02, with property tests holding the gap arithmetic and the boundary at two.
- [x] An online pnpm script exits non-zero when stale, and on a fetch or parse failure.
- [x] A weekly and manually dispatched workflow runs it, with actions pinned by commit, and `CI passed` does not depend on it.
- [ ] After merge, the maintainer dispatches the workflow once from the Actions tab and it passes. (The pull request's own run, triggered by its path filter, is the evidence before merge.)
