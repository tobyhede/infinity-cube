# 21 — Sign and notarize the macOS application

**Status:** needs-triage

**Blocked by:** 06.

**What to build:** The macOS bundle 06 releases, signed with a Developer ID certificate and notarized, so it installs without the Gatekeeper step 06's install notes describe. The certificate and notarization credentials held as CI secrets; the release job signs, notarizes and staples before publishing. ADR 0155 makes this a release blocker before a public launch. Signing the Windows bundle is 22's.

- [ ] A tagged build installs on a clean macOS with no Gatekeeper warning, and updates to the next tag.
- [ ] 06's install notes lose the one-time Gatekeeper step.
