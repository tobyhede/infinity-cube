# 02 — Build the Start window

**Status:** needs-triage

**Blocked by:** 01.

**What to build:** The Start window as ST-131 states it, to the design 01 accepts: a window the shell opens itself (`tauri.conf.json` still declares none), drawn by a React entry built from `@project/ui`, holding the only invoke commands it calls (create, open, browse, the recent list) in a capability naming its label alone. It shows at launch when nothing else opens and for File › New Space…, and closes when a Space window opens from it. New Space writes `<location>/<name>` through the host's `init_directory`, which takes the Title to write; the CLI's `init` keeps writing "New space". The launch decision in `launch.rs` moves from asking for a folder to showing the Start window, and the last-window rule (macOS runs on, Linux and Windows end) is decided there too.

- [ ] A launch naming no folder, with no recent Space, shows the Start window and no folder chooser.
- [ ] New Space with the defaults writes `~/Documents/Untitled Space`, which `pnpm cube check` accepts, its Meta Space titled "Untitled Space", and opens it; the Start window closes.
- [ ] New Space refuses beside the field, writing nothing, a folder that is not empty and a name that is empty, `.`, `..`, holds `/` or `\`, or that the platform forbids (decided by a pure function with a case for each).
- [ ] Closing the Start window with no Space window open ends the application on Linux and Windows and leaves it running with no window on macOS; while the Start window is open, closing the last Space window does not end it.
- [ ] File › New Space… shows the form while Spaces are open; File › Open… still shows the platform's chooser.
- [ ] Space windows still hold no IPC permission; the Start window's capability names only its label.
- [ ] `cargo test --locked -j 2 -p infinity-cube-desktop -- launch new_space` passes with a case for each launch outcome; ST-131 and ST-121 updated to **built** with evidence, seen in a live webview on Linux (WebKitGTK) and, if run, macOS.

## Comments
