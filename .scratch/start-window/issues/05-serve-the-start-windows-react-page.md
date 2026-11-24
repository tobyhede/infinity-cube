# 05 — Serve the Start window's React page from the app's build

**Status:** ready-for-agent

**Blocked by:** nothing.

**What to build:** A spike that proves one approach, so 02 can be built on it. ADR 0171 says the Start window is product UI from `@project/ui` (React). Today the shell's own frontend (`frontendDist`) is `packages/desktop/ui`, plain HTML for the close question (`question.rs`), and the infinitycube scheme answers only an Aggregate's own windows (ST-121). The Start window has no Aggregate.

The approach, which follows Tauri's usual shape for a multi-window app (one web build as `frontendDist`, a page per window, commands scoped per window label):

- `packages/app` gains a second Vite entry, `start.html`, drawn from `@project/ui` like the rest of the application.
- That build becomes the shell's `frontendDist`, and the close question's files go in it beside `start.html`, unchanged for now, so `WebviewUrl::App("closing.html")` still resolves.
- The shell opens the Start window as `WebviewUrl::App("start.html")` under its own label, with a capability naming that label alone.
- Space windows keep the infinitycube scheme and no IPC permission, and the host keeps serving the application it is bundled with.

The `eslint.config.js` zone that keeps `packages/desktop` from importing `@project/*` is not in the way: the page lives in `packages/app`.

Settle in the spike:

- the CSP under Tauri's app protocol: the page's scripts load and its invoke reaches the shell, with `script-src 'self'` kept;
- that `pnpm --filter @project/desktop tauri build`, `cargo build -p infinity-cube-desktop` and `pnpm release:build --desktop` build the entry first and find it;
- what embedding the application twice (in the binary as `frontendDist`, and as the resource the host serves) costs in bundle size, recorded as a measurement here.

- [ ] A throwaway Start window showing one `@project/ui` `Button` that calls one invoke command, seen in a live webview on Linux (WebKitGTK), on a branch.
- [ ] The close question still opens and answers.
- [ ] Space windows still hold no IPC permission; the `rust` CI job and the desktop build pass.
- [ ] A short ADR if it changes a boundary (`frontendDist`, or what the desktop build builds first), otherwise a comment here; 02's "What to build" updated to name the approach.
- [ ] A follow-up ticket to rebuild the close question from `@project/ui` in the same build.

## Comments
