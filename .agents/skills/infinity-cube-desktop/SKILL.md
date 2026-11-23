---
name: infinity-cube-desktop
description: This skill should be used when changing or debugging the Tauri desktop app in `packages/desktop` — opening, closing or quitting a Space window, or the Export of its Edits; the `infinitycube` scheme or an invoke command's capability; the home window; a failed-write notice; bundling, the macOS DMG, the Linux `.deb` or the updater. Triggers include "the desktop app won't open my folder", "my edit didn't save in the desktop app", "closing the window hangs", "add a Tauri command", "the scheme refuses a request", "the DMG is missing the UI" and "the update isn't offered".
---

# InfinityCube desktop

Start by naming the window that makes the request and who owns the result. The home window (`home`) opens an Aggregate directory. A Space window (`space-*`) runs the shared browser application against the Rust host in the shell's own process. A close's question window (`closing-*`) belongs to the shell. The rules are ST-119, ST-121, ST-122, ST-124 and ST-130 in [Storage and hosts](../../../docs/requirements/storage.md), and a behaviour change updates the rule it changes in the same commit.

A defect visible on both desktop and web belongs to the shared application or host contract: reproduce it there before changing the shell. For the React application inside a Space window, use the `shadcn-first-ui` skill.

The shell's build script and its tests need the browser application built first: `pnpm --filter @project/app exec vite build`. To try a change on a folder, `cargo build -p infinity-cube-desktop`, then `target/debug/infinity-cube-desktop <folder>`.

Report evidence by tier: a build, a Rust test, or a live webview, naming engine and platform for a live webview. A change to what the webview sends or shows (a request header, a window, a dialog) is proven only in a live webview; without one, say which engine and platform have not been run, as ST-121 does.

## Window lifecycle

For opening a folder, exporting an Edit, closing a Space window or quitting.

- **Open.** Trace from the folder chooser through `open_aggregate_at` in [main.rs](../../../packages/desktop/src-tauri/src/main.rs), the [registry](../../../packages/desktop/src-tauri/src/aggregates.rs) of open and closing Aggregates, and [server.rs](../../../packages/desktop/src-tauri/src/server.rs), which opens the host run, resolves the first address and handles navigation. A directory already in use is refused by the registry within the shell and by the lock of ST-124 across processes.
- **Export.** An Edit reaches the Rust host through the scheme, and the host schedules Export and owns the write (ST-119). Reproduce a change to which bytes land on disk, or when, in the [host run tests](../../../crates/host/tests/run.rs). The dialog for a failed write, shown for the first failure of a streak and for the write that ends it, is decided in [saving.rs](../../../packages/desktop/src-tauri/src/saving.rs).
- **Close or quit.** Trace the close event through [waiting.rs](../../../packages/desktop/src-tauri/src/waiting.rs), its effects in `main.rs`, and `close_aggregate` in `server.rs`, which waits for every change the scheme is still answering (`InFlight::settled` in `scheme.rs`) before the run's last write, so no Edit answered 200 is lost (ST-122). The `closing-*` question window is built by [question.rs](../../../packages/desktop/src-tauri/src/question.rs) (its label, answers and folders) and drawn by [closing.html](../../../packages/desktop/ui/closing.html). A quit covers every open Aggregate.

Done when `cargo test --locked -j 2 -p infinity-cube-desktop -- waiting saving question server a_close_waits` and `cargo test --locked -j 2 -p host --test run` pass, and every outcome the change touches (the write finishing while the question shows, Keep waiting, Close without saving, several Aggregates on quit) has a case in the [waiting tests](../../../packages/desktop/src-tauri/src/waiting/tests.rs). A change to what a close waits for keeps `writes_an_edit_still_being_answered_however_long_it_takes` and `refuses_a_request_made_once_it_is_closing` in the [server tests](../../../packages/desktop/src-tauri/src/server/tests.rs) and `a_close_waits_for_a_change_being_answered_and_not_for_a_read` in the scheme tests passing.

## Permissions and requests

For an invoke command, a window capability or a scheme request.

- **Invoke commands.** A command lands in three places in one change: `generate_handler!` in `main.rs`, `AppManifest::commands` in [build.rs](../../../packages/desktop/src-tauri/build.rs), and a [capability](../../../packages/desktop/src-tauri/capabilities) granting it to the one window label that calls it. `home` holds `open_aggregate`, and `closing-*` holds `answer_closing` for its own question. Space windows hold no IPC permission: a Space window's need is met through the scheme.
- **Scheme requests.** Space windows reach the Space API and asset store through the `infinitycube` scheme. For a refusal, start at `admit` in [scheme.rs](../../../packages/desktop/src-tauri/src/scheme.rs) and [address.rs](../../../packages/desktop/src-tauri/src/address.rs): the requesting window, the Aggregate in the address and, for a change, the origin evidence of ST-121. That evidence falls back to `Referer` on WebKitGTK, so keep `Referrer-Policy: no-referrer` out of everything an Aggregate is served with, by header, meta tag or attribute.
- **Responses shared across hosts.** Add the case to `conformance/http/wire-cases.ts` and port it to [cases.rs](../../../crates/http-conformance/src/cases.rs) with its `// Case:` line; `test/unit/http-conformance-rust-ports.test.ts` holds the two together.

Done when `cargo test --locked -j 2 -p infinity-cube-desktop scheme` passes with a case for each window and request the change admits or refuses in the [scheme tests](../../../packages/desktop/src-tauri/src/scheme/tests.rs), and each capability names only the labels that call its command. A shared response case is done when `pnpm exec vitest run test/unit/http-conformance-rust-ports.test.ts`, `cargo test --locked -j 2 -p host --test wire` and the scheme tests above pass with it.

## Builds and updates

For a missing bundled asset, a platform build, the macOS DMG or an update.

- **Missing UI in a bundle.** In [tauri.conf.json](../../../packages/desktop/src-tauri/tauri.conf.json), `frontendDist` supplies the shell's own pages from `packages/desktop/ui`, and `bundle.resources` copies the browser application from `packages/app/dist` to `app/` in the bundle's resource directory, where `server.rs` opens it for the Rust host. A blank `home` or `closing-*` window points at `packages/desktop/ui`; a blank Space window, or a refusal naming the built application, points at `packages/app/dist`: a bare `tauri build` bundles whatever is there, while the package's `build` script runs `vite build` first. List the bundle's `Contents/Resources/app` (macOS) or the `.deb`'s files to see what shipped.
- **macOS DMG.** `pnpm release:build --desktop` from a clean checkout is the preview build's proof; it installs and opens the DMG only when building for this machine's target. ST-130 states what a preview build carries and what installed-update evidence exists.
- **Update offered on launch.** Trace the update bundle, signature and manifest through the [release workflow](../../../.github/workflows/release.yml) and the manifest copy in [desktop-updates.yml](../../../.github/workflows/desktop-updates.yml), then the user's choice in [update.rs](../../../packages/desktop/src-tauri/src/update.rs). The replacement takes effect at the next launch, so an open Aggregate finishes its last write.
- **Linux.** CI's `rust` job in [ci.yml](../../../.github/workflows/ci.yml) lists the WebKitGTK packages the shell needs; ST-121 and ST-122 record what has been observed on WebKitGTK.

Done when the build that changed has run on its target (`pnpm release:build --desktop` for the DMG or an update, `pnpm --filter @project/desktop tauri build --bundles deb` on Linux) and, for the DMG or an update, ST-130 matches what it now produces.
