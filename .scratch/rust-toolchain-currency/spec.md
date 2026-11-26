# Keep the Rust toolchain on current stable

Status: ready-for-agent

## Problem Statement

The Rust toolchain was pinned at 1.97.0 for its first week on `main` and nobody chose that version. The session that set up the Cargo workspace pinned whatever its build environment had installed, and the pin went unnoticed until it was three stable releases behind (1.100.0 was current). The maintainer only found out by running into it.

Three things let that happen:

- **Nothing says what the pin should be.** The ticket that asked for a pinned toolchain named no version and no rule, so an agent filled the gap from its own environment.
- **Nothing notices when the pin falls behind.** Rust ships a stable release every six weeks. No check, schedule or person watches for one.
- **The version is written twice and nothing keeps the two in step.** The channel in the toolchain file and the workspace `rust-version` both carry it. One review note in the pull request is the only thing that says a bump changes both.

## Solution

The Rust toolchain pin follows current stable, and the repository enforces that:

- **A recorded decision.** An ADR says the pin is the latest stable release when it is set or bumped, that the workspace `rust-version` names the same release, and that the version an agent or person happens to have installed is never a reason to choose one.
- **A test that keeps the two in step.** A unit test fails when the toolchain channel and the workspace `rust-version` name different releases, so a half-done bump fails `verify`.
- **A weekly staleness check outside the merge gate.** A scheduled CI workflow compares the pin with the current stable release Rust publishes. It fails, naming both versions and the bump steps, when the pin is two or more releases behind. A Rust release never turns a pull request red.
- **One bump procedure, written down.** The build-tooling doc and `AGENTS.md` describe a bump: both pins in one change, new lints fixed rather than allowed, and CI's cold cache expected on the first run.

## User Stories

1. As the maintainer, I want the Rust pin to be current stable, so that I'm not surprised by an old compiler in my own repository.
2. As the maintainer, I want a written rule for which Rust version is pinned, so that no agent has to guess.
3. As the maintainer, I want the rule to forbid choosing a version because it's installed locally, so that a build environment's age never leaks into the repository.
4. As the maintainer, I want to hear when the pin falls behind, so that I don't find out by accident.
5. As the maintainer, I want that signal to tolerate one release of lag, so that I'm not nagged in the days after every release.
6. As the maintainer, I want the signal to name the pinned version, the current stable version and how far apart they are, so that I can tell at a glance how urgent it is.
7. As the maintainer, I want the signal to say how to bump, so that I can hand it straight to an agent.
8. As the maintainer, I want a new Rust release never to fail a pull request, so that work in flight isn't blocked by something outside the repository.
9. As the maintainer, I want to be able to run the staleness check by hand, so that I can confirm a bump without waiting a week.
10. As a contributor, I want a test that fails when the toolchain channel and `rust-version` disagree, so that I can't land half a bump.
11. As a contributor, I want that test's failure to name both values and where each lives, so that the fix is obvious.
12. As a contributor, I want `rust-version` to follow the same release as the channel, so that I have one number to think about.
13. As a contributor, I want the bump steps written in the build-tooling doc, so that I don't have to rediscover them from an old pull request.
14. As a contributor, I want the bump steps to say how to handle new lints, so that I fix deprecations rather than allow them.
15. As a contributor, I want to know a bump starts CI with a cold Cargo cache, so that a slow first run doesn't look like a regression.
16. As an agent, I want `AGENTS.md` to state the rule in one line under the commands that name the toolchain, so that I see it before I touch the pin.
17. As an agent, I want the source of "current stable" named exactly (Rust's published stable channel manifest), so that I don't read it from my own `rustc`.
18. As an agent bumping the toolchain, I want the agreement test and the staleness check to pass locally, so that I can show the bump is complete before CI runs.
19. As an agent setting up a new Rust crate, I want the workspace to supply `rust-version`, so that I don't add a second, divergent one.
20. As a reviewer, I want a bump to arrive as one small pull request, so that I can review the compiler change on its own.
21. As a reviewer, I want the staleness check's logic to be a pure function with tests, so that I can trust how it compares versions without reading CI logs.
22. As the maintainer, I want the staleness check to fail clearly when it can't reach or parse Rust's manifest, so that a network problem never passes as "up to date".
23. As the maintainer, I want the check to read the pin from the toolchain file, the same file rustup and CI read, so that it checks what actually runs.
24. As a future maintainer of mise adoption, I want this work to leave Rust pinned by the toolchain file alone, so that it fits the accepted mise brief, which keeps Rust out of `mise.toml`.

## Implementation Decisions

- **Decision record.** Write a new ADR, in proposed status for the maintainer to accept. It decides: the pin is the latest stable release (an exact `major.minor.patch`) at the time it is set or bumped; the workspace `rust-version` is that release's `major.minor`; the pin may lag current stable by at most one minor release before the staleness check fails; and the installed version is never evidence. It refines the decision behind the Cargo workspace (ADR 0155's host) and edits no requirements doc; the next snapshot refresh folds it in.
- **Toolchain check module.** A new TypeScript script beside the existing toolchain check for TypeScript, shaped like it: pure functions and an imperative shell.
  - Pure core: read the channel from the toolchain file's text; read `rust-version` from the workspace manifest's text; read the stable version from Rust's channel manifest text; judge agreement (channel's `major.minor` equals `rust-version`); judge staleness (how many minor releases the pin is behind stable, with a failure at two or more); and format a verdict that names both versions, the gap and the bump steps.
  - Shell: read the two files and, for the staleness check, fetch the stable channel manifest from Rust's static distribution site. Exit non-zero on a failing verdict, and on a fetch or parse failure, with a message saying which.
  - Two entry points as pnpm scripts: one for agreement (offline) and one for staleness (online).
