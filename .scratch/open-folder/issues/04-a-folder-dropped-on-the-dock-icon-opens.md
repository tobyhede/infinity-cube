# 04 — A folder dropped on the Dock icon opens

**Status:** needs-triage

**Blocked by:** 01.

**What to build:** on macOS, handle `RunEvent::Opened { urls }`, so a folder dropped on the Dock icon (or opened with the application from Finder) opens as one more `open(origin, folders)` with a new `Origin`. The bundle needs `fileAssociations` with content type `public.folder`, not yet verified on a macOS build. Sources: [`RunEvent` in Tauri's app.rs](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/app.rs), Tauri's [file-associations example](https://github.com/tauri-apps/tauri/blob/dev/examples/file-associations/src-tauri/src/main.rs), [`FileAssociation` config](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/src/config.rs) and the [CLI changelog for `contentTypes`](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/CHANGELOG.md); VS Code batches macOS `open-file` events ([app.ts](https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/app.ts)); Zed's cold-launch race is described in [open_listener.rs](https://github.com/zed-industries/zed/blob/main/crates/zed/src/zed/open_listener.rs).

Open questions for triage: can `Opened` arrive before setup has decided what to show at launch, which would need the start-up gate the spec leaves out (Zed's #61346 was that race); does it need an ADR (ST-131).

## Comments
