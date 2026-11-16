# 11 — An unsigned release pipeline with auto-update

**Status:** ready-for-agent

**Blocked by:** 09, 10.

**What to build:** CI that builds macOS, Windows and Linux bundles on a tag, publishes them to GitHub Releases with the Tauri updater's static JSON, and signs updates with Tauri updater keys held as a CI secret. Install notes explain the one-time Gatekeeper and SmartScreen step. Code signing and notarization are a separate ticket that blocks a public launch.

- [ ] A tagged build installs on each platform and updates to the next tag.
