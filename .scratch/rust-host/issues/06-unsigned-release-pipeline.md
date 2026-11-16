# 06 — An unsigned macOS release with auto-update

**Status:** ready-for-agent

**Blocked by:** 04, 05.

**What to build:** CI that builds a macOS Apple Silicon bundle on a tag (Windows and Linux follow as their own tickets once it works), publishes them to GitHub Releases with the Tauri updater's static JSON, and signs updates with Tauri updater keys held as a CI secret. Install notes explain the one-time Gatekeeper step. Code signing and notarization are a separate ticket that blocks a public launch.

- [ ] A tagged build installs on macOS and updates to the next tag.
