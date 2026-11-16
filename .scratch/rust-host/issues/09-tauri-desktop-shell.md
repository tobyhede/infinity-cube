# 09 — The Tauri desktop shell

**Status:** ready-for-agent

**Blocked by:** 07.

**What to build:** A Tauri v2 application over `host`: an Open Folder dialog, one window per talk folder with its own run, the host served through a custom URI scheme (no port), a Content Security Policy adapted from `packages/app/mount-headers.ts`, minimal capabilities, and Export awaited before a window or the application closes. Test on a temp copy of `packages/app/fixture`.

- [ ] Closing a window after an edit leaves the directory with the edit.
- [ ] Opening a talk and closing without an edit leaves the directory unchanged (ST-65).
- [ ] A 10 MiB asset upload works through the custom scheme.
