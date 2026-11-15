# Running InfinityCube as a desktop app

Date: 2026-11-15
Checked against: the working tree at `/home/claude/hyper` on this date (no commit hash: the copy read here is not a git checkout); external docs fetched on this date.

Marking: **[verified]** means the cited source says it. **[inferred]** means it is my reading of verified facts and nothing here has tested it. Nothing was built, run or installed for this note.

## Answer

The smallest route to a shippable desktop app is **Electron, with the run composed inside the main process**, and no Node sidecar and no second runtime:

1. The main process calls `startRun(directory, { newId, schedule, report })` (`src/run/run.ts:254`), which already gives a Fetch-native `host` and an awaitable `stop()` (`src/run/run.ts:47-55`, `:281`).
2. It serves that `host` to the window through `protocol.handle` on a privileged, standard custom scheme. That handler receives a `Request` and returns a `Response`, which is exactly the Fetch application's shape. No TCP port, no `@hono/node-server`, no Vite at run time.
3. Static files come from the prebuilt `vite build` output, and product URLs go through `host.resolveProductRequest` first, as the Vite plugin does today.
4. `before-quit` takes the place of SIGINT: the main process cancels the first quit, awaits `run.stop()`, then quits.

Two things block it, and both need decisions rather than code:

- **The Node floor.** ADR 0071 pins Node 26.8.1 and `package.json` says `>=26.8.1`. Current Electron (45.3.3, released 2026-11-14) embeds **Node 24.22.3**. The one post-Node-24 feature found in code that runs in the host is the `Uint8Array` base64/hex codecs, a V8 feature, and Electron 45 lists V8 15.6. So it probably works, but it is a different runtime from the pinned one, and ADR 0034 says a host is supported only with a tested adapter. That needs an ADR.
- **No production host exists.** `cube run` serves through **Vite's development server** (`src/cli/run-process.ts:101-114`, `packages/app/database-vite-config.ts:91-98`). It compiles TypeScript sources on demand, so it needs the whole workspace and its devDependencies. A desktop build needs a runtime-neutral "Fetch app + built static files" adapter. That adapter does not exist yet. Pending `standalone-http-host` tickets 01–06 plan a related one (`.scratch/standalone-http-host/issues/`).

**No accepted ADR decides anything about a desktop app, Electron, Tauri or any other shell** (grep of `docs/` for electron, tauri, desktop, wails, neutralino and electrobun turns up only unrelated uses of "desktop" [verified]). Several accepted ADRs bind what a desktop host may do, listed under [Binding constraints](#binding-constraints-from-accepted-adrs).

## What InfinityCube already has

### The run (`cube run`), the part to reuse

- **Launcher:** `src/cli/run-launcher.ts:79-111` spawns `run-process.ts` in its own process group, holds signals until the child says it handles them (`:29`, `:87-91`), and drops a repeat of the same signal within 250 ms (`:43`, `:92-101`). All of this exists to make terminal Ctrl-C under pnpm reliable. **A desktop shell needs none of it** [inferred]: it has no terminal and no pnpm.
- **Process:** `src/cli/run-process.ts` is the composition root. It wires signals (`:57-65`), stops when the IPC channel to the launcher drops (`:69-71`), calls `startRun` (`:78-88`), and then starts a **Vite dev server** with the run's `host` plugged in (`:101-114`). It removes Vite's SIGTERM and stdin-end listeners so Vite cannot exit before the last write (`:105-117`). On stop it closes the server first, then awaits `run.stop()` (`:119-134`).
- **Run module:** `src/run/run.ts` is runtime-agnostic apart from `node:fs` (via Import/Export). Its clock is injected as `schedule` (`:27-28`, `:35-40`; ADR 0109), and the quiet period is `RUN_QUIET_MILLISECONDS = 1_000` (`:25`). Commits are observed by subclassing the memory store (`:67-79`), and `stop()` flushes and waits (`:47-55`). **This is the seam a desktop main process calls** [verified that the shape exists; inferred that it suffices].
- **Node APIs used** by the run path: `node:fs/promises` (`readdir`, `lstat`, `readFile`, `open`, `rename`, `rm`, `rmdir`, `mkdir`, `stat`) and `node:path` (`src/run/run.ts:1`, `src/aggregate-directory/directory-source.ts:1-3`, `write-in-place.ts:1-2`, `space-directory.ts:1-2`). Across `src/` and `packages/*/src` the only `node:` modules imported are `child_process`, `crypto`, `fs`, `fs/promises`, `http`, `path`, `stream`, `timers/promises`, `url` and `util` [verified by grep]. All of these are Node core, so none is an API Electron's main process lacks [inferred: Electron's main process is Node; not checked module by module].

