---
name: infinity-cube-desktop
description: This skill should be used when changing or debugging the Tauri desktop app in `packages/desktop` — opening, closing or quitting a Space window, or the Export of its Edits; File › Open…, File › New Space… or the offer to create a Space; a native menu, its accelerators or Help; the `infinitycube` scheme or an invoke command's capability; a failed-write notice; bundling, the macOS DMG, the Linux `.deb` or the updater. Triggers include "the desktop app won't open my folder", "my edit didn't save in the desktop app", "closing the window hangs", "add a Tauri command", "add a menu item", "the scheme refuses a request", "the DMG is missing the UI" and "the update isn't offered".
---

# InfinityCube desktop

Start by naming the window that makes the request and who owns the result. There is no home window (ADR 0167): a folder opens from the command line, File › Open… or the question asked at launch. A Space window (`space-*`) runs the shared browser application against the Rust host in the shell's own process. A window a Space's page opens (`view-*`: Notes, a Resource opened on its own) shares its Aggregate's origin. A close's question window (`closing-*`) belongs to the shell. The rules are ST-119, ST-121, ST-122, ST-124 and ST-130 in [Storage and hosts](../../../docs/requirements/storage.md), with UI-8 in [UI](../../../docs/requirements/ui.md) for accelerators, and a behaviour change updates the rule it changes in the same commit.

A defect visible on both desktop and web belongs to the shared application or host contract: reproduce it there before changing the shell. For the React application inside a Space window, use the `shadcn-first-ui` skill.

The shell's build script and its tests need the browser application built first: `pnpm --filter @project/app exec vite build`. To try a change on a folder, `cargo build -p infinity-cube-desktop`, then `target/debug/infinity-cube-desktop <folder>`.

Report evidence by tier: a build, a Rust test, or a live webview, naming engine and platform for a live webview. A change to what the webview sends or shows (a request header, a window, a dialog) is proven only in a live webview; without one, say which engine and platform have not been run, as ST-121 does.

## Window lifecycle

For opening a folder, exporting an Edit, closing a Space window or quitting.

- **Open.** What opens at launch, and what a cancelled or failed choice does next, is decided in [launch.rs](../../../packages/desktop/src-tauri/src/launch.rs); a missing or empty folder is offered a new Space, written by [new_space.rs](../../../packages/desktop/src-tauri/src/new_space.rs), and the words of a refusal are [not_opened.rs](../../../packages/desktop/src-tauri/src/not_opened.rs). Trace from the folder chooser through `open_aggregate_at` in [main.rs](../../../packages/desktop/src-tauri/src/main.rs), the [registry](../../../packages/desktop/src-tauri/src/aggregates.rs) of open and closing Aggregates, and [server.rs](../../../packages/desktop/src-tauri/src/server.rs), which opens the host run, resolves the first address and handles navigation. A directory already in use is refused by the registry within the shell and by the lock of ST-124 across processes.
- **Export.** An Edit reaches the Rust host through the scheme, and the host schedules Export and owns the write (ST-119). Reproduce a change to which bytes land on disk, or when, in the [host run tests](../../../crates/host/tests/run.rs). The dialog for a failed write, shown for the first failure of a streak and for the write that ends it, is decided in [saving.rs](../../../packages/desktop/src-tauri/src/saving.rs).
- **Close or quit.** Trace the close event through [waiting.rs](../../../packages/desktop/src-tauri/src/waiting.rs), its effects in `main.rs`, and `close_aggregate` in `server.rs`, which waits for every change the scheme is still answering (`InFlight::settled` in `scheme.rs`) before the run's last write, so no Edit answered 200 is lost (ST-122). The `closing-*` question window is built by [question.rs](../../../packages/desktop/src-tauri/src/question.rs) (its label, answers and folders) and drawn by [closing.html](../../../packages/desktop/ui/closing.html). A quit covers every open Aggregate.

Done when `cargo test --locked -j 2 -p infinity-cube-desktop -- launch new_space waiting saving question server a_close_waits` and `cargo test --locked -j 2 -p host --test run` pass, and every outcome the change touches (the write finishing while the question shows, Keep waiting, Close without saving, several Aggregates on quit) has a case in the [waiting tests](../../../packages/desktop/src-tauri/src/waiting/tests.rs). A change to what a close waits for keeps `writes_an_edit_still_being_answered_however_long_it_takes` and `refuses_a_request_made_once_it_is_closing` in the [server tests](../../../packages/desktop/src-tauri/src/server/tests.rs) and `a_close_waits_for_a_change_being_answered_and_not_for_a_read` in the scheme tests passing.

## Menus

For a menu, a menu item, an accelerator, Help or About.

