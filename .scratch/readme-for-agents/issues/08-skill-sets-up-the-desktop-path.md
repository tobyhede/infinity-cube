# 08: Teach the getting-started skill the desktop application path

**What to build:** An agent following `infinity-cube-getting-started` can set a person up to open their Space in the desktop application, which the README's Getting started now leads with, as well as with `pnpm cube run`. When the person passes on the README's "Running a Space" points, the agent tells them only what applies to the host they are using.

**Blocked by:** none. The README side landed in PR #514.

**Status:** ready-for-agent

**Why:** PR #514 rewrote the README's Getting started around the desktop application, built from source, with `pnpm cube run` as the alternative. The skill (`plugins/infinity-cube/skills/infinity-cube-getting-started/SKILL.md`) still starts only `pnpm cube run`. Its step 6 tells the agent to read the README's "Running a Space" and "Stopping and lost edits" and pass on each point. That section now also covers the desktop application, with each desktop-only clause marked inside its bullet. So a `cube run` user can be told desktop details, and a desktop user gets no build or open steps from the skill. This was raised in review on PR #514 and left out of it, because a skill change needs a plugin version bump.

- [ ] The skill offers the desktop application as a path: the tools (Rust through rustup, Tauri's system prerequisites), the browser build before `cargo build -p infinity-cube-desktop`, and opening `target/debug/infinity-cube-desktop <dir>`, each with a checkable done-signal. It takes these from the README's Getting started rather than restating them, as ticket 07 did for Running.
- [ ] The skill says which path to choose: desktop when the person wants a window and can build Rust, `pnpm cube run` when they want no Rust or the agent will start the run itself (`--no-open`).
- [ ] For the desktop path, the skill tells the person to close the window, not press Ctrl-C, close the terminal or send a signal, because the shell writes pending edits only on close (README Getting started, step 8).
- [ ] Step 6 passes on only the "Running a Space" points for the chosen host, and "Stopping and lost edits" only for `pnpm cube run`.
- [ ] The plugin version is bumped in all three manifests (`plugins/infinity-cube/plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`), per the Workflow doc's skills section. Links stay absolute, since the skill is installed outside this repository (`test/unit/agent-skill-commands.test.ts`).