### The Fetch application

- ADR 0034 (accepted): the HTTP application is a Hono app on the Web Fetch model. "Node, Worker, Bun, Deno or other hosts are supported only when a tested adapter and compatible persistence composition exist" (`docs/adr/0034-the-http-application-is-fetch-native.md:6-10`, `:28-30`). ST-73 restates it (`docs/requirements/storage.md:184`).
- The run's host is `SpaceHostApplication = SpaceHttpApp & ProductRequestResolver` (`packages/aggregate/src/space-host.ts:20`). That is `fetch(Request)` plus `resolveProductRequest(pathname, method, accept)` (`packages/http/src/product-destination.ts:265-271`).
- The only Node adapter is the Vite plugin `packages/app/vite-space-http-plugin.ts`. It routes `/api/*` and valid `/assets/<hash>` paths to `fetch` (`:63-93`), asks `resolveProductRequest` for every other path before falling through to the SPA (`:199-219`), and wraps the app in `@hono/node-server`'s `getRequestListener`. That wrapper replaces the global `Request`/`Response` process-wide, and the comment says disabling it breaks commits (`:157-169`).
- `pnpm build` builds the static app and one SSR bundle for the **PostgreSQL** runtime only (`packages/app/package.json` `build`; `packages/app/http-server-build.config.ts:16`). There is no built memory/run host.

### The Mount build

- `packages/app/src/mount-main.tsx` composes the same page over a GitHub location, read into an **in-page** memory store. The page answers its own HTTP API by calling `host.fetch(request)` directly (`packages/app/src/mount/mount.ts:100-106`, origin `https://mounted.invalid` at `:72`). So **the Fetch app already runs in a browser realm** [verified].
- It writes nothing back: ST-92 and ST-107 forbid writing to GitHub and Exporting from the page (`docs/requirements/storage.md:212`, `:219`). Edits last as long as the page (ADR 0131), and IndexedDB persistence (ST-95) is not built (`:215`).
- Its CSP is generated in `packages/app/mount-headers.ts:34-46` and written to a Cloudflare `_headers` file (`packages/app/vite.mount.config.ts`). The comment notes the HTTP host sends **no** application-wide CSP (`mount-headers.ts:7-8`).
- **Desktop use:** the mount build is a read-only viewer of GitHub talks. A desktop shell around it alone adds nothing over a browser tab [inferred]. It matters as proof that `host.fetch` works without Node HTTP, and as the CSP template.

## The options

### A. Electron, run in the main process, served over a custom protocol (recommended)

