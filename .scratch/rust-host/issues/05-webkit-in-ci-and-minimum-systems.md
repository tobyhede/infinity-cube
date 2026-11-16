# 05 — WebKit in CI, and the desktop application's minimum systems

**Status:** ready-for-agent

**Blocked by:** 01 (ADR 0157 accepted), 04.

**What to build:** A Playwright WebKit project beside Chromium for `pnpm e2e`, fixes for what fails, and the oldest macOS and WebKitGTK versions that pass, recorded in the Tauri bundle configuration (04) and the UI requirements.

- [ ] WebKit project green in CI and required by the gate.
- [ ] Minimum versions recorded with the evidence that set them.
