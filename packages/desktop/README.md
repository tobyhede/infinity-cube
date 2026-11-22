# InfinityCube desktop

The desktop application (ADR 0155): a Tauri shell that opens each Aggregate directory in a window of its own, served by a run of the Rust host (`crates/host`) in the shell's own process. There is no sidecar and no port: each Aggregate is served through the `infinitycube` URI scheme at an origin of its own (Storage ST-121).

- `src-tauri/src/address.rs` — an Aggregate's origin, `infinitycube://<key>`, where `<key>` is half the SHA-256 of the folder's canonical path: the same on every launch, so the page's `localStorage` (the colour scheme) survives a restart; moving or renaming the folder gives it a new one. On Windows each Aggregate gets a scheme of its own instead (`.scratch/rust-host/issues/13-swap-the-sidecar-for-the-rust-host.md`).
- `src-tauri/src/scheme.rs` — the scheme handler, a plain `Request -> Response` function: it answers only the Aggregate's own windows, and a change only from the Aggregate's own page, and hands everything else to the host's application unchanged.
- `src-tauri/src/server.rs` — the seam the window code calls, and the run behind it. Closing an Aggregate's window waits for the run to write any edit not yet on disk; a write still running after ten seconds asks whether to keep waiting or close without saving (Storage ST-122), and a failed write is reported in a dialog.

- `src-tauri/src/launch.rs` — what opens on starting. There is no home window: every window is a Space's, a window a Space's page opened, or a close's question. A folder named on the command line opens at once; with none named, or none that opens, the shell asks for one, and cancelling ends the application. File › Open… (`CmdOrCtrl+O`) asks for another folder while it runs. `tauri.conf.json` declares no window, so Tauri opens nothing by itself.

The close question window (`ui/closing.html`) sits outside UI-1's shadcn-first rule (`docs/requirements/ui.md`): this package imports none of our packages, which its `no-restricted-imports` zone in `eslint.config.js` forbids, and it is a static page with two buttons, not the React application, so its hand-rolled `<button>`s and `closing.css` record no deviation.

## Build

Needs Node ≥ 26.8.1 and pnpm 9 (for the browser application), Rust, and [Tauri's system prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm --filter @project/desktop build   # the browser application, then every bundle for this platform
```

On Linux, to build only the `.deb`, build the browser application first, since `tauri build` alone does not:

```sh
pnpm --filter @project/app exec vite build
pnpm --filter @project/desktop tauri build --bundles deb
```

Bundles are written under `target/release/bundle/` at the repository root, such as `target/release/bundle/deb/InfinityCube_0.0.0_amd64.deb`.

For a quick run without bundling: `pnpm --filter @project/app exec vite build` once, then `cargo build -p infinity-cube-desktop` from the repository root and `target/debug/infinity-cube-desktop <Aggregate directory>` (the Cargo workspace's `target/` is at the root). `cargo test -p infinity-cube-desktop` (or `cargo nextest run`) runs the scheme handler against a copy of `packages/app/fixture` without opening a window.

There is no published desktop release yet. A bundle you build is unsigned: on macOS, allow it once under System Settings › Privacy & Security › Open Anyway.
