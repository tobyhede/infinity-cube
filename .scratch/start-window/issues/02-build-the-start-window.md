# 02 — Build the Start window

**Status:** ready-for-human — built and seen in a live webview on Linux (WebKitGTK 2.52.6); macOS and Windows not run, and CI not yet run on a pull request.

**Blocked by:** 04 (the folder rules and Title), 05 (its page served from the app's build). 01 is done.

**What to build:** The Start window as ST-131 states it, to the design 01 accepts: a window the shell opens itself (`tauri.conf.json` still declares none), drawn by a React entry built from `@project/ui`, holding the only invoke commands it calls (create, open, browse, the recent list) in a capability naming its label alone. It shows at launch when nothing else opens and for File › New Space…, and closes when a Space window opens from it. New Space writes `<location>/<name>` through the host's `init_directory` with the Title, and refuses and defaults its name, by 04's functions. Its page is `packages/app/start.html` (entry `src/start-main.tsx`), built by `packages/app/desktop-shell-build.config.ts` into `packages/app/dist-desktop-shell`, which is the shell's `frontendDist` with the close question's files copied beside it, and the shell opens it as `WebviewUrl::App("start.html")` under the label `start`, whose capability (`capabilities/start.json`) names that label alone (ADR 0172; 05's spike, `src/start.rs`, replaces its throwaway page and its ping command and drops the `INFINITY_CUBE_START_WINDOW_SPIKE` gate). The launch decision in `launch.rs` moves from asking for a folder to showing the Start window, and the last-window rule (macOS runs on, Linux and Windows end) is decided there too.

- [x] A launch naming no folder, with no recent Space, shows the Start window and no folder chooser.
- [x] New Space with the defaults writes `~/Documents/Untitled Space`, which `pnpm cube check` accepts, its Meta Space titled "Untitled Space", and opens it; the Start window closes.
- [x] With `~/Documents/Untitled Space` already a Space, New Space's default name is `Untitled Space 2`, and accepting it writes and opens that.
- [x] New Space refuses beside the field, writing nothing, every case 04 decides.
- [x] A write that fails after Create Space (the name and Location accepted) announces the failure (UI-92) and returns to the form with the name and Location kept, so the person can try again or cancel; UI-111 states this outcome, and its Open question is closed.
- [ ] Closing the Start window with no Space window open ends the application on Linux and Windows and leaves it running with no window on macOS; while the Start window is open, closing the last Space window does not end it.
- [x] File › New Space… shows the form while Spaces are open; File › Open… still shows the platform's chooser.
- [x] Space windows still hold no IPC permission; the Start window's capability names only its label.
- [ ] `cargo test --locked -j 2 -p infinity-cube-desktop -- launch new_space` passes with a case for each launch outcome; ST-121 updated, and ST-131 split so its Start window and New Space parts are marked **built** with evidence while reopening and Recent stay **not built** until 03, seen in a live webview on Linux (WebKitGTK) and, if run, macOS.

## Components (from the design audit of the review stories)

The review stories are the layout reference, not the component reference. Build with:

- `StatusBusy` for "Opening…", not the stories' hand-made spinner and status (UI-92: one labelled status, announced once). If the folder line must be announced, give `StatusBusy` a slot for it.
- shadcn's `item` for Recent entries (`ItemGroup`, `Item` rendered as a button, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`), added to `@project/ui` through `shadcn-first-ui` step 3, instead of the stories' ghost `Button` with layout overrides. A gone or failed entry's reason goes in `ItemDescription`, with no arbitrary icon selectors.
- A folder glyph (lucide `FolderOpen`) added to `icons.tsx` for Open Folder….
- Headings on the chrome type scale, or a recorded heading token, not `text-lg`.
- Retry's accessible name contains its visible text ("Try again", WCAG 2.5.3), and the list's hint is wired with `aria-describedby` or dropped.
- The project `Button` has no icon gap or `data-icon`; decide whether to add one before spacing icons by hand.

## Comments

Built on branch `worktree-agent-a29109a892790c20b` (2026-11-24). The evidence for each box, in its order:

- **No folder named.** `launch` answers `Launch::Start` (`given_a_launch` in `launch.rs`); seen live under Xvfb with WebKitGTK: the Start window drew and no chooser opened. A named folder that does not open shows its refusal, then the Start window (`given_a_folder_that_did_not_open`; seen live).
- **New Space with the defaults.** `given_the_defaults` in `start/tests.rs` writes `Untitled Space` through `create_new_space` and reads it back through the intake, titled "Untitled Space". Live: Create wrote `<home>/Documents/Untitled Space` (the fallback Location, as Xvfb's home has no XDG Documents directory), `pnpm cube check` accepted it, its Space window opened and the Start window closed.
- **Untitled Space 2.** The same tests; live, File › New Space… from that Space window opened the form on "Untitled Space 2", and accepting it wrote and opened it.
- **Refusals.** `given_a_name_refused` (each Unix name 04 refuses, the Windows names as data, and a non-empty folder refused as the folder with nothing written) and `StartPage.test.tsx` (the reason beside Name, the draft kept, the folder line asking for a name). Live: `Q3/Q4` refused beside Name, nothing written.
- **A write that fails.** `given_a_write_that_fails` (a filesystem whose `create_new` fails) and `StartPage.test.tsx` ("announces a write that failed and returns to the form…"), plus the Ladle claim `start-window-keeps-the-form-when-the-write-fails`. Live: with Documents made immutable, Create announced "The Space could not be created" with "Operation not permitted" and returned to the form with the name and Location kept. UI-111 states this, and its Open question no longer asks it.
- **Last window, left unticked.** `given_the_last_window_closed` decides it for each platform (macOS runs on, the others quit). Seen live on Linux only: with the Start window open, closing both Space windows left the application running; closing the Start window then exited 0. macOS (running on with no window, Reopen showing the Start window) and Windows are not run.
- **File › New Space… and File › Open….** Live: Ctrl+N in a Space window opened a Start window on the form, and in the Start window it moved it to the form; File › Open… and Open Folder… opened the GTK chooser, and Cancel left things as they were. No folder was chosen through the chooser: with no window manager under Xvfb it could not be driven, so `choose_folder` to `open_from` is proven by its parts, not end to end.
- **Capabilities.** `given_the_capabilities`: the six `start_*` commands are the same in `build.rs` and `generate_handler!`; `start.json` names the label `start` alone with exactly their permissions; `closing.json` names `closing-*`; no capability names a `space-*` or `view-*` window.
- **cargo test, left unticked.** `cargo test --locked -j 2 -p infinity-cube-desktop` passes (nextest is not installed here, so `cargo test`, not `cargo nextest`). The filter the box names (`-- launch new_space`) passes, but most of the Start window's cases live under `start`, which the desktop skill's Done line now adds. ST-121 and ST-131 are updated (ST-131 marked built except for reopening and Recent, with evidence); macOS is not run, so the box stays open.

Decisions:

- **`item` written by hand.** The shadcn registry was unreachable through this machine's proxy (403), so `packages/ui/src/components/item.tsx` follows base-nova's `item` from memory. Its header says so and how to diff it against the registry. Its recorded extensions: the chrome type scale, a button item's cursor, left alignment and `hover:bg-secondary`, and an `xs` size.
- **Button icon gap.** No change to `Button`: New Space and Open Folder… space their icon with `gap-2` by hand. Adding `data-icon` would restyle every button in the application, which is a change for its own ticket.
- **Headings.** `text-chrome-sm` from the chrome type scale; no new heading token.
- **`StatusBusy`** is labelled "Opening <name>…" with the folder beside it, not inside the status, so the status is announced once. It shows for the moment between Create and the window opening, too short to observe live.
- **Recent.** The shell hands `recents: []` until 03, so the page shows its empty state. The entries, Try again (accessible name "Try again to open <Title>", WCAG 2.5.3) and the hint wired with `aria-describedby` are built and proven in `StartPage.test.tsx` and the `WithRecentSpaces` story. Remove is drawn only when the page is given a handler, which 03 adds.
- **A refusal is a value.** `start_create_space` resolves with the refusal (`{of, message}`) or `null` rather than rejecting, so the page never parses a rejection's reason.
- **The native window** is titled "InfinityCube", 720×520 at a 560×420 minimum; UI-111's Open question keeps the title, minimum size and touch sizes.
- **`sideEffects: ["*.css"]`** is declared in `ui`, `plugins`, every `plugin-*`, `resource-api` and `core`. `dist-desktop-shell` fell from 4.7 MB (about 60 assets) to 348,763 bytes (one 270 KB script and one 75 KB stylesheet), held by `desktop-shell-build.test.ts`. `pnpm build` passes, and `packages/app/dist` fell from 5,432,126 to 5,348,177 bytes with the same 60 asset names; its fixture Space drew live from the new build. The release binary's size was not measured. 05 and 06 can treat it as done.
- **Not run here:** `pnpm e2e:mount` (this machine has Node 24; the repository wants 26, and the mount build calls `Uint8Array.fromHex`). The Ladle specs ran with Playwright pointed at an installed Chromium of a newer revision than the one it pins.
