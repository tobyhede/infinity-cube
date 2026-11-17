# 22 — A Windows bundle

**Status:** needs-triage

**Blocked by:** 06.

**What to build:** The release pipeline (06) also builds and publishes a Windows bundle with the Tauri updater's static JSON. Windows draws in WebView2, which is Chromium, so it needs no minimum beyond WebView2's evergreen runtime (ADR 0157). While the Node sidecar ships (until 13), the Windows build carries its own Node single executable. Signing it with a valid certificate (an OV or EV certificate, or Azure Artifact Signing; spec, open questions) reduces SmartScreen prompts but does not remove them: no certificate type bypasses SmartScreen any longer, and a newly signed file still builds reputation over time ([SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)). Record which, or ship unsigned with install notes, and say why, with that trade-off.

- [ ] A tagged build installs on Windows, opens a talk, writes an edit on close and updates to the next tag.
- [ ] Signing decided and recorded on this ticket.
