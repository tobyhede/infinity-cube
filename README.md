# InfinityCube

InfinityCube is for technical ideas that connect as a graph rather than a single line. You write **Resources** (Markdown, Image, Mermaid, Reference and Space Resources among them, the last holding a whole nested Space), place them on a **Map**, and connect them with **Graphs**: named, coloured sets of directed Edges between the same Resources. Every Graph is drawn at once, each in its own colour, at the positions you chose.

**Presenting** traverses one Graph on a full-window **Stage**: a 16:9 frame over the canvas, which stays untouched behind it, with the **Notes window** beside it if you want it. The [Navigation requirements](docs/requirements/navigation.md) hold every presenting key, the Notes window and the product links.

Your Space is a directory of plain files, an [Aggregate directory](docs/aggregate-directory.md), kept in its own git repository.

## Getting started

This takes you from a fresh clone to the desktop application open on a Space of your own, built from source: there is no download yet, and the first build takes a few minutes. It runs on Linux; it has not been tried on macOS, and Windows is not built yet.

1. **Install the tools.**
   - Node ≥ 26.8.1 and pnpm 9. Node no longer bundles corepack, so install pnpm with `npm install -g pnpm@9` if `pnpm --version` does not print `9.x`.
   - Rust through [rustup](https://rustup.rs). The repository pins its toolchain in `rust-toolchain.toml`, and rustup installs it on the first `cargo` command.
   - [Tauri's system prerequisites](https://v2.tauri.app/start/prerequisites/). On Debian or Ubuntu:

     ```sh
     sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
       librsvg2-dev libsoup-3.0-dev libssl-dev pkg-config build-essential file
     ```

     On macOS, the Xcode command line tools: `xcode-select --install`.

   Done when `node --version` prints `v26.8.1` or later, `pnpm --version` prints `9.x`, and `cargo --version` prints a version. The pinned toolchain downloads on the first `cargo` command inside the clone, in step 4.

2. **Install InfinityCube.**

   ```sh
   git clone https://github.com/tobyhede/infinity-cube.git
   cd infinity-cube
   pnpm install
   ```

   Done when `pnpm install` exits zero.

3. **Create a Space in its own repository.** The desktop application opens existing Spaces only, so create one first. The directory must be empty apart from dot-entries such as `.git`.

   ```sh
   git init ~/spaces/rust-async
   pnpm cube init ~/spaces/rust-async
   echo .infinity-cube.lock >> ~/spaces/rust-async/.gitignore
   git -C ~/spaces/rust-async add -A
   git -C ~/spaces/rust-async commit -m "New Space"
   ```

   Done when `init` prints `Created a new aggregate` and the commit succeeds. It also names the browser command; ignore that unless you are [running it in the browser](#or-run-it-in-the-browser). That commit is the revision git restores if the first write is not what you wanted.

4. **Build the desktop application.** Build the browser application first: the desktop build copies it in, and fails with ``resource path `../../app/dist` doesn't exist`` without it.

   ```sh
   pnpm --filter @project/app exec vite build
   cargo build -p infinity-cube-desktop
   ```

   Done when Cargo prints `Finished` and `target/debug/infinity-cube-desktop` exists. After pulling changes, run `pnpm install` and both commands again.

5. **Open the Space.** `target/debug/infinity-cube-desktop ~/spaces/rust-async`. Done when one window, named after the folder, shows the Space's Map with `Resource 1` on it. **File › Open…** (Ctrl+O, or Command-O on macOS) opens another Space's folder in a window of its own; started with no folder, the application asks for one.

6. **Edit.** Pick a Graph in the Command Dock, the toolbar floating over the canvas; every Graph stays drawn, and the one you pick is emphasised. Select a Resource to reveal its toolbar, and use Edit to write its Title and Markdown. Drag a Resource to move it. Drag from one of a Resource's four handles to another Resource to add an Edge to the Active Graph; hold Option (macOS) or Alt and drop on empty canvas to create a new Resource and connect it in one go. Done when the save indicator reads `Persisted`.

7. **Present.** Press **Present**: `→` follows an Edge, `←` goes back, `↑` / `↓` choose at a fork. Done when `Esc` returns you to the Map as you left it.

8. **Close the window.** Closing the Space window writes every pending edit. If a write is still running after ten seconds, it asks whether to keep waiting, which is always safe, or close without saving, which loses the edits not yet written. If a write fails, a dialog says why, and those edits are not on disk. Closing the last Space window ends the application. Don't press Ctrl-C, close the terminal or send a signal while a Space window is open: any of them ends the application at once, and edits not yet written are lost. Done when the window has closed with no dialog and the terminal has its prompt back.

9. **Commit.** `git -C ~/spaces/rust-async add -A && git -C ~/spaces/rust-async commit -m "First draft"`. Done when `git -C ~/spaces/rust-async status` is clean.

To build an installable bundle instead (a `.deb` on Linux), see [`packages/desktop/README.md`](packages/desktop/README.md).

### Or run it in the browser

`pnpm cube run ~/spaces/rust-async` serves the same Space in your browser and needs no Rust: install Node and pnpm (the first item of step 1), do steps 2 and 3, run it, then follow steps 6, 7 and 9. It prints the address it serves and opens your browser. Stop it with Ctrl-C, which writes every pending edit and ends with `Stopped; <dir> holds every edit.`, where `<dir>` is the directory's absolute path. Any other last line means some edits were not written: see [Stopping and lost edits](#stopping-and-lost-edits).

Run every `pnpm cube` verb from the InfinityCube clone, pointing at whichever directory you are working on. A relative path is relative to where you ran pnpm. `pnpm cube help` lists the verbs.

## On the canvas

- **Every place has a link.** The Space, a Map, a Resource, a Graph and each Active Resource reached while Presenting have durable URLs. The Command Dock and the presenting chrome offer **Copy link**, browser Back and Forward follow them, and a pasted link reopens the same place.
- **Markdown, Mermaid, Reference and Space Resources are Closed or Open.** A Closed Markdown Resource shows its Title; Open, it shows its text and may grow to fit. Editing its source is a separate action. An Image Resource is always its picture, and an Ur Resource has no Open.
- **A Resource's size is authored, never measured.** Its default and smallest size is 260×146, and its content adapts to it.
- **Edges between the same two Resources run in parallel lanes.** In each direction one Edge runs full length, the Active Graph's where it has one there, and the others stop shorter, so switching Graphs changes which Edge leads, never where the Resources sit.

The [Rendering](docs/requirements/rendering.md) and [Maps and Graphs](docs/requirements/maps-and-graphs.md) requirements hold the full rules for Edges, handles, sizes and Open.

## Running a Space

The desktop application and `pnpm cube run <dir>` both **run** a Space's directory: InfinityCube reads it into memory, serves it, and writes it back as you edit. While it runs, **the directory is your work**; nothing else is kept. The [Storage requirements' Running rules](docs/requirements/storage.md#running) hold every refusal and write rule behind this section.

- **Edits are written about a second after you stop editing**, so `git status` shows what you changed. InfinityCube writes only the files whose content changed.
- **Git is your undo and your history.** InfinityCube keeps no history of its own and does not watch the directory. Edit files by hand, `git pull` or check out an earlier version with InfinityCube stopped, since a running one's next write replaces what is on disk with what it holds.
- **One run per directory.** A run locks the directory, through the empty file `.infinity-cube.lock` it leaves there, so a second run of the same directory, from another copy of the desktop application or a terminal, is refused, naming it, until the first stops. The lock ends when the process does, however it ends. Keep the file out of git with a `.gitignore` entry.
- **InfinityCube writes only its own files: `aggregate.json`, each Space's `space.json` and Resource files, and `assets/`**, which holds the Resources' text (Markdown and Mermaid source) and uploaded image files. Anything else, such as `.git`, a README or `notes/`, and any `*.md` outside `assets/`, is left alone; [`docs/aggregate-directory.md`](docs/aggregate-directory.md) describes the format.
- **Starting.** Both serve an existing Aggregate directory only, as `cube init` writes it. A missing or empty directory is refused (`pnpm cube run` names the `pnpm cube init` command that creates one; the desktop application says why in a dialog), so a mistyped path never becomes a new Space. A directory that is not valid is refused with its problems listed; fix the files and start again. A run with no edits leaves the directory as it was, beside its empty lock file. Opening a Space never writes the directory.
- **Ports and the browser.** Under `pnpm cube run`, InfinityCube serves on port 4173, or the next free port. `--port <port>` picks the port and fails if it is taken. `--no-open` leaves the browser alone, for running headless or from an agent.

### Stopping and lost edits

This section is about `pnpm cube run`; the desktop application writes pending edits when its window closes ([Getting started](#getting-started), step 8). Stopping (Ctrl-C, closing the terminal, or SIGTERM) writes every pending edit and ends with `Stopped; <dir> holds every edit.` Treat the directory as complete only after that line.

- **A kill loses the last second.** `kill -9`, a power cut, or a second Ctrl-C exits at once, and edits not yet written are lost.
- **A failed write is retried.** While running, InfinityCube prints `Could not write the directory:` with the reason (a full disk, or a symbolic link it refuses to write through) and tries again a second later.
- **A failed final write exits 1.** `Stopped, but the last edits were not written:` names the reason, and those edits are lost.
- **A crash mid-write can leave some files new and some old.** Git restores them.

### Other ways to open a Space

- **`pnpm cube check <dir>`** reads a directory as a run would and reports, writing nothing. It is how you or an agent checks files written by hand.
- **`pnpm cube mcp <dir>`** serves a local MCP server whose tools edit and check the directory's files, for an agent with no shell: see [Editing over MCP](docs/aggregate-directory.md#editing-over-mcp).
- **The `infinity-cube` command**, a single Rust binary, runs and checks a directory as `pnpm cube` does, with no Node; [`release/README.md`](release/README.md) describes its preview builds.
- **Mounting** opens a Space on the web, straight from its public GitHub repository. You can edit it in the page, but nothing is written back to GitHub, and today a reload loses those edits. [Deploying to Cloudflare](docs/deploy-cloudflare.md) says how to deploy the page and point a domain at a Space.

## Installing a preview build

To run a Space without a clone, Node or pnpm, install the `infinity-cube` preview build on macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | sh
```

It checks the download and puts `infinity-cube` in `~/.local/bin`; then `infinity-cube init my-space` and `infinity-cube run my-space`. A preview build makes no compatibility promise, so keep your directory in git. [`release/README.md`](release/README.md) covers pinning a version, upgrading and uninstalling.

## Using InfinityCube with agents

Two of this repository's agent skills, in [`.agents/skills/`](.agents/skills/) and linked from `.claude/skills/`, are for using InfinityCube. They are also published as the `infinity-cube` plugin, from [`plugins/infinity-cube/`](plugins/infinity-cube/):

- **`infinity-cube-getting-started`**: sets a person up from a fresh clone: checks Node and pnpm, installs, chooses or creates the content directory as its own git repository, and starts a run.
- **`infinity-cube-authoring`**: writes or changes an Aggregate directory as files: Spaces, Resources, Maps, Graphs, Edges and Image Resources. It stops the run first, because InfinityCube's next write would replace edits made underneath it.

### Installing the skills elsewhere

A clone of this repository already has the skills. To use them from another directory, such as a Space's own repository, install the `infinity-cube` plugin from this repository's marketplace. It installs at user scope, so the skills reach every project, and an installed copy changes only when the plugin's version does.

Claude Code:

```sh
claude plugin marketplace add tobyhede/infinity-cube
claude plugin install infinity-cube@infinity-cube
```

Start a new session; the skills are `/infinity-cube:infinity-cube-authoring` and `/infinity-cube:infinity-cube-getting-started`. To update: `claude plugin marketplace update infinity-cube`, then `claude plugin update infinity-cube@infinity-cube`.

Codex:

```sh
codex plugin marketplace add tobyhede/infinity-cube --ref main
codex plugin add infinity-cube@infinity-cube
```

Start a new session and pick a skill with `/skills` or `$`. To update: `codex plugin marketplace upgrade infinity-cube`, then `codex plugin remove infinity-cube@infinity-cube` and `codex plugin add infinity-cube@infinity-cube`.

A chat application with no shell reaches neither command. For one that accepts an uploaded skill, zip the skill's directory under `plugins/infinity-cube/skills/`; `infinity-cube-authoring` links only by absolute URL so that it works there, and says that a directory it writes is unchecked until `pnpm cube check` runs.

## Developing InfinityCube

Read [`AGENTS.md`](AGENTS.md) before changing code. It is written for coding agents and is the authority on commands, package boundaries, conventions and what "done" means here; this section is the human summary. The `shadcn-first-ui` and `shadcn` skills are for developing InfinityCube's own UI. The requirements in [`docs/requirements/`](docs/requirements/) say what each area does and name the tests that hold it.

### Development servers

Local PostgreSQL also needs Docker Engine or Docker Desktop with Compose v2.

```sh
pnpm dev             # PostgreSQL-backed, http://localhost:5173 (database must be up); edits outlive a restart
pnpm dev:new         # one-resource memory Space, http://localhost:5174; edits survive a reload, not a restart
pnpm dev:fixture     # tracked fixture in memory, http://localhost:5175; edits survive a reload, not a restart
```

### Verify

```sh
pnpm verify         # the whole static bar and the unit and property tests, as package.json lists them
pnpm e2e            # Playwright flows, each test on its own isolated server
pnpm e2e:fixture    # only the scenarios backed by the tracked fixture
```

The Playwright commands need the Chromium browser once: `pnpm exec playwright install chromium`. CI runs more suites than these; [`AGENTS.md`](AGENTS.md#commands) lists them.

### Local PostgreSQL

Local PostgreSQL is opt-in; `pnpm verify` and `pnpm e2e` do not need it.

1. Copy the credential-free template: `cp .env.example .env`. In `.env`, choose a URL-safe password and use it in both blank values:

   ```dotenv
   POSTGRES_PASSWORD=<your-local-password>
   DATABASE_URL=postgresql://infinity_cube:<your-local-password>@127.0.0.1:55432/infinity_cube
   ```

2. Start PostgreSQL 17.5, run the real database test, and stop the container:

   ```sh
   pnpm postgres:up
   pnpm test:integration:postgres
   pnpm postgres:down
   ```

   Done when the integration test passes and `postgres:down` exits zero. The test emits the Prisma Next contract, applies pending migrations, and writes and reads a Space. For the schema steps alone: `pnpm contract:emit` and `pnpm db:migrate`.

`pnpm postgres:down` keeps the named data volume. `docker compose down --volumes` deletes local database state.

### Local SQLite

SQLite is an opt-in, file-backed development host beside PostgreSQL, not a replacement for it.

```sh
pnpm dev:sqlite                                                            # app at http://localhost:5177, file at .scratch/sqlite/infinity-cube.db
SQLITE_PATH=/absolute/path/infinity-cube.db pnpm test:integration:sqlite   # migrates that file, then tests against temp files of its own
```

- **`SQLITE_PATH` is an absolute path** to a file in a local directory you own (`pnpm dev:sqlite` has its own default); run `pnpm db:migrate:sqlite` on it before `cube import` or `cube export`.
- **One InfinityCube process per file.** Stop `pnpm dev:sqlite` before running `cube import --store sqlite` or `cube export --store sqlite` on the same file.
- **To back up**, stop the host and copy the file, or use `sqlite3 infinity-cube.db ".backup copy.db"`.

The [Storage requirements' SQLite host rules](docs/requirements/storage.md#the-sqlite-host) say what each refusal answers and what happens when two processes meet.

### Importing and Exporting a database

The `cube` CLI moves a complete [Aggregate directory](docs/aggregate-directory.md) in and out of a database, always the whole aggregate.

```sh
pnpm cube export ./my-aggregate                       # write the complete stored aggregate
pnpm cube import ./my-aggregate                       # initialize an empty repository from it
pnpm cube import ./my-aggregate --dangerous-replace   # replace the stored aggregate outright
```

Both verbs reach PostgreSQL unless `--store sqlite` names SQLite. A host initializes an empty database when it starts, so importing into a database a host has run needs `--dangerous-replace`. The [Storage requirements' Import rules](docs/requirements/storage.md#import) say when `import` refuses and what replacing does.

An exported directory is the only way to move an aggregate between the two databases:

```sh
pnpm cube export ./my-aggregate                                                              # from PostgreSQL
SQLITE_PATH=/absolute/path/infinity-cube.db pnpm cube import ./my-aggregate --store sqlite   # into an empty, migrated SQLite file
```

### Architecture

A pnpm workspace of `@project/*` packages and a Cargo workspace of Rust crates, with strict TypeScript and enforced package boundaries. Three rules hold throughout: domain logic stays out of React, React Flow stays in its adapter, and app wiring stays in `@project/app`. [`AGENTS.md`'s package layout](AGENTS.md#package-layout--boundaries) says what each package and crate owns and how the boundaries are enforced.

## Current limitations

- **Overlay legibility.** Every Graph is drawn at once, at the positions the Map authored. An Edge runs backward wherever its target sits left of its source, which two Graphs disagreeing about the order of Resources they share will force on one of them, and nothing routes an Edge around a Resource.
- **No Undo or Redo in the application** ([Editing](docs/requirements/editing.md) ED-74, ED-75, not built). Under `pnpm cube run`, git is the undo.
- **The production bundle is not tuned for size.**
