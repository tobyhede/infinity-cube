# 02 — Build the Start window

**Status:** ready-for-agent

**Blocked by:** 04 (the folder rules and Title), 05 (its page served from the app's build). 01 is done.

**What to build:** The Start window as ST-131 states it, to the design 01 accepts: a window the shell opens itself (`tauri.conf.json` still declares none), drawn by a React entry built from `@project/ui`, holding the only invoke commands it calls (create, open, browse, the recent list) in a capability naming its label alone. It shows at launch when nothing else opens and for File › New Space…, and closes when a Space window opens from it. New Space writes `<location>/<name>` through the host's `init_directory` with the Title, and refuses and defaults its name, by 04's functions. Its page is `packages/app/start.html` (entry `src/start-main.tsx`), built by `packages/app/desktop-shell-build.config.ts` into `packages/app/dist-desktop-shell`, which is the shell's `frontendDist` with the close question's files copied beside it, and the shell opens it as `WebviewUrl::App("start.html")` under the label `start`, whose capability (`capabilities/start.json`) names that label alone (ADR 0172; 05's spike, `src/start.rs`, replaces its throwaway page and its ping command and drops the `INFINITY_CUBE_START_WINDOW_SPIKE` gate). The launch decision in `launch.rs` moves from asking for a folder to showing the Start window, and the last-window rule (macOS runs on, Linux and Windows end) is decided there too.

- [ ] A launch naming no folder, with no recent Space, shows the Start window and no folder chooser.
- [ ] New Space with the defaults writes `~/Documents/Untitled Space`, which `pnpm cube check` accepts, its Meta Space titled "Untitled Space", and opens it; the Start window closes.
- [ ] With `~/Documents/Untitled Space` already a Space, New Space's default name is `Untitled Space 2`, and accepting it writes and opens that.
- [ ] New Space refuses beside the field, writing nothing, every case 04 decides.
- [ ] A write that fails after Create Space (the name and Location accepted) announces the failure (UI-92) and returns to the form with the name and Location kept, so the person can try again or cancel; UI-111 states this outcome, and its Open question is closed.
- [ ] Closing the Start window with no Space window open ends the application on Linux and Windows and leaves it running with no window on macOS; while the Start window is open, closing the last Space window does not end it.
- [ ] File › New Space… shows the form while Spaces are open; File › Open… still shows the platform's chooser.
- [ ] Space windows still hold no IPC permission; the Start window's capability names only its label.
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
