# 01 — Publish the desktop app as a preview build

Status: needs-triage
Blocked by: testers' feedback on the CLI preview build

**What to build:** Add the desktop application (`packages/desktop`, ADR 0155) to the preview builds the release workflow (`.github/workflows/release.yml`) attaches to a draft release, beside the `infinity-cube` CLI archives, under ADR 0166's rules.

**Why:** The CLI preview build asks a tester for a terminal. The desktop application opens a folder from a window, which is what a person who is not a developer expects, but it needs more per-platform work than the CLI before it is pleasant to download.

**Decided when the CLI preview build was planned (2026-11-20), and left for this ticket:**

- The CLI ships first, for Linux x64 (musl) and macOS arm64, unsigned, to a small audience who can read a README.
- This ticket is not started until those testers have tried the CLI.

**Open questions for triage:**

- Which bundles: `.deb` and/or AppImage on Linux, `.dmg` on macOS, and Windows only once the scheme-per-Aggregate work in `.scratch/rust-host/issues/13-swap-the-sidecar-for-the-rust-host.md` is built.
- Signing and notarisation: an unsigned `.app` is harder to open than an unsigned CLI binary. Whether a preview build waits for an Apple Developer ID, and for Windows, EV or Azure Artifact Signing.
- Whether the Tauri updater (which requires signed update manifests) belongs in a preview build at all, or waits for a release.
- `tauri.conf.json` carries its own `version` (`0.0.0`), which the workflow would have to hold to the Cargo workspace version as it holds the tag.
- The desktop application has been run by hand on Linux only (Storage ST-121, ST-124); macOS has not been run.

## Comments

**2026-11-23, the first preview release is published.** `v0.1.0-preview.1` (tag on `8c80439`) is published with the four CLI archives and the macOS Apple silicon `.dmg`, update bundle, signature and `latest.json` (rust-host issue 06 built the desktop half). `curl -fsSL https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | sh` on Linux x86_64 installed it, `--version` named `0.1.0-preview.1 (8c80439…)`, and `init`, `check` and a `run` that served the Space and wrote on SIGINT all worked. The blocker, testers' feedback on the CLI build, can now be gathered.
