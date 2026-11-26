# 03 — A second launch opens its folders in the running application

**Status:** needs-triage

**Blocked by:** 01.

**What to build:** today a second launch naming a folder starts a second, independent shell. With `tauri-plugin-single-instance`, its arguments and working directory reach the running shell, which resolves the folders against that directory and opens them as one more `open(origin, folders)` with a new `Origin`. Prior art and sources: VS Code's single-instance hand-off ([main.ts](https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/main.ts), [launchMainService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/launch/electron-main/launchMainService.ts)), Zed's open queue ([open_listener.rs](https://github.com/zed-industries/zed/blob/main/crates/zed/src/zed/open_listener.rs)), and the plugin ([README](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/single-instance/README.md), [docs](https://v2.tauri.app/plugin/single-instance/)).

Open questions for triage: does a second instance count as the command line for whether the Start window shows; does ADR 0162's directory lock already refuse the duplicate run, and what does the person see today; does this need an ADR, since it changes what a launch does (ST-131).

## Comments
