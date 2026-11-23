# 05 — Decide how the Start window's React page is built and served

**Status:** ready-for-agent

**Blocked by:** nothing.

**What to build:** A spike that answers one question and records the answer, so 02 can be built. ADR 0171 says the Start window is product UI from `@project/ui` (React). Today the shell serves only plain HTML of its own from `frontendDist` (`packages/desktop/ui`, the close question), `packages/desktop` may import no package of ours (the `eslint.config.js` zone), and the infinitycube scheme answers only an Aggregate's own windows (ST-121). The Start window has no Aggregate.

Find and prove one way to build a React page from `@project/ui` and serve it to a window the shell opens with no Aggregate, under the shell's CSP (`script-src 'self'`). Candidates to weigh, not a list to pick from blindly:

- a second Vite entry in `packages/app` (e.g. `start.html`), built beside the application, which the shell serves to the Start window;
- a Vite build whose output lands in the shell's `frontendDist`, keeping the shell's own sources free of our packages.

The answer keeps Space windows holding no IPC permission and gives the Start window's capability its label alone.

- [ ] A throwaway Start window showing one `@project/ui` `Button` that calls one invoke command, seen in a live webview on Linux (WebKitGTK), on a branch.
- [ ] The answer recorded: a short ADR if it changes a boundary (the desktop lint zone, `frontendDist`, the scheme, or what `pnpm --filter @project/desktop tauri build` builds first), otherwise a comment here; and 02's "What to build" updated to name it.
- [ ] `pnpm release:build --desktop` and the `rust` CI job still find what they bundle.

## Comments
