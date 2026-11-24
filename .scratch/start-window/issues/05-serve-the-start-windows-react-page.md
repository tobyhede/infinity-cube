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

- [x] A throwaway Start window showing one `@project/ui` `Button` that calls one invoke command, seen in a live webview on Linux (WebKitGTK), on a branch.
- [ ] The close question still opens and answers. (Opens and draws from the new `frontendDist`, seen under Xvfb; answering was not driven through a real close, see Comments.)
- [x] Space windows still hold no IPC permission; the `rust` CI job and the desktop build pass. (No capability names a Space window, held by a test; a Space window opened and drew under Xvfb; `tauri build --bundles deb` passed locally; the `rust` job and "Build the desktop application" passed on PR #527 at `da700d54`.)
- [x] A short ADR if it changes a boundary (`frontendDist`, or what the desktop build builds first), otherwise a comment here; 02's "What to build" updated to name the approach. (ADR 0172.)
- [x] A follow-up ticket to rebuild the close question from `@project/ui` in the same build. (06.)

## Comments

### 2026-11-24 — the spike (branch `worktree-agent-a99fc2a8df2226c1d`)

**What was built.** `packages/app/start.html` (entry `src/start-main.tsx`, page `src/components/StartPage.tsx`: one `@project/ui` `Button` invoking `start_window_ping` through `window.__TAURI__`, so no `@tauri-apps/api`). `packages/app/desktop-shell-build.config.ts` (`pnpm --filter @project/app desktop-shell:build`) builds it into `packages/app/dist-desktop-shell` and emits `closing.html`, `.css` and `.js` from `packages/desktop/ui` byte for byte beside it (a Vite plugin naming the three files, so `tauri.d.ts` stays behind). `tauri.conf.json`'s `frontendDist` is `../../app/dist-desktop-shell`. `src-tauri/src/start.rs` opens `WebviewUrl::App("start.html")` under the label `start`; `capabilities/start.json` names that label alone and grants `allow-start-window-ping` alone; `build.rs` declares the command. It opens at launch only in a debug build with `INFINITY_CUBE_START_WINDOW_SPIKE=1`, in place of the launch decision; every other launch is unchanged. Ticket 02 removes the gate, the page and the ping.

**Why a separate output, not a second entry in `dist`.** `dist` is the resource the host serves to Space windows; putting `start.html` and `closing.html` there would serve pages that ask for IPC to windows that hold none, and embed all of `dist` in the binary. A separate `outDir` keeps the shell's pages out of what the host serves, and copying the question's files in with the build (rather than `publicDir`) copies only them. Recorded as ADR 0172, since `frontendDist` and what every desktop build builds first both move.

**CSP.** Unchanged: `default-src 'self'; script-src 'self'; style-src 'self'; connect-src ipc: http://ipc.localhost`. Vite emits the page's script and stylesheet as files under `/assets/` with no inline script or style (`packages/app/test/desktop-shell-build.test.ts` holds that), so `script-src 'self'` and `style-src 'self'` admit them, and the invoke goes through `ipc:` as the close question's does. Seen under Tauri's app protocol on WebKitGTK: the page drew, styled, and the ping answered.

**Live run.** Xvfb 1280x800 with `dbus-run-session`, WebKitGTK 2.52.6, `INFINITY_CUBE_START_WINDOW_SPIKE=1 target/debug/infinity-cube-desktop`, clicked with XTest: the Start window drew the Button, and clicking it showed "The shell answered: pong" (screenshot taken, not committed: `.scratch/` keeps no images). With a temporary local change opening `question::ask` instead (not committed), the close question drew from the new `frontendDist` with its folder read from the fragment and the caret on Keep waiting (screenshot taken, not committed). Launched with a folder `pnpm cube init` wrote, a Space window opened and drew its Space from the host's resource, unchanged. **Not seen:** the question answering a real close (a write held up ten seconds; its files and capability are unchanged, but it was not driven), a Space window refused an invoke at runtime (held by configuration and the test below, not tried), macOS, and the Start window under a window manager (Xvfb ran none, so its decorations are not shown).

**Tests.** `packages/app/test/desktop-shell-build.test.ts`: the build holds `start.html` and the three question files byte for byte, no `index.html` or `tauri.d.ts`, and loads its script and stylesheet from files only (about 15 s, one build). `src/start.rs`: the gate opens the window only for `1` and only in a debug build; the capability files are exactly `closing.json` (`closing-*`, `allow-answer-closing`) and `start.json` (`start`, `allow-start-window-ping`); no capability names a `space-*` or `view-*` label. `cargo test -p infinity-cube-desktop` (163 passed), `cargo fmt --all --check`, `cargo clippy -p infinity-cube-desktop --all-targets -- -D warnings`, `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`, `prettier --check .` and eslint on the changed files passed, `-j 2`. `vitest run test/unit` fails 169 tests here on Node 22 (`digest.toBase64 is not a function`, the platform floor of ADR 0071); none of them reads this change, and `current-domain-vocabulary` and `adr-status-blocks` pass.

**Builds.** `pnpm --filter @project/desktop build --bundles deb` ran `vite build`, then `desktop-shell:build`, then `tauri build`, and bundled a 10.50 MiB `.deb`. `cargo build -p infinity-cube-desktop` finds the entry only once `desktop-shell:build` has run: Tauri's build script reads `frontendDist`, as it already read `packages/app/dist`. `release/build.sh --desktop` now runs `desktop-shell:build` after `vite build`; it builds on macOS only, so it was read and checked with `sh -n`, not run. The `rust` CI job gains a step running `desktop-shell:build`.

**Size** (release `infinity-cube-desktop`, Linux x86_64, Tauri compressing `frontendDist` with Brotli):

| `frontendDist` | Uncompressed | Binary | Over `packages/desktop/ui` |
| --- | --- | --- | --- |
| `packages/desktop/ui` (before) | 3.6 KB | 25,350,360 B | — |
| `dist-desktop-shell` as built | 4.70 MB | 26,635,184 B | +1.23 MiB |
| all of `dist` (the rejected second entry) | 5.43 MB | 26,831,672 B | +1.41 MiB |
| `dist-desktop-shell`, packages marked `sideEffects: ["*.css"]` (experiment, reverted) | 0.26 MB | 25,419,576 B | +68 KiB |

The resource the host serves (`app/`, 5.4 MB) is carried as before in every row. The shell build is nearly the whole application because `import { Button } from '@project/ui'` reaches the plugin catalogue through the index, and with no `sideEffects` declared Rollup keeps every plugin's lazy chunks (Mermaid, KaTeX, CodeMirror) though the page never loads them. Declaring `"sideEffects": ["*.css"]` in `ui`, `plugins`, every `plugin-*`, `resource-api` and `core` cut the build to `start-*.js` (184 KB) and `start-*.css` (74 KB). That change touches the browser application's own build, so it is left to 02 (or a ticket of its own) to make and test; 06 notes it too.

