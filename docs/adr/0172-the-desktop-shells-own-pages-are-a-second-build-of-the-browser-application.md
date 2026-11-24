# The desktop shell's own pages are a second build of the browser application

Status: accepted
Date: 2026-11-24
Refines: 0155
Related: 0171

ADR 0171 makes the Start window product UI, built from `@project/ui`. The shell's own frontend, Tauri's `frontendDist`, was `packages/desktop/ui`: the close question (ST-122) in plain HTML, with no bundler, in a package that may import nothing of ours. The infinitycube scheme cannot serve the Start window either: it answers only an Aggregate's own windows (ST-121), and the Start window has no Aggregate.

## The decision

- **`frontendDist` is `packages/app/dist-desktop-shell`**, a second Vite build of `packages/app` (`desktop-shell-build.config.ts`, `pnpm --filter @project/app desktop-shell:build`). Its entry is `start.html`, drawn from `@project/ui` like the rest of the application. Each later window of the shell's own is another entry of that build.
- **The close question's files are copied into it byte for byte** from `packages/desktop/ui`, so `WebviewUrl::App("closing.html")` resolves as before. Ticket 06 rebuilds the question as an entry and retires the copy.
- **The build is apart from `dist`**, the browser application the shell carries as the resource the host serves to Space windows. `dist` holds no `start.html` and no `closing.html`, so no Space window can load a page that asks for an IPC permission. Space windows still hold none.
- **Every build of the shell builds both first.** Tauri's build script reads `frontendDist` and `bundle.resources`, so the `rust` CI job, the desktop package's `dev` and `build` scripts and `release/build.sh --desktop` run `vite build` and then `desktop-shell:build`. A bare `cargo build -p infinity-cube-desktop` or `tauri build` builds neither; it embeds whatever is there, or fails when nothing is.
- **A window of the shell's own is served by Tauri's app protocol and opened by label**, with a capability that names its label alone (the Start window's is `capabilities/start.json`).

## Why

- **One web build, a page per window, commands scoped per label** is Tauri's own shape for a multi-window application, and the Start window then uses the same components, theme and tests as the rest of the application.
- **A separate output keeps the trust boundary where it was**: the pages that may invoke commands are never among the files the host serves to a Space's page.

## Rejected

- **A second entry in `dist` itself, which becomes `frontendDist`.** One build, but the host would then serve `start.html` and `closing.html` to Space windows, which hold no permission, and the binary would embed the whole application a second time (5.4 MB uncompressed, beside the resource copy).
- **Serving the Start window through the infinitycube scheme** at an origin of its own. It would need the scheme to answer a window with no Aggregate, and a page served by the host to hold IPC permissions, both of which ST-121 rules out.
- **Building the Start window inside `packages/desktop`.** That package imports nothing of ours (`eslint.config.js`), and a second Tailwind and `@project/ui` setup there would drift from the application's.

## Consequences

- The shell's frontend is no longer checked in: a checkout must run both builds before `cargo build -p infinity-cube-desktop`, as it already ran `vite build` for the resource.
- What the shell's build costs in size is set by what its entries import; it is measured in `.scratch/start-window/issues/05-serve-the-start-windows-react-page.md`.