- **Parsing.** No TOML parser is added as a dependency. The two repository files and the manifest's stable version line are matched by fixed patterns, as the CI container pin test does for the workflow file. A pattern that matches nothing is a failure, never a pass.
- **Agreement in the merge gate.** A unit test runs the agreement judgment over the repository's real files, so `verify` (and CI's `coverage` job) fails on a mismatch. No new CI job.
- **Staleness outside the merge gate.** A new workflow runs weekly and on manual dispatch. It installs Node and pnpm as the other jobs do, runs the staleness script, and is not a dependency of `CI passed`. A failing scheduled run is the signal. Its actions are pinned by commit, as every other action is.
- **Docs.** The build-tooling doc gains a short section naming where Rust is pinned, the rule, and the bump procedure. `AGENTS.md`'s Rust command entry gets one sentence pointing at it. Neither restates the ADR's reasoning.
- **No Rust code changes.** The Cargo workspace, its lints and the CI jobs that install the toolchain stay as they are.

## Testing Decisions

- **What a good test is here.** Each test feeds text in and checks the verdict out. None reaches the network, spawns rustup or reads anything but the files it names. A test of the shell checks its exit status and message, not its internals.
- **The one seam.** The toolchain check module's pure functions. Agreement, staleness, parsing and verdict wording are all tested there.
  - Agreement: equal versions pass; a channel ahead of or behind `rust-version` fails; a patch-level difference in the channel alone passes; a missing or malformed value in either file fails with the file named.
  - Staleness: pin equal to stable passes; one minor behind passes; two or more behind fails and the verdict names the gap; a pin ahead of stable (a manifest read during a release) passes; an unparseable manifest fails.
  - Property tests with fast-check over generated version pairs hold the gap arithmetic: it is symmetric in sign, zero only for equal `major.minor`, and the pass/fail boundary sits at exactly two.
- **The repository's own files.** One test runs agreement over the real toolchain file and workspace manifest, so the check holds the actual tree.
- **Prior art.** The TypeScript toolchain check's tests (pure `judge*` functions and `formatVerdict`, plus one run against the repository) and the CI container pin test (fixed-pattern reading of a file with no parser added).
- **Not tested.** The scheduled workflow's trigger, and the live Rust manifest. A manual dispatch after merge shows the workflow runs, and the pull request reports that run.

## Out of Scope

- Bumping the toolchain automatically, or opening bump pull requests from CI.
- Adopting Renovate, Dependabot or another dependency bot.
- Moving the Rust pin into `mise.toml`, or any other part of the mise adoption ticket.
- Pinning or checking any toolchain other than Rust: Node, pnpm and the Playwright image already have their own pins and checks.
- A minimum supported Rust version below the pin, for consumers outside the repository. Nothing is published, so `rust-version` just follows the pin.
- Bumping Cargo dependencies or the Rust edition.
- The bump to 1.100.0 itself, which pull request #550 does.

## Further Notes

- The trigger for this spec is pull request #482, which pinned 1.97.0 from its build environment, and #550, which moves the pin to 1.100.0. The bump surfaced one new lint (`AtomicUsize::fetch_update` deprecated in favour of `try_update`), which is the kind of change the bump procedure should expect.
- The one-release grace means the longest the pin can sit behind before the check fails is about twelve weeks, and the check runs weekly, so the maintainer hears within a week of crossing it.
- The Claude Code cloud environment's stable Rust was 1.97.0 when this was written, which is how the original pin was chosen. This spec deliberately doesn't depend on that environment being kept current.
