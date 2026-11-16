# 13 — Swap the sidecar for the Rust host

**Status:** ready-for-agent

**Blocked by:** 04, 12.

**What to build:** The shell from 04 composes the Rust `host` in its own process instead of starting the Node sidecar: one run per window, served through a custom URI scheme (no port, so no Host check or launch secret), the same Content Security Policy, and Export awaited before a window or the application closes. The sidecar, its single-file build and its port are removed. Only once the HTTP conformance suite (08) is green against the Rust host (12). Test on a temp copy of `packages/app/fixture`.

- [ ] Closing a window after an edit leaves the directory with the edit.
- [ ] Opening a talk and closing without an edit leaves the directory unchanged (ST-65).
- [ ] A 10 MiB asset upload works through the custom scheme.