- **Runtime:** Electron 45.3.3 (2026-11-14) ships Chromium 156.0.8078.100 and Node 24.22.3. 44.x and 43.x also ship Node 24.22.x, and the 2026-10-13 nightly (46) shipped Node 24.21.0 ([stable releases](https://releases.electronjs.org/releases/stable), [2026-10-13](https://releases.electronjs.org/history/2026-10-13)) [verified]. The [Electron 45 notes](https://www.electronjs.org/blog/electron-45-0) list V8 15.6 [verified].
- **Node floor:** not met as written. `engines.node` is `>=26.8.1` (`package.json:7-9`), `.node-version` is `26.8.1`, and ADR 0071 "pins Node 26.8.1" (`docs/adr/0071-native-typed-array-codecs-set-the-platform-floor.md:6`) [verified].
- **What the floor protects:** the native `Uint8Array` codecs. They are used in code that runs on the host: `packages/core/src/compact-uuid.ts:8-30` and `packages/persistence/src/assets.ts:80-83`, the asset hash computed when `POST /assets` stores bytes [verified]. MDN lists them as Baseline since September 2025 ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64)) [verified]. Electron's Node runs on the V8 Electron lists (15.6, Chromium 156), so they should be present in the main process too [inferred; I found no Electron doc that states the main process shares Chromium's V8, so a one-line runtime probe is the first check].
- **Other newer APIs:** `URL.parse` and `Promise.withResolvers` are also used. No `node:sqlite`, `import.meta.dirname`, `RegExp.escape` or `Error.isError` was found. This scan covered only repo sources, not dependencies.
- **Serving:** [`protocol.handle(scheme, handler)`](https://www.electronjs.org/docs/latest/api/protocol) gives the handler a `Request` and expects a `Response` or a promise of one. `registerSchemesAsPrivileged` must run before `ready`, once. `standard` gives the scheme normal relative/absolute URL resolution, and web storage and cookies are disabled for non-standard schemes [verified].
  - The app uses root-absolute paths (`/assets/…`, `/api/…`, `/infinity-cube-logo.svg` in `packages/app/index.html`; history-based product URLs in `packages/app/src/browser-history.ts`), so the scheme must be `standard` (and `secure`, `supportFetchAPI`) [inferred].
  - The adapter is the routing in `vite-space-http-plugin.ts:63-93,199-219`, re-expressed over `Request`/`Response`, plus static files from the build output and the `index.html` fallback. Because Electron hands a real `Request`, `@hono/node-server` and its global override are not needed [inferred].
- **In-process vs `utilityProcess`:**
  - In-process is simplest, because `stop()` is a direct await.
  - [`utilityProcess.fork`](https://www.electronjs.org/docs/latest/api/utility-process) gives a Node child with `MessagePort`s and an `exit` event [verified]. It would isolate a crashing Export from the UI, but the main process would then have to proxy every protocol request over a port [inferred]. Start in-process.
- **Module format:** ESM in the main process since Electron 28. Top-level dynamic `import()` is not awaited before `ready` unless you await it ([ESM](https://www.electronjs.org/docs/latest/tutorial/esm)) [verified]. The repo runs TypeScript through `tsx` (`package.json` `cube` script), so the main process needs a bundled JS entry, with workspace packages inlined as `http-server-build.config.ts:23-25` already does for SSR [inferred].
- **Not reusable:** the Vite dev server path. `runViteConfig` uses `configFile: false`, `root` at the package source and its own `cacheDir` (`database-vite-config.ts:91-98`), so it serves sources, not a build [verified].

### A′. Electron spawning the existing `cube run --no-open` (throwaway spike only)

- The main process would spawn `pnpm cube run <dir> --no-open`, read the URL it prints (`run-process.ts:142-143`) and `loadURL` it. It would forward quit as SIGINT, using the flush path that exists today.
- It needs a full checkout, pnpm, Node 26 on PATH and Vite at run time. On Windows, Node's `subprocess.kill()` has no real SIGINT semantics (not checked here). This is a way to feel the ergonomics in a day, not a product [inferred].

### B. Tauri v2 with a Node sidecar

- **Sidecar packaging:** sidecars are listed in `bundle.externalBin` and must exist as `<name>-<target-triple>`. They are spawned from Rust (`app.shell().sidecar(..).spawn()`) or JS (`Command.sidecar`) under a `shell:allow-execute` / `shell:allow-spawn` capability ([sidecar](https://v2.tauri.app/develop/sidecar/)). Tauri's Node guide compiles the Node app with `pkg` ([Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)) [verified]. **Neither page says how a sidecar is stopped or whether it is killed on app exit** [verified absence on those two pages].
- **Node floor:** this route can meet it. [Node SEA](https://nodejs.org/api/single-executable-applications.html) builds a single executable from a Node 26 binary (`node --build-sea`, added v25.5.0). The entry may be ESM (`mainFormat: "module"`). But `import()` and `require` reach only built-ins without extra setup, so bundle to one file. Native addons need `process.dlopen`. SEA is "Stability 1.1 – Active development", and macOS x64 is skipped in its CI [verified]. The run path has no native addons [inferred from the `node:`-only import list; SQLite/Postgres drivers are not on the run path].
- **Work involved:** the same new Fetch+static adapter as A, plus a real Node HTTP listener (127.0.0.1, any port) inside the sidecar. Add a graceful-stop protocol, for example a stdin message, because Tauri gives no documented shutdown hook for the child, and Windows has no SIGINT to send it [inferred]. The run already stops when its parent IPC channel drops (`run-process.ts:69-71`), a model to copy.
- **Webview floor risk:** Tauri uses WebView2 on Windows (evergreen), WKWebView on macOS (tied to the OS version) and WebKitGTK on Linux (distro package) ([webview versions](https://v2.tauri.app/reference/webview-versions/)) [verified]. ADR 0071 requires native `Uint8Array` codecs in the browser, and the renderer uses them for product URLs (`compact-uuid.ts`). An older macOS or an older distro WebKitGTK may lack them [inferred; not checked per version]. The repo's tests are Chromium-only (`AGENTS.md`, `pnpm e2e`), so WebKit is untested ground.
- **Bundle size:** "a minimal Tauri app can be less than 600KB" ([start](https://v2.tauri.app/start/)) [verified]. A Node SEA sidecar adds a whole Node binary, so the size advantage over Electron shrinks to "no Chromium" [inferred].

### C. Tauri with a Rust reimplementation of the host (out of scope)

This would re-implement intake, the commit decision, Import and Export in Rust. That is a second implementation of the one intake every door shares ("Every door applies the same intake", `docs/requirements/storage.md:224`; ST-90's "one reader"). It breaks "one application runs in every host" (ST-73) [inferred]. Not worth costing.

### D. Renderer-hosted run (mount-style) with file access over IPC (possible, more change)

- The Mount composition already runs `createSpaceHost` in the page (`mount/mount.ts`), and the reader takes any `AggregateSource` (`docs/requirements/storage.md:25`). A desktop renderer could read the directory through an IPC-backed source [inferred].
- But Export (`src/aggregate-directory/write-in-place.ts`) is Node-only. The lint zone allows only `packages/app/src/mount/` to import `@project/aggregate` (`eslint.config.js:133-135`; ST-86).
- So this route needs a second Export writer over IPC, and quit would have to wait on a renderer. More moving parts than A for no gain [inferred].

### Others

- **Electrobun** runs its main process on Bun, with the system webview or optional CEF ([what is Electrobun](https://docs.electrobun.dev/electrobun/guides/what-is-electrobun/)) [verified]. Bun is not a runtime this repo tests, and ADR 0034 requires a tested adapter, so it is out for now.
- **Wails** (Go) and **Neutralino** (no Node backend) would mean option C. Not pursued.

## Folder picking, writing, shutdown, windows

- **Picking a folder:** [`dialog.showOpenDialog`](https://www.electronjs.org/docs/latest/api/dialog) with `properties: ['openDirectory']` runs in the main process and resolves `{ canceled, filePaths }`. `createDirectory` is macOS-only [verified]. The run's own refusals already cover what to do with the pick (ST-67, `docs/requirements/storage.md:168`): an empty or missing folder could offer `initAggregate` (`src/run/run.ts:120`, ST-70), and anything else shows the intake diagnostics from `describeRunRefusal` [inferred]. [`app.addRecentDocument`](https://www.electronjs.org/docs/latest/api/app) feeds the OS recent list on macOS and Windows [verified].
- **File watching: do not add it.** ADR 0117 rejects detecting on-disk changes and locking (`docs/adr/0117-…:11`, `:24`). CONTEXT.md names Running with "_Avoid_: watching, syncing, live mode" (`CONTEXT.md:280-282`). Adding a watcher needs a new ADR [verified that it is decided].
- **Export-on-quiet:** reused unchanged. The main process passes `schedule` as `setTimeout`/`clearTimeout`, as `run-process.ts:78-85` does [inferred].
- **Known bug:** opening a Space can schedule an Export today (ST-65, `docs/requirements/storage.md:166`). A desktop app that opens a talk "just to look" would rewrite files. Fix it first or accept it knowingly [verified bug status].
- **Shutdown flush, replacing SIGINT/SIGTERM/SIGHUP:**
  - [`before-quit`/`will-quit`](https://www.electronjs.org/docs/latest/api/app): `event.preventDefault()` prevents termination. The docs do not describe waiting on a promise [verified]. The pattern is: on the first `before-quit`, call `preventDefault()`, await `run.stop()` (and the protocol stops accepting commits first, mirroring `run-process.ts:121-125`), then call `app.quit()` again with a flag set [inferred; needs a test].
  - The run's "a second signal exits at once" maps to "a second quit request while flushing exits without waiting" [inferred].
  - **Windows shutdown/logoff:** `before-quit`, `will-quit` and `quit` are **not emitted** [verified, app docs]. BrowserWindow `session-end` fires, but "there is no way to prevent the session from ending" ([BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)) [verified]. On Linux and macOS, `powerMonitor` `shutdown` lets Electron "attempt to delay" shutdown with `preventDefault()` ([powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)) [verified].
  - So a Windows logoff can lose up to the quiet period, the same cost ADR 0117 already accepts for SIGKILL and power loss (`docs/adr/0117-…:22`) [inferred]. Flushing from `session-end` is best effort.
  - Under A, the 250 ms de-dup, the process group and the IPC handshake in `run-launcher.ts` all go away [inferred].
- **Multiple windows and talks:**
  - One run per directory. ADR 0117 leaves two runs on one directory to git (`:11`). Inside one app, keeping a `Map<directory, run>` and focusing the existing window is not a directory lock, so it stays within that ADR [inferred].
  - [`app.requestSingleInstanceLock`](https://www.electronjs.org/docs/latest/api/app) with `second-instance` keeps a second launch from starting a second run on the same folder [verified API; inferred use].
  - Give each run its own origin, by putting a run id in the standard scheme's host part (for example `cube://<run-id>/spaces/…`). Then `/api` requests are routed by host, and the presentation `BroadcastChannel` and Web Locks (`packages/app/src/main.tsx:19-26`, `browser-presentation-channel.ts`), which are origin-scoped in browsers, do not cross between talks [inferred].
  - Windows opened with `window.open` ("open independently", `packages/app/src/open-independently.ts:27`, `noopener,noreferrer`; the Notes window) need a `setWindowOpenHandler` that allows same-origin URLs and denies everything else. Electron 45 also puts a `window.open` child whose sandbox state differs from its opener into a separate process with no opener ([Electron 45](https://www.electronjs.org/blog/electron-45-0)) [verified]. Keep one `webPreferences` for all windows so the Notes window keeps its channel [inferred].

## Security model

- **Electron defaults:** context isolation since 12, sandbox since 20, and `nodeIntegration` off since 5. The checklist asks for a CSP, custom protocols over `file://`, limits on navigation and new windows, validating IPC senders, and not exposing Electron APIs to content ([security](https://www.electronjs.org/docs/latest/tutorial/security)) [verified]. Under A the renderer talks only HTTP-shaped requests to its own scheme, so **no preload and no IPC are needed for the first step**. Folder picking can live in the native app menu [inferred].
- **CSP:** the server host sends none today (`mount-headers.ts:7-8`). The desktop protocol handler can set a `Content-Security-Policy` header on the page response. Start from `contentSecurityPolicy` in `mount-headers.ts:34-46` and drop the two GitHub `connect-src` hosts. Keep `img-src https: data: blob:`, because an Image Resource may name an external picture (ADR 0106, ST-94), and keep the inline-script hash for `index.html`'s guard [inferred]. Stored assets keep their own `default-src 'none'; sandbox` and `nosniff`, which come from the Fetch app itself (ST-76, `docs/requirements/storage.md:187`) [verified that the app sets them].
- **No listening port under A:** nothing on the machine can reach the unauthenticated API [inferred]. Options A′ and B do listen on loopback. Vite's dev server has its own host checks. A plain Node listener in a sidecar would not, unless one is added [inferred; Vite behaviour not re-checked here].
- **Tauri:** capabilities grant permissions per window or webview. Commands registered through `invoke_handler` are reachable from every window unless restricted, and `remote.urls` admits outside origins ([capabilities](https://v2.tauri.app/security/capabilities/)) [verified]. CSP is set in `tauri.conf.json`, Tauri adds hashes and nonces to bundled assets at compile time, and `ipc:`/`http://ipc.localhost` must be allowed for IPC ([CSP](https://v2.tauri.app/security/csp/)) [verified]. A UI loaded from a sidecar's `http://127.0.0.1` URL would be "remote" to Tauri [inferred].

## Packaging, signing, updates, size (brief)

- **Electron:** the docs recommend [Electron Forge](https://www.electronjs.org/docs/latest/tutorial/forge-overview) to package, make installers and publish. Electron Builder and Conveyor are named but lack official support [verified].
- **Electron signing** ([code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)) [verified]:
  - macOS blocks unsigned apps through Gatekeeper, and notarization comes after signing.
  - Squirrel.Mac "requires the app to be signed for automatic updates to work at all".
  - On Windows an OV certificate no longer helps. EV, or Azure Artifact Signing (formerly Azure Trusted Signing, available in some countries only), avoids SmartScreen warnings.
- **Electron updates:** Squirrel.Mac and Squirrel.Windows through `autoUpdater`. [update.electronjs.org](https://www.electronjs.org/docs/latest/tutorial/updates) needs macOS or Windows, a **public GitHub repository**, GitHub Releases and a signed macOS build. Static storage is the alternative [verified]. The page names no Linux client.
- **Tauri:** updater signatures are mandatory and "cannot be disabled". It updates from a static JSON file or a server, on Windows, Linux, macOS, Android and iOS ([updater](https://v2.tauri.app/plugin/updater/)) [verified].
- **Size:** Electron bundles Chromium and Node (the version table above). Tauri's minimal app is under 600 KB, plus a Node SEA for option B [verified/inferred as marked above]. I fetched no official megabyte figure for Electron.
- **Project state:** InfinityCube is unreleased, and ADR 0152 makes no compatibility promise outside the repository (`AGENTS.md` "State"). Distribution, signing and auto-update are therefore later questions than the host adapter.

## Binding constraints from accepted ADRs

- **0034:** a new host needs a tested adapter. The route module stays free of `node:` and Vite imports.
- **0071:** Node 26.8.1 is pinned, and the browser floor is native `Uint8Array` codecs. Electron's Node 24 conflicts with the pin. A desktop host needs a new ADR that refines 0071 (or 0034) for the embedded runtime.
- **0117:** a run uses the memory store only, the directory is the durable copy, git answers for history, and there is no watching or locking. It flushes on stop and accepts the crash window.
- **0109:** nondeterminism (ids, clock) is injected at composition. A desktop main process is a new composition root and must inject `newId` and `schedule`, as `run-process.ts` does.
- **0130/0131/0132:** Mounting is read-only to GitHub and never Exports, so it is not a desktop authoring route.
- **0124:** there is one CLI. A desktop app is not a CLI verb, so nothing here changes `cube`.
- **Requirement workflow** (`AGENTS.md`): a host change updates `docs/requirements/storage.md` and needs an ADR in the same change.

## Recommendation and smallest viable first step

1. **Decide first (ADR):** "A desktop host runs the run in Electron's main process and serves the Fetch application over a custom protocol." The ADR states the embedded runtime (Node 24.x on V8 15.x) as an accepted exception to ADR 0071's pin for that host, or waits for an Electron on Node ≥ 26.
2. **First code step, runtime-neutral and testable today:** a pure `(Request) => Promise<Response>` host. It wraps a `SpaceHostApplication` and a map of built static files, routing as `vite-space-http-plugin.ts:63-93,199-219` does, with SPA fallback and a page CSP. Vitest can hold it to the same answers `test/unit/vite-hono-host.test.ts` holds the Vite host to. The standalone-host tickets (`05-preview-through-the-built-standalone-host.md`) want much the same seam, so the two efforts should share it [inferred].
3. **Then a spike** (under a spike harness, not a package): an Electron main that
   - picks a folder,
   - calls `startRun`,
   - registers the scheme,
   - loads `cube://<run-id>/`,
   - flushes on `before-quit`.

   Prove it on the tracked fixture (`packages/app/fixture`) with a temp copy, never a human's directory. Before using real talks, fix ST-65.

The day-one spike A′ (spawning `cube run --no-open`) is optional. It only tells you how the shell feels.

## Open questions and risks

- **[risk]** Electron's main-process V8 and the `Uint8Array` codecs: verify with a one-line probe in Electron 45 before anything else.
- **[risk]** Behaviour that relies on Node 26 in dependencies (Hono 4.12.33, `@hono/node-server` 2.0.12, `tsx` 4.20.6, Vite 6) was not audited. Under A only Hono and the workspace code run in the main process.
- **[open]** Does `protocol.handle` stream a 10 MiB `POST /assets` body the way the app's bounded-body reader expects (`packages/http/src/index.ts:50`, `:234`, ST-75/ST-77)? Untested.
- **[open]** `before-quit` with an awaited flush: confirm the cancel-then-requit pattern works across macOS Cmd-Q, window close and `autoUpdater.quitAndInstall()`, after which `before-quit` fires once windows are already closed (app docs).
- **[open]** Windows logoff loses the last ≤ 1 s of edits. Is the 0117 cost acceptance enough, or should `session-end` attempt a flush?
- **[open]** Should several talks open at once, one origin per run, or one talk per app instance at first? The second is simpler.
- **[risk, Tauri only]** WebKit (WKWebView or WebKitGTK) is untested by this repo, and its version follows the OS or distro, against ADR 0071's floor.
- **[open]** Signing and auto-update need certificates (Apple Developer ID; EV or Azure Artifact Signing), and update.electronjs.org needs a public repo. None of this is needed for a local, unsigned spike.

## Sources

Repo (read on 2026-11-15):
- `AGENTS.md`/`CLAUDE.md`, `CONTEXT.md:280-282`
- `docs/requirements/storage.md` (ST-62–ST-67, ST-73–ST-76, ST-85–ST-107)
- `docs/adr/0034`, `0071`, `0117`, `0130`
- `docs/aggregate-directory.md`, `docs/deploy-cloudflare.md`
- `src/cli/run-launcher.ts`, `src/cli/run-process.ts`, `src/run/run.ts`, `src/aggregate-directory/*`
- `packages/app/{src/main.tsx,src/mount-main.tsx,src/mount/mount.ts,mount-headers.ts,vite-space-http-plugin.ts,database-vite-config.ts,http-server-build.config.ts,vite.mount.config.ts,index.html,package.json}`
- `packages/aggregate/src/space-host.ts`, `packages/http/src/product-destination.ts`
- `packages/core/src/compact-uuid.ts`, `packages/persistence/src/assets.ts`
- `.scratch/standalone-http-host/issues/01–06`

External (fetched on 2026-11-15):
- Electron: [stable releases](https://releases.electronjs.org/releases/stable), [history 2026-10-13](https://releases.electronjs.org/history/2026-10-13), [Electron 45](https://www.electronjs.org/blog/electron-45-0), [protocol](https://www.electronjs.org/docs/latest/api/protocol), [security](https://www.electronjs.org/docs/latest/tutorial/security), [app](https://www.electronjs.org/docs/latest/api/app), [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor), [dialog](https://www.electronjs.org/docs/latest/api/dialog), [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [ESM](https://www.electronjs.org/docs/latest/tutorial/esm), [native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [Forge](https://www.electronjs.org/docs/latest/tutorial/forge-overview), [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [updates](https://www.electronjs.org/docs/latest/tutorial/updates)
- Tauri v2: [sidecar](https://v2.tauri.app/develop/sidecar/), [Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/), [capabilities](https://v2.tauri.app/security/capabilities/), [CSP](https://v2.tauri.app/security/csp/), [webview versions](https://v2.tauri.app/reference/webview-versions/), [start](https://v2.tauri.app/start/), [updater](https://v2.tauri.app/plugin/updater/)
- Node: [single executable applications](https://nodejs.org/api/single-executable-applications.html)
- MDN: [Uint8Array.fromBase64](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64)
- Electrobun: [what is Electrobun](https://docs.electrobun.dev/electrobun/guides/what-is-electrobun/)
