# 03 — A second launch opens its folders in the running application

**Status:** needs-triage

**Blocked by:** 01.

**What to build:** today a second launch naming a folder starts a second, independent shell. With `tauri-plugin-single-instance`, its arguments and working directory reach the running shell, which resolves the folders against that directory and opens them as one more `open(origin, folders)` with a new `Origin`. Prior art and sources: `/mnt/project-files/research/opening-module-prior-art-2026-11-26.md` in the project's shared files (VS Code and Zed both do this).

Open questions for triage: does a second instance count as the command line for whether the Start window shows; does ADR 0162's directory lock already refuse the duplicate run, and what does the person see today; does this need an ADR, since it changes what a launch does (ST-131).

## Comments
