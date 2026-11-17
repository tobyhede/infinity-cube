# 13 — Swap the sidecar for the Rust host

**Status:** ready-for-agent

**Blocked by:** 04, 07, 08, 12.

**What to build:** The shell from 04 composes the Rust `host` in its own process instead of starting the Node sidecar: one run per window, served through a custom URI scheme (no port, so no Host check or launch secret), the same Content Security Policy, and Export awaited before a window or the application closes. Only once the intake corpus (07) is green through the Rust `check` and the HTTP conformance suite (08) is green against the Rust binary (12), both in CI. Test on a temp copy of `packages/app/fixture`.

**One origin per talk.** Each talk is served from its own origin under the scheme, with the talk in the host part (spec, decision 4), so two talks presenting at once do not share a `BroadcastChannel` or Web Locks; and the host part is the same on every launch of that talk, so what the page keeps in `localStorage` (the colour scheme) survives a restart, which the sidecar's random port did not give. Opening a Resource independently and the Notes window open under the same origin as their talk.

**What goes and what stays.** The shell's sidecar wiring (`src-tauri/src/sidecar.rs`), `packages/desktop/scripts/build-sidecar.ts`, the `externalBin` entry, the Node single-executable build and the sidecar step in 06's release pipeline go. The production Node host itself (03, `src/desktop/`) stays: it is the host 08 holds every other one to in CI, and the host the standalone-http-host tickets adopt, until 20 retires it.

**A seam first.** Today `main.rs` calls the sidecar directly (`sidecar::start` and the `Sidecar` type). Put the talk server behind a small seam in the shell (a trait, or an enum of the two servers) before the swap, so that swapping is one module and the window code does not change.

- [ ] Closing a window after an edit leaves the directory with the edit.
- [ ] Opening a talk and closing without an edit leaves the directory unchanged (ST-65).
- [ ] A 10 MiB asset upload works through the custom scheme.
- [ ] 08's body-limit, header, redirect and fallback cases green against the scheme handler's `Request -> Response` function, not only against the CLI's loopback listener.
- [ ] A talk window never navigates to a remote origin: navigation is limited to that talk's own origin under the scheme, as the sidecar's shell limits it to the sidecar's origin.
- [ ] The scheme handler refuses a mutation (any method but `GET` and `HEAD`) whose `Origin` is not the application's scheme, so a page from elsewhere cannot edit the talk; this check replaces the launch secret and the `Host` check.
- [ ] Two talks presenting at once do not cross; a talk's colour scheme survives closing and reopening it.
- [ ] The release pipeline (06) builds no Node single executable.
- [ ] Storage requirements and the `AGENTS.md` desktop entry describe the shell serving the Rust host through the scheme, with no sidecar.
