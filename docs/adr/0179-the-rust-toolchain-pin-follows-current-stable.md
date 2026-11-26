# The Rust toolchain pin follows current stable

Status: proposed
Date: 2026-11-26
Refines: 0155
Related: 0156

ADR 0155 brought in a Rust host and ADR 0156 a Rust intake, and the Cargo workspace that holds them pins one toolchain in `rust-toolchain.toml`, which rustup, cargo and every CI job that builds Rust read. The workspace also names a `rust-version` in `Cargo.toml`, which every crate inherits. Neither ADR said which release to pin. The workspace's pull request (482, 19 November 2026) pinned 1.97.0 because that was the version its build environment had installed, and the pin was three stable releases behind (1.100.0) a week later, when the maintainer found it by accident (pull request 550). Nothing said what the pin should be, nothing noticed it falling behind, and nothing held its two copies in step.

## The decision

- **The pin is the latest stable Rust release when it is set or bumped.** `rust-toolchain.toml` names it exactly (`major.minor.patch`). "Latest stable" is what Rust's published stable channel manifest names, not what any machine has installed.
- **The workspace `rust-version` names the same release's `major.minor`.** A bump changes both in one change. A unit test in `verify` fails when they disagree.
- **The pin may lag current stable by one minor release.** A weekly scheduled workflow, outside the `CI passed` gate, fails when the pin is two or more minor releases behind, so a Rust release never blocks a merge, and the maintainer hears within a week once the pin is about two releases old.
- **A bump fixes the lints the new release raises.** It does not allow them, and it does not stay on an older release to avoid them.

## Why

A pinned toolchain makes every build use one compiler, which is the point of pinning, but a pin no one moves ages silently: Rust ships a stable release every six weeks, and new lints, deprecations and library APIs arrive with each. Choosing by what is installed hands the decision to whichever environment last ran, which is how 1.97.0 was chosen. The one-release grace keeps the signal from firing in the days after every release, while still catching a pin that has been forgotten. Keeping the check outside the merge gate means work in flight is never blocked by something that happened outside the repository.

## Rejected

- **Tracking the `stable` channel unpinned.** Two machines on different days would build with different compilers, and a release would change CI's answer with no commit to point at.
- **A minimum supported Rust version below the pin.** Nothing is published to crates.io and the repository builds only with its own pin, so a lower `rust-version` would claim support nothing tests.
- **A dependency bot (Renovate, Dependabot) to bump the pin.** It would add a service and its configuration for one file that changes every six weeks, and a bump still needs a person or an agent to fix the lints it raises.
- **Failing the merge gate when the pin is behind.** A Rust release would fail every open pull request until someone bumped the pin.
- **Moving the pin into `mise.toml`.** The accepted mise brief (toolchain issue 01) keeps Rust in `rust-toolchain.toml`, which rustup and cargo read wherever they run.

## Consequences

`scripts/check-rust-toolchain.ts` holds both checks as pure functions, run by `pnpm toolchain:rust:check` (agreement, offline) and `pnpm toolchain:rust:stale` (staleness, online); `test/unit/check-rust-toolchain.test.ts` tests them and runs agreement over the repository's files. `.github/workflows/rust-toolchain.yml` runs the staleness check weekly and on manual dispatch. `docs/agents/build-tooling.md` records the bump procedure.
