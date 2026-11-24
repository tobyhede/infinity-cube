# 01: Measure Rust coverage in CI

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** CI's `rust` job reports line and region coverage per module of the Rust host and the CLI, and fails if coverage falls below a floor. The floor is pinned at what holds today, per crate, the same way the TypeScript thresholds are pinned at what already holds. This gives a measured baseline before any gap is closed, and shows which host and CLI modules no test reaches.

- [ ] The `rust` job runs the host and CLI tests under a coverage tool (for example `cargo llvm-cov` with nextest) and publishes a per-module summary in the job log.
- [ ] Each crate has a floor pinned at the measured number, and CI fails below it. There is no global threshold.
- [ ] The baseline numbers and every uncovered function that carries behaviour in the SQL repository, start-up and `serve` are recorded in this ticket's Comments, to guide 02–10.
- [ ] The build-tooling doc and AGENTS.md's Commands section describe the new step.
