---
name: infinity-cube-getting-started
description: Set a person up to run InfinityCube on their own content from a clone of this repository — tools, install, a content directory in its own git repository, `pnpm cube init` and `pnpm cube run`. Use when someone wants to set up, try or run InfinityCube, or open a Space's directory in it; writing or changing the directory's files by hand is `infinity-cube-authoring`.
---

# Getting started with InfinityCube

InfinityCube runs from a clone of this repository. `pnpm cube init <dir>` creates an Aggregate directory, and `pnpm cube run <dir>` **runs** one: it reads `<dir>`, serves the application, and writes every edit back into `<dir>`. The person's work is that directory, kept in its own git repository; git is their undo and their history.

Work from the root of the InfinityCube clone. With no clone at hand, as when this skill is installed from the `infinity-cube` plugin, make one where the person agrees to: `git clone https://github.com/tobyhede/infinity-cube`. Each step ends on its completion criterion.

## Steps

1. **Tools.** Run `node --version` and `pnpm --version`. Node must be at least the version in `.node-version` (`package.json` `engines`), and pnpm must be 9 (`packageManager`). If either is missing or too old, tell the person what to install and wait for them; a Node version manager that reads `.node-version` is the usual route for Node, and `npm install -g pnpm@9` for pnpm, since Node no longer bundles corepack (`corepack enable` works only where corepack has been installed separately).
   Done when both commands print versions that meet those bounds.

2. **Install.** Run `pnpm install`.
   Done when it exits zero.

3. **Content directory.** Ask the person where their work lives, or should live. It is any path outside the InfinityCube clone, for example `~/spaces/rust-async`.
   - **New work:** run `pnpm cube init <dir>`. The directory must be missing or empty; dot-entries such as `.git` and `.DS_Store` do not count, so a fresh `git init` directory is empty. It writes a new aggregate, prints `Created a new aggregate; run it with: pnpm cube run <dir>` and exits zero without serving. A directory that is not empty is refused and nothing is written: ask the person whether they meant existing work there, or another path.
   - **Existing work:** the directory must hold `aggregate.json` at its top. A directory holding only `space.json` is one Space, not an Aggregate directory, and is refused. One holding `hyper.json` instead of `aggregate.json` is refused too: rename the file with `mv <dir>/hyper.json <dir>/aggregate.json`, which works whether or not the directory is a git repository yet; step 4 then commits the rename before the first run.

   Done when you know the absolute path and `<dir>/aggregate.json` exists.

4. **Git.** Make the directory a git repository if it is not in one: `git -C <dir> init`; it can also be done before `init`. Keep the run's lock file out of git: if `<dir>/.gitignore` does not list `.infinity-cube.lock`, add it (`echo .infinity-cube.lock >> <dir>/.gitignore`). Then commit what is there before the first run: `git -C <dir> add -A && git -C <dir> commit -m "Before InfinityCube"`. A repository with no commit has nothing to restore, and the first write rewrites existing files into InfinityCube's own form (every Resource becomes `resources/<id>.json`, with a Markdown Resource's text in `assets/<hash>.md`), so the commit is what makes git the undo for that first edit. If `git -C <dir> status --porcelain` already prints nothing, there is nothing to commit.
   Done when `git -C <dir> rev-parse --show-toplevel` succeeds and `git -C <dir> status --porcelain` prints nothing.

5. **Start.** For the person, in their terminal: `pnpm cube run <dir>`. It prints the address it serves (port 4173, or the next free port) and opens their browser. Add `--port <port>` to choose the port, which fails if that port is taken rather than moving on, and `--no-open` to leave the browser alone.
   If you start it yourself, use `pnpm cube run <dir> --no-open`, read the printed `Running <dir> at <url>` line for the address, and stop it with SIGINT to the process group you started, so its last write lands. A stop that wrote everything prints `Stopped; <dir> holds every edit.` and exits zero; one that prints `Stopped, but the last edits were not written:` and exits 1 has lost those edits, so tell the person what it printed rather than treating the directory as written. A missing or empty directory is refused with the `pnpm cube init` command that creates one, so go back to step 3. A directory another run already holds is refused, naming it: find and stop that run, or ask the person to. Any other refused directory exits non-zero and prints its problems; fix those (the `infinity-cube-authoring` skill covers the format) and start again.
   Done when the `Running … at <url>` line has printed and the URL answers.

6. **Explain how the run treats their files.** Read the README's [Running a Space](https://github.com/tobyhede/infinity-cube/blob/main/README.md#running-a-space) section, with its "Stopping and lost edits", which is the description of Running this step relies on (`README.md` in the clone is the same file). Tell the person each of its points in your own words: when edits are written, that git is the undo and to pull or edit files by hand with InfinityCube stopped, that a second run of the directory is refused while this one holds it, which files InfinityCube owns and that their own files are left alone, and that a stop is complete only when it prints `Stopped; <dir> holds every edit.` Then tell them to commit from the content directory: `git -C <dir> add -A && git -C <dir> commit`.

   Done when the person has the address and has been told each point of that section.

The file format is `docs/aggregate-directory.md`.

To show a Space on the web from its public GitHub repository, read-only and with no server, and to point a domain at it, follow `docs/deploy-cloudflare.md`.
