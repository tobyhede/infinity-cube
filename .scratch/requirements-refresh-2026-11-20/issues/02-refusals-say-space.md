# Everything the CLIs and a mount print says Space

Status: ready-for-agent

**What to build:** reword every line a person reads that says Aggregate so it says Space (or folder), in both runtimes, keeping one wording for the refusal a mount shares with the CLI:

- `describeAggregateReadRefusal` (`packages/aggregate/src/aggregate-refusal.ts`) and the intake lines it prints, shown by `pnpm cube run`, `pnpm cube import`, `pnpm cube check` and a mount.
- The rest of the TypeScript CLI: `src/cli/run.ts` ("Created a new aggregate", "To create an aggregate there"), `src/cli/run-refusal.ts` ("holds no aggregate", "is a valid aggregate."), `src/cli/database-command.ts` ("Imported the aggregate", "already holds this aggregate", "no aggregate to export", "Aggregate validation failed:") and the `cube help` summaries in `src/cli/arguments.ts`.
- The Rust CLI: `crates/cli/src/describe.rs` ("holds no aggregate", "is not an aggregate intake accepts:"), `crates/cli/src/check.rs` ("is a valid aggregate.") and `crates/cli/src/init.rs` ("Created a new aggregate").
- `describeGitHubSourceFailure` (`packages/app/src/mount/github-source.ts`): "so its aggregate cannot be read whole".

`aggregate.json`, a refusal kind such as `aggregate-file-missing`, and `--json` output keys are names, not prose, and stay.

**Why:** ruling UI C5 (20 November 2026): ADR 0164 keeps Aggregate out of what a person reads, the CLI included, and ADR 0130's "same words" stays one wording. UI-111 lists each line and ST-90 points to it; both are bug: code differs until this lands.

**Acceptance criteria:**

- [ ] `app/test/mount.test.tsx`, `test/unit/run-process.test.ts`, `test/unit/infinity-cube-cli.test.ts` and the Rust CLI's `crates/cli/tests/` assert the new words.
- [ ] A search of `src/cli/`, `crates/cli/src/` and the mount for "aggregate" in printed text finds only names (`aggregate.json`, refusal kinds).
- [ ] UI-111's Aggregate clauses and ST-90 move to **built**, citing those tests.
