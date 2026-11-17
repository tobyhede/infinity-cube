# 05 — WebKit in CI, and the desktop application's minimum systems

**Status:** ready-for-agent

**Blocked by:** 01 (ADR 0157 accepted), 04.

**What to build:** A Playwright WebKit project beside Chromium for `pnpm e2e`, fixes for what fails, and the oldest macOS and WebKitGTK versions that pass, recorded in the Tauri bundle configuration (04) and the UI requirements.

Decide whether the Ladle story suite (`pnpm e2e:ladle`) also runs in WebKit, which ADR 0157 leaves to this ticket, and record the decision and its reason here.

How the minimums are found: Playwright's WebKit is a current build, not a system one, so it shows what fails in WebKit but not which old system still works. For macOS, run the suite in the desktop application on the oldest macOS a CI runner offers and step forward until it passes, checking first that the system's WebKit provides the native `Uint8Array` base64 and hexadecimal codecs (ADR 0071); for WebKitGTK, the same against the WebKitGTK versions of the distributions 23 targets. Record each version tried and its result.

This ticket owns `bundle.macOS.minimumSystemVersion` in `packages/desktop/src-tauri/tauri.conf.json` (unset today); the WebKitGTK minimum goes in the Linux bundle's package dependencies in 23.

- [ ] WebKit project green in CI and required by the gate.
- [ ] Ladle in WebKit decided, and recorded with its reason.
- [ ] `minimumSystemVersion` set in `tauri.conf.json`, and the macOS and WebKitGTK minimums recorded in the UI requirements, each with the versions tried that set it.
