# The refusal a mount shares with the CLI says Space

Status: ready-for-agent

**What to build:** reword `describeAggregateReadRefusal` (`packages/aggregate/src/aggregate-refusal.ts`) and the intake lines a person reads so they say Space (or folder), never Aggregate, keeping one wording for `pnpm cube run`, `pnpm cube import`, `pnpm cube check` and a mount. Also reword `describeGitHubSourceFailure`'s "so its aggregate cannot be read whole".

**Why:** ruling UI C5 (20 November 2026): ADR 0164 keeps Aggregate off what a person reads, and ADR 0130's "same words" stays one wording. UI-111 and ST-90 are bug: code differs until this lands. Check whether the Rust CLI's `check` and refusal text say Aggregate too, and keep both runtimes' wording in step.

**Acceptance criteria:**

- [ ] `app/test/mount.test.tsx`, `test/unit/run-process.test.ts` and `test/unit/infinity-cube-cli.test.ts` assert the new words.
- [ ] UI-111's mounted case and ST-90 cite those tests as **built**.
