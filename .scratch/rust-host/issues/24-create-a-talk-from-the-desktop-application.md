# 24 — Create a talk from the desktop application

**Status:** needs-triage

**Blocked by:** 04.

**What to build:** A presenter has no pnpm, yet the desktop application refuses a missing or empty folder with text naming `pnpm cube init <dir>` (`describeRunRefusal`, `src/cli/run-refusal.ts`, which the sidecar announces). Add a New Talk action beside Open Folder: pick or create an empty folder, write a new aggregate there through Export as `init` does (Storage, "Nothing writes an Aggregate directory except Export"), then open it in its own window. Opening an empty or missing folder offers the same instead of the `pnpm` text; the CLI's refusal text does not change. A separate ticket rather than a box on 04 because it is a new action with its own write path, not a check of what 04 built.

- [ ] New Talk on an empty folder opens a talk that `pnpm cube check` accepts; closing it leaves the folder as `init` would have written it, plus any edit.
- [ ] Opening an empty or missing folder never shows `pnpm` text; a non-empty folder that is not an aggregate is still refused with the intake's errors.
- [ ] New Talk refuses a folder that is not empty, and writes nothing there.
