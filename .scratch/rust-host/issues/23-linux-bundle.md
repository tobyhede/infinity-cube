# 23 — A Linux bundle, with its WebKitGTK minimum

**Status:** needs-triage

**Blocked by:** 05, 06.

**What to build:** The release pipeline (06) also builds and publishes Linux packages (which formats, recorded here, for the distributions 05 chose) with the Tauri updater's static JSON. Each package declares the minimum WebKitGTK version 05 found (ADR 0157) as a package dependency, so it refuses to install on an older system. While the Node sidecar ships (until 13), the Linux build carries its own Node single executable.

- [ ] A tagged build installs on each targeted distribution, opens a talk, writes an edit on close and updates to the next tag.
- [ ] The WebKitGTK minimum declared in every package, and refusing an older one checked.
