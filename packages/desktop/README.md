# InfinityCube desktop

The desktop application (ADR 0155, first stage): a Tauri shell whose talk windows are each served by a desktop sidecar, the Node host in `src/desktop/` built into a single executable.

## Build

Needs Node 26 (the sidecar is a copy of the Node that builds it), pnpm, Rust, and [Tauri's system prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm --filter @project/desktop sidecar:build   # browser app + sidecar executable
pnpm --filter @project/desktop tauri build     # the installable bundle
```

For a quick run without bundling: `cargo build` in `src-tauri/`, then `src-tauri/target/debug/infinity-cube-desktop <talk folder>`.

The first release is unsigned: on macOS, allow it once under System Settings › Privacy & Security › Open Anyway.