- **Layout.** Which menus each platform gets, and what is in them, is data in [menu.rs](../../../packages/desktop/src-tauri/src/menu.rs): `layout` answers the menus for macOS or for Linux and Windows, and a `Command` is an item the shell answers itself, with its id, label, accelerator and, for Help and Report an Issue…, the address it opens. `app_menu` in `main.rs` draws the layout with Tauri's menu types, and `answer_menu` answers each `Command`. Add an item to `layout` and, if the shell answers it, a `Command` arm in both; never compare menu ids as strings in `main.rs`.
- **Platform conventions.** A native menu follows the platform, not the page's key rules (ADR 0167, UI-8): its accelerators are the platform's own, and a new one goes in UI-8 and ST-121. Prefer the platform's predefined item where it exists on that platform; muda documents each one's support, and most are unsupported on GTK, which is why Linux and Windows draw Close Window and full screen as `Command`s. Linux and Windows get no Edit menu, because a menu accelerator there takes the clipboard keys from the webview.
- **Quit and Close Window.** The shell's Quit asks the application to exit and Close Window closes the focused window as its own control does, so both reach the close wait of ST-122; the predefined Quit ends the process without asking, which loses a last write.
- **Opening an address.** Help opens fixed addresses in the system browser through the opener plugin, from the shell. No window navigates to a remote origin (ST-121), and no capability grants the opener to a page.

Done when `cargo test --locked -j 2 -p infinity-cube-desktop menu` passes with a case for what the layout change offers, hides or moves on each platform, and the change has been seen in a live webview. On Linux, `xvfb-run` with a window manager (`openbox`), `xdotool key F10` and `import -window root` show the menu bar; macOS's menus are proven only on a Mac.

## Permissions and requests

For an invoke command, a window capability or a scheme request.

- **Invoke commands.** A command lands in three places in one change: `generate_handler!` in `main.rs`, `AppManifest::commands` in [build.rs](../../../packages/desktop/src-tauri/build.rs), and a [capability](../../../packages/desktop/src-tauri/capabilities) granting it to the one window label that calls it. The only command is `answer_closing`, which `closing-*` holds for its own question. Space and `view-*` windows hold no IPC permission, including none of the dialog or opener plugins': a Space window's need is met through the scheme, and a menu item is answered by the shell, not the page.
- **Scheme requests.** Space windows reach the Space API and asset store through the `infinitycube` scheme. For a refusal, start at `admit` in [scheme.rs](../../../packages/desktop/src-tauri/src/scheme.rs) and [address.rs](../../../packages/desktop/src-tauri/src/address.rs): the requesting window, the Aggregate in the address and, for a change, the origin evidence of ST-121. That evidence falls back to `Referer` on WebKitGTK, so keep `Referrer-Policy: no-referrer` out of everything an Aggregate is served with, by header, meta tag or attribute.
- **Responses shared across hosts.** Add the case to `conformance/http/wire-cases.ts` and port it to [cases.rs](../../../crates/http-conformance/src/cases.rs) with its `// Case:` line; `test/unit/http-conformance-rust-ports.test.ts` holds the two together.

Done when `cargo test --locked -j 2 -p infinity-cube-desktop scheme` passes with a case for each window and request the change admits or refuses in the [scheme tests](../../../packages/desktop/src-tauri/src/scheme/tests.rs), and each capability names only the labels that call its command. A shared response case is done when `pnpm exec vitest run test/unit/http-conformance-rust-ports.test.ts`, `cargo test --locked -j 2 -p host --test wire` and the scheme tests above pass with it.

## Builds and updates

For a missing bundled asset, a platform build, the macOS DMG or an update.

- **Missing UI in a bundle.** In [tauri.conf.json](../../../packages/desktop/src-tauri/tauri.conf.json), `frontendDist` supplies the shell's own page, the close question, from `packages/desktop/ui`, and `bundle.resources` copies the browser application from `packages/app/dist` to `app/` in the bundle's resource directory, where `server.rs` opens it for the Rust host. A blank `closing-*` window points at `packages/desktop/ui`; a blank Space window, or a refusal naming the built application, points at `packages/app/dist`: a bare `tauri build` bundles whatever is there, while the package's `build` script runs `vite build` first. List the bundle's `Contents/Resources/app` (macOS) or the `.deb`'s files to see what shipped.
- **macOS DMG.** `pnpm release:build --desktop` from a clean checkout is the preview build's proof; it installs and opens the DMG only when building for this machine's target. ST-130 states what a preview build carries and what installed-update evidence exists.
- **Update offered on launch or from Check for Updates….** Trace the update bundle, signature and manifest through the [release workflow](../../../.github/workflows/release.yml) and the manifest copy in [desktop-updates.yml](../../../.github/workflows/desktop-updates.yml), then the user's choice in [update.rs](../../../packages/desktop/src-tauri/src/update.rs), whose `Checking` decides what a check that finds nothing says. The replacement takes effect at the next launch, so an open Aggregate finishes its last write.
- **Linux.** CI's `rust` job in [ci.yml](../../../.github/workflows/ci.yml) lists the WebKitGTK packages the shell needs; ST-121 and ST-122 record what has been observed on WebKitGTK.

Done when the build that changed has run on its target (`pnpm release:build --desktop` for the DMG or an update, `pnpm --filter @project/desktop tauri build --bundles deb` on Linux) and, for the DMG or an update, ST-130 matches what it now produces.
