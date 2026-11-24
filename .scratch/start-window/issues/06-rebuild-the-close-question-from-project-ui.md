# 06 — Rebuild the close question from `@project/ui`

**Status:** needs-triage

**Blocked by:** 05 (the shell's pages built by `packages/app`).

**What to build:** The close question (ST-122) is the last window of the shell's own drawn in plain HTML: `packages/desktop/ui/closing.html`, `.css` and `.js`, which 05's build (`packages/app/desktop-shell-build.config.ts`) copies byte for byte beside `start.html`. Rebuild it as a third entry of that build, `closing.html`, drawn from `@project/ui` as the Start window is, and retire `packages/desktop/ui`.

What it keeps, as ST-122 states it: the heading, the one folder or the several named from the address's fragment (`question.rs` › `fragment`, each folder percent-encoded, separated by commas) and named anew when the fragment changes, without reloading; "Keep waiting" with the caret, and "Close without saving"; Escape answering Keep waiting; `answer_closing` with `keep-waiting` or `close-without-saving`, the only command its window may invoke (`capabilities/closing.json`, unchanged); the label `closing-<n>` and the window's size, set in `question.rs`.

- [ ] `closing.html` is built from `packages/app` with `@project/ui` components (shadcn-first-ui: an `AlertDialog`-shaped composition or the closest catalogued one, with any deviation recorded), and the copy step and `packages/desktop/ui` are gone, with `packages/desktop/tsconfig.json`, the `eslint.config.js` block for `packages/desktop/ui/**/*.js` and the vocabulary test's reference to `packages/desktop/ui/closing.html` updated.
- [ ] Its fragment reading and its answers are tested in `packages/app/test` without a shell, against a stand-in for the global Tauri.
- [ ] Under Xvfb with WebKitGTK the question shows ten seconds after closing an Aggregate whose write is held up, renames its folders as writes end, and each answer and Escape works, as issue 13's Evidence saw the plain page do.
- [ ] Before building it, decide the shell build's size (05's Comments): importing `@project/ui`'s index pulls every plugin's lazy chunks into the shell's build unless the packages declare `sideEffects`.

## Comments
