# 02 — One command builds a preview build, locally and in CI

Status: resolved

**What to build:** One entry point that builds the downloadable `infinity-cube` preview build (ADR 0166) from a clean checkout, which each build job of `.github/workflows/release.yml` also runs, so the archive a person builds on their own machine is made the same way as the one a release attaches.

**Why:** Before this, building the CLI preview build by hand meant knowing to run the browser build, then a release `cargo build` with `INFINITY_CUBE_BUILT_APPLICATION` and `INFINITY_CUBE_COMMIT` set, then packing an archive with a rewritten README. The release workflow did those steps inline, so the local build and CI's could drift, and nothing showed a person how to make the build the workflow makes.

**Acceptance:**

- [x] `pnpm release:build` (`release/build.sh`) installs the JavaScript dependencies, builds the browser application, builds the release binary embedding it for the target `release/install.sh` installs on this machine (or `--target`), runs it once (`--version`, `init`, `check`), and packs `target/preview-build/infinity-cube-<version>-<target>.tar.gz` with `SHA256SUMS` (or `--out`).
- [x] Each build job of `release.yml` builds, smoke-tests and packs through the script and no longer repeats its steps.
- [x] The archive it packs installs with `release/install.sh` through `INFINITY_CUBE_DOWNLOAD_URL=file://…`, which each build job checks.
- [x] `README.md` and `AGENTS.md` name the command.

**Not in scope:** the desktop application, which preview-build ticket 01 and rust-host ticket 06 cover.
