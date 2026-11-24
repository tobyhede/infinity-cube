# 11: Raise the Rust coverage floor

**Status:** ready-for-agent

**Blocked by:** 01, 03, 04, 05, 06, 07, 08, 09, 10.

**What to build:** Once the gaps are closed, the coverage floor in CI is raised to what then holds, so it cannot fall back. Every remaining uncovered function in the SQL repository, start-up and `serve` is either tested or listed with why it is not reachable.

- [ ] The per-crate floors are raised to the measured numbers.
- [ ] Each remaining uncovered behaviour-carrying function in those modules is listed in Comments with its reason.
- [ ] The parity table (every TypeScript repository behaviour against its shared case or Rust test) is regenerated from the ports test and has no unexplained gap.
