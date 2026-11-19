# 06 — An unsigned macOS release with auto-update

**Status:** ready-for-agent

**Blocked by:** 04, 05.

**What to build:** CI that builds a macOS Apple Silicon bundle on a tag (Windows, 22, and Linux, 23, follow once it works), publishes it to GitHub Releases with the Tauri updater's static JSON, and signs updates with Tauri updater keys held as a CI secret. Install notes explain the one-time Gatekeeper step. The build runs `pnpm --filter @project/desktop build` (the browser build, then `tauri build`); since 13 the shell serves the Rust host in its own process, so no Node single executable is built. Code signing and notarization are 21, which blocks a public launch.

- [ ] A tagged build installs on macOS and updates to the next tag.
