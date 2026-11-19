# README.md audit: structure and wording

Lens: the `writing-for-agents` skill (information hierarchy, progressive disclosure, co-location, sprawl, completion criteria, context pointers, leading words, negation, no-ops). Out of scope: factual accuracy and duplication across documents. Line numbers are those of `/home/claude/hyper/README.md` (253 lines) as read on 2026-11-19.

## 1. Overall verdict

The README has three branches:

- **A. Run your own talk**: lines 1-57.
- **B. Install the skills elsewhere**: lines 59-90.
- **C. Develop InfinityCube**: lines 92-252.

Only branch A is short enough to read at once. Branch C takes 64% of the file (160 of 253 lines), and much of it is reference that a contributor reaches only on some paths: the SQLite contention model, the semantics of the Import flag, the Architecture rationale, the test inventory and the bundle sizes. That is **sprawl**. Branch A is also polluted: product behaviour (durable URLs at 109, Edge anchors at 111, the size rule at 250, Notes at 251) is filed under C, so a reader on branch A never meets it, and a contributor wades through it to reach commands.

The top (lines 1-58) is **legible but over-dense in two places**. Line 5 packs a definition, a rendering detail, the key bindings and two identical citations into one paragraph, and step 27 repeats the keys. Bullet 46 of "How Running works" carries the most important completion criterion in the file (`Stopped; <dir> holds every edit.`) in its last clause, after five sentences about failure modes. Bullets 47-49 are file-format reference that belongs behind the pointer at line 57.

Biggest structural moves, in order of payoff:

1. Move the stop criterion into Quick start step 3. Give every Quick start step a checkable end state.
2. Move product behaviour out of "Development servers" (107, 109, 111) and "Current limitations" (250, 251) into a short "Using the app" or "Concepts" section in branch A, or point to the requirements.
3. Collapse the SQLite (161-176) and Import/Export (178-201) subsections to steps plus one pointer each. Their rules already have homes in `docs/requirements/storage.md` and `AGENTS.md`.
4. Disclose Architecture rationale (223-235), Tests (237-244) and maintainer detail (70) behind pointers to `AGENTS.md` and the requirements.
5. Rewrite the bare citations "([X requirements](...))" as pointers that say what the target holds. Cite each target once per paragraph.

## 2. Section-by-section grades

Grades: **A** good; **B** minor fixes; **C** needs restructuring; **D** wrong tier or wrong section. "n/a" means the lever does not apply.

| Section (lines) | Hierarchy / sprawl | Steps & criteria | Co-location | Pointers | Wording (leading words, negation, no-ops) |
| --- | --- | --- | --- | --- | --- |
| Intro (1-7) | B | n/a | C (keys duplicated at 27) | C (Navigation cited twice in line 5) | B |
| Quick start (9-37) | B | C | B | n/a | B |
| How Running works (39-57) | C (47-49 are format reference) | C (stop criterion buried at 46) | C (persistence again at 107; undo again at 248) | B (57 is a good pointer; 41 is bare) | C (46 dense; negations at 43, 45) |
| Using with agents (59-66) | B (66 serves branch C) | n/a | B | A | A |
| Installing skills elsewhere (68-90) | C (70's maintainer detail serves C) | B (no "skills are listed" check) | B | B | B |
| Developing (92-94) | A | n/a | A | A (94 is a model pointer) | A |
| Development servers (96-111) | D (109, 111 are product behaviour) | B | D (107 duplicates 41-50; 111 duplicates 223) | C (bare citations) | B |
| Verify (113-121) | B | B (no "green" criterion) | B (121 restates 117-118) | n/a | B |
| Local PostgreSQL (123-159) | B (156-159 deploy note off-branch) | B (no pass criterion) | A | n/a | B (wrapped text at 147-159 differs from the rest of the file) |
| Local SQLite (161-176) | D (170-176 are reference) | C | C | C (no pointer at all) | D (170, 172, 174 dense; 172 repeats itself) |
| Import/Export (178-201) | C (188-194 are semantics) | B | B | C (Storage cited 4 times, twice in 194) | C (internal design language at 188; 190 dense) |
| Architecture (203-235) | C (223-233 are design rationale) | n/a | C (anchors again, from 111) | C (bare citations) | B |
| Tests (237-244) | C (a sediment-prone inventory) | n/a | n/a | n/a | B |
| Current limitations (246-252) | C (mixed content) | n/a | D (250, 251 are not limitations; 248 belongs with 45) | B | C (252 carries lineage: "Remeasured after elkjs left") |

## 3. Findings by lever

### Lever 1: Information hierarchy and sprawl

- **H1. Branch C is the bulk of the file (92-252).** Its in-file tier should be: point to `AGENTS.md`, list the three dev servers, the verify commands, and short step lists for PostgreSQL and SQLite. Everything else is disclosed reference: the SQLite rules (170-176), the semantics of the Import flag (188-194), the Architecture rationale (221-235), the test inventory (237-244) and the bundle size (252). `AGENTS.md` and `docs/requirements/storage.md` already own that material. Line 94 already says the section is "the human summary". Hold the section to that, and it shrinks by about 100 lines.
- **H2. Product behaviour is filed under branch C.** Lines 109 (durable URLs, Copy link), 111 (Edge anchors), 233 (Closed vs Open Markdown, Reference Resources), 250 (authored size) and 251 (Presentation Notes) describe what a person sees while authoring a talk. Branch A's reader never reaches them. Either add a compact "Using the app" section after Quick start, or drop them and point to `docs/requirements/`.
- **H3. Lines 47-49 are file-format reference inside branch A.** Which files InfinityCube writes, where Markdown text lives and how pictures are named: an author editing in the app needs only "your notes can sit anywhere outside `assets/`". The rest belongs behind line 57, which already points to `docs/aggregate-directory.md`.
- **H4. Line 66 ("The other two, `shadcn-first-ui` and `shadcn`, are for developing InfinityCube's own UI") serves branch C** inside branch B. Drop it (`AGENTS.md` names those skills), or move it under Developing.
- **H5. Line 70's version-bump rule serves maintainers, not installers.** "a change reaches installed copies only when the version in all three of ... is bumped (`test/unit/skills-marketplace.test.ts` holds them equal)" is a contributor rule. An installer needs only "installed copies update when the plugin version changes; run the update commands below".
- **H6. Line 156-157 ("deployed environments should inject `DATABASE_URL` through their secret manager")** is off-branch for a section titled "Local PostgreSQL". Drop it, or point to `docs/deploy-cloudflare.md`.
- **H7. The top is legible apart from line 5's density and bullet 46.** See rewrites R1 and R3.

### Lever 2: Steps and completion criteria

| Step (line) | Current criterion | Problem | Proposed criterion |
| --- | --- | --- | --- |
| Install pnpm (11) | none | You cannot tell whether pnpm 9 is present | "`pnpm --version` prints `9.x`" |
| Clone/install/init/run block (13-22) | prose at 24 explains afterwards | The criteria trail the commands: "prints the command that runs it", "prints the address" | Split into numbered steps, each ending on its printed output (R2) |
| Step 1 Edit (26) | none | Five actions in one step, none observable | "The persistence indicator shows `Persisted`" (that wording sits at line 107 today); `git status` in the directory shows changed files |
| Step 2 Present (27) | none | The keys are given but no end state | "`Esc` returns you to the Map, unchanged" |
| Step 3 Ctrl-C (28) | "writes anything not yet on disk and exits" | Vague. The real criterion, `Stopped; <dir> holds every edit.`, is buried at the end of line 46 | "Wait for `Stopped; ~/talks/rust-async holds every edit.` If it prints `Stopped, but the last edits were not written:` instead, see [When a write fails]." |
| Step 4 Commit (29-35) | none | | "`git status` reports a clean working tree" |
| PostgreSQL `.env` (126-137) | none | | "Both values hold the same password" (already implied; state it as the check) |
| PostgreSQL up/test/down (139-145) | none | No pass signal, and `down` is easy to skip | "`test:integration:postgres` passes; `pnpm postgres:down` stops the container (the volume is kept)" |
| SQLite (165-168) | none | The steps are mixed into the commands, with no order or end state | "Set `SQLITE_PATH` to an absolute path → `pnpm db:migrate:sqlite` succeeds → `pnpm dev:sqlite` serves at 5177" |
| Verify (115-119) | none | | "Each exits 0" (low value, since the commands self-report; optional) |
| Import across databases (198-201) | none | | "`cube export` prints the aggregate it wrote; `cube import` reports an initialized repository" (wording to be confirmed by the accuracy reviewer) |

**Demand.** Line 46's "check for that line before treating the directory as complete" is the strongest criterion in the file: checkable and exhaustive. It is attached to the wrong branch. Promote it to step 3 and to the Running section's lead.

### Lever 3: Co-location

| Concept | Scattered across | Move to |
| --- | --- | --- |
| Presenting keys | 5, 27 | One place: Quick start step 2. Line 5 keeps only the definition (R1) |
| Persistence / where an edit lands | 41-50, 107 | Running owns `cube run`. Line 107's dev-server sentence stays under Development servers as one line, and its `cube run` clause is cut |
| Undo | 45 ("Git is your undo"), 248 ("No undo inside the application") | Merge into bullet 45 and drop 248 |
| Edge anchors | 111, 223 | One sentence under "Using the app" or Architecture, not both. Better: point to Rendering |
| Starting and refusals | 24 (`init` needs an empty dir), 50 (refusal of a missing or empty dir) | Combine: the init criterion in Quick start, the refusals in Running's "Starting" bullet; delete the restatement in 24 |
| Ports and address | 24 ("`http://localhost:4173/` unless that port is taken"), 51 | Keep 51; 24 says only "prints the address it serves" |
| Resource size | 250 (under limitations) | Not a limitation; move to "Using the app" or the requirements |
| Presentation Notes | 251 (under limitations) | A feature: put it beside presenting (R1) |
| SQLite relative-path refusal | 172, three times in one paragraph | Once |
| Writing a directory "in place" | 47, 194 | 194 points to Running/Storage; the in-place rule is defined once |

### Lever 4: Context pointers

Pattern: "([X requirements](docs/requirements/x.md))" appears 15 times as a bare parenthetical citation. It states neither what the target holds nor when to reach it. For a human it reads as a footnote. For an agent it is a weak trigger.

- **P1. Line 5 cites Navigation twice in one paragraph.** Keep one, worded as a pointer: "...the full presenting rules, including Notes and the presenting chrome, are in the [Navigation requirements]".
- **P2. Line 194 cites Storage twice in two sentences; lines 188, 192 and 194 cite it four times in 7 lines.** Replace with one closing pointer: "The rules for Import, Export and the replace flag are in [Storage requirements](...)".
- **P3. Lines 225 and 231 cite Maps and Graphs twice; line 233 cites Space and Resources twice, with Maps and Graphs between them.** Same fix: one trailing pointer per paragraph, or one pointer table at the top of Architecture.
- **P4. Good models already in the file:** line 57 ("The file format, including what InfinityCube keeps and removes when it writes, is described in ...") and line 94 ("Read AGENTS.md before changing code. It ... is the authority on commands, package boundaries, conventions and what 'done' means"). Both state what the target is and when to reach it. Rewrite the others to match.
- **P5. Missing pointers:** the SQLite section (161-176) has none, though its rules live in Storage. "Current limitations: Overlay legibility" (249) has none, though Rendering covers it.
- **P6. Line 41's "([Storage requirements](...))" right after the bolded word "runs"** works as a definition pointer, so reword it to say so: "**runs** an Aggregate directory (defined in [Storage requirements](...), Running)".

Suggested pointer wording (front-load the leading word, one trigger per branch):

> Presenting, the Stage, Notes and product URLs: [Navigation requirements](docs/requirements/navigation.md).

### Lever 5: Leading words, negation and no-ops

**Negation that should be a positive target:**

- 43: "InfinityCube does not need it to be inside the InfinityCube clone, and nothing of yours belongs there." → "Keep your content in its own git repository, anywhere outside the InfinityCube clone."
- 45: "keeps no history of its own and does not lock the directory or watch it for changes." → state the positive model: "InfinityCube holds the directory in memory and writes it back; the last write wins." (The accuracy reviewer should also check "does not lock" against AGENTS.md's run lock, ADR 0162. Flagged here only.)
- 163: "an opt-in development host beside PostgreSQL, not a replacement for it" → "an opt-in development host; PostgreSQL stays the default."
- 172: "A network filesystem, a file shared between hosts and a hosted SQLite service are not supported deployments." → "Keep the file on a local disk, opened by one host."
- 176: "Do not copy the file while a writer has it open" already follows a positive instruction; the trailing prohibition can go.
- 188: "There is no merge mode." → drop; "replaced outright" already says it.
- 192: "Initializing a database is not a command" → "A host initializes an empty database when it starts."
- 235: "The browser never touches files." This one is a guardrail and reads well as a heading-like lead; keep.

**No-ops and internal language:**

- 37: "Run `pnpm cube run` from the InfinityCube clone every time, pointing at whichever directory you are working on." Half no-op, since Quick start already shows it. The second sentence (relative paths) is the live part.
- 121: "Both Playwright commands create and dispose an isolated server per test automatically." This restates the comments at 117-118. Keep only the Chromium install line.
- 188: "Two doors and no mode parameter on either." This is the design vocabulary of `AGENTS.md`/the persistence package. To an operator it says nothing actionable. Delete.
- 190: "permission to destroy rather than a demand that something be destroyed ... rather than advising the flag the operator has just passed." The last clause explains why an error message is worded as it is. That is rationale for maintainers. The operator needs only: "On an empty repository the flag does nothing extra. If another process initializes the repository first, the command writes nothing and asks you to run it again."
- 221: "Design rules kept throughout: ..." restates the hard rules in `AGENTS.md`. As a human summary it is a fine single line. Keep it, or replace it with a pointer.
- 252: "Remeasured after elkjs left" is lineage. The repository's own rule (CLAUDE.md, "carry no lineage") applies. Drop the clause.

**Restated triads that a leading word collapses:**

- 44 and 46: "Ctrl-C, closing the terminal (SIGHUP) and SIGTERM all stop it the same way" plus "killed outright (`kill -9`, a power cut) ... or a second Ctrl-C". Name two leading words, **stop** (graceful: flushes) and **kill** (abrupt: loses the unwritten second). Use them throughout: "A stop writes everything; a kill loses the last second of edits."
- 41, 44, 47, 194: "writes the directory", "writes it back", "writes ... in place". The leading word is **write-back**. Define it once in Running ("in place, only changed files") and reuse it at 194 ("Export does the same write-back").
- 180, 188: "the whole aggregate, every Space rooted at the Meta Space, never one Space chosen from among them". The leading word **whole aggregate** is already present; cut the restatement after it.

**Prose density that buries the instruction:**

- **46** (139 words): the instruction is the last clause. Invert it (R3).
- **170** (88 words): the instruction is "set `SQLITE_PATH` before the suite". The rest is why the suite ignores the value. Disclose it.
- **172** (178 words): the instruction is "use an absolute path in a writable local directory". The rest is three restatements of the relative-path refusal and the reason for it. Disclose it.
- **174** (172 words): the instruction is "run one process per file". The rest is the contention model, which `test/integration/sqlite-contention.test.ts` and Storage own. Disclose it.
- **190** (80 words): see above.

## 4. Top 5 rewrites (replacement text)

### R1. Intro, lines 3-7

The keys move to Quick start step 2, there is one Navigation pointer, and Notes moves here from line 251.

```markdown
InfinityCube is for technical talks and designs whose ideas connect as a graph rather than a single line. You write **Resources** (Markdown, pictures, or whole nested Spaces), place them on a **Map**, and connect them with **Graphs**: named, coloured, directed paths through the same Resources. Every Graph is drawn at once, each in its own colour, at the positions you chose.

**Presenting** traverses one Graph on a full-window **Stage**: a 16:9 frame over the canvas, which stays untouched behind it. Presentation Notes follow along in a second window. The presenting rules, keys and Notes are in the [Navigation requirements](docs/requirements/navigation.md).

Your talk is a directory of plain files, an [Aggregate directory](docs/aggregate-directory.md), kept in its own git repository.
```

### R2. Quick start, lines 11-37: steps with criteria

```markdown
## Quick start

You need Node ≥ 26.8.1 and pnpm 9 (`npm install -g pnpm@9`; `pnpm --version` prints `9.x`).

1. **Install InfinityCube.**
   ```sh
   git clone https://github.com/tobyhede/infinity-cube.git
   cd infinity-cube
   pnpm install
   ```
2. **Create a talk in its own repository.** The directory must be empty apart from dot-entries such as `.git`.
   ```sh
   git init ~/talks/rust-async
   pnpm cube init ~/talks/rust-async
   git -C ~/talks/rust-async add -A && git -C ~/talks/rust-async commit -m "New talk"
   ```
   Done when `init` prints the command that runs the talk and the commit succeeds. This gives git a revision to restore.
3. **Run it.** `pnpm cube run ~/talks/rust-async`. Done when it prints the address it serves and your browser opens it.
4. **Edit.** Pick a Graph in the Command Dock. Select a Resource and use Edit to write its Title and Markdown. Drag it to move it. Drag from one of its handles to another Resource to add an Edge; hold Option/Alt and drop on empty canvas to create and connect a new Resource. Done when the persistence indicator reads `Persisted`.
5. **Present.** Press **Present**: `→` follows an Edge, `←` goes back, `↑`/`↓` choose at a fork. `Esc` returns you to the Map, unchanged.
6. **Stop.** Press Ctrl-C. Done when the terminal prints `Stopped; ~/talks/rust-async holds every edit.` Any other last line means some edits were not written; see [Stopping and lost edits](#stopping-and-lost-edits).
7. **Commit.** `git -C ~/talks/rust-async add -A && git -C ~/talks/rust-async commit -m "First draft"`. Done when `git status` is clean.

Run every `pnpm cube` verb from the InfinityCube clone. A relative path is relative to where you ran pnpm.
```

### R3. How Running works, bullet 46 (and 44), inverted around the criterion

```markdown
### Stopping and lost edits

A **stop** (Ctrl-C, closing the terminal, SIGTERM) writes every pending edit and ends with `Stopped; <dir> holds every edit.` Treat the directory as complete only after that line.

- **A kill loses the last second.** `kill -9`, a power cut, or a second Ctrl-C exits at once, and edits made in the quiet second before it are lost.
- **A failed write is retried.** While running, InfinityCube prints `Could not write the directory:` with the reason (a full disk, a symbolic link it refuses to write through) and tries again a second later.
- **A failed final write exits 1.** `Stopped, but the last edits were not written:` names the reason; those edits are lost.
```

Bullets 47-49 shrink to one line and the pointer:

```markdown
- **InfinityCube owns `aggregate.json`, `space.json`, `resources/` and `assets/`**, and writes only files whose content changed. Your own files, notes and `.git` can sit anywhere else in the directory. The full format is in [`docs/aggregate-directory.md`](docs/aggregate-directory.md).
```

### R4. Development servers, lines 96-111: remove the product behaviour

```markdown
### Development servers

Requirements: Node ≥ 26.8.1, pnpm 9; Docker Engine or Desktop with Compose v2 for local PostgreSQL.

```sh
pnpm install
pnpm dev             # PostgreSQL-backed, http://localhost:5173 (database must be up); edits outlive a restart
pnpm dev:new         # one-resource memory Space, http://localhost:5174; edits survive reloads, not a restart
pnpm dev:fixture     # tracked fixture in memory, http://localhost:5175; same lifetime as dev:new
```
```

Lines 109 (product URLs) and 111 (Edge anchors) move to a "Using the app" section in branch A, or are deleted in favour of the Navigation and Rendering pointers. Line 107's sentence on the indicator moves into Quick start step 4 as its criterion.

### R5. Local SQLite, lines 161-176: steps plus a rules pointer

```markdown
### Local SQLite

SQLite is an opt-in, file-backed development host; PostgreSQL stays the default.

1. Set `SQLITE_PATH` to an absolute path in a local directory you own (the host, CLI and suite refuse a relative, blank or unwritable one).
2. `pnpm dev:sqlite` migrates the file and serves http://localhost:5177 (default file `.scratch/sqlite/infinity-cube.db`).
3. `SQLITE_PATH=/absolute/path/infinity-cube.db pnpm test:integration:sqlite` runs the suite. It migrates that file, then tests against temp files of its own.

Run one InfinityCube process per file: stop `pnpm dev:sqlite` before a `cube import`/`export --store sqlite` on the same file. To back up, stop the host and copy the file, or use `sqlite3 infinity-cube.db ".backup copy.db"`. Contention, journal mode and refusal details are in [Storage requirements](docs/requirements/storage.md).
```

This replaces 16 lines of about 650 words with roughly 9 lines of about 150 words.

### Smaller rewrites

- **Import/Export, 188-192:**

  ```markdown
  Both verbs reach PostgreSQL unless `--store sqlite` names SQLite. `import` initializes an empty repository and leaves an initialized one untouched, saying so. `--dangerous-replace` replaces whatever is stored, atomically. On an empty repository it simply initializes. A host initializes an empty database when it starts, so importing into a database a host has run needs `--dangerous-replace`. The rules for both verbs are in [Storage requirements](docs/requirements/storage.md).
  ```

- **Installing skills, line 70:**

  ```markdown
  A clone already has the skills. To use them from another directory, such as a talk's own repository, install the `infinity-cube` plugin from this repository's marketplace. It installs at user scope, so the skills reach every project. Installed copies update only when the plugin's version changes; use the update commands below.
  ```

  The three-manifest rule moves to `AGENTS.md`'s Tracked skills, which already states it.

- **Current limitations, 246-252:** keep only real limitations: overlay legibility (249, trimmed) and bundle size (252, without "Remeasured after elkjs left"). Move 248 into the undo bullet (45), and move 250 and 251 out (R1, H2).

## 5. Target outline

| # | Section | Audience | Content | Est. lines |
| --- | --- | --- | --- | --- |
| 1 | InfinityCube (intro) | all | R1: what it is, presenting in one paragraph, Aggregate directory | 7 |
| 2 | Quick start | A | R2: seven numbered steps, each with a criterion | 30 |
| 3 | Running a talk | A | Write-back model, git as undo (merging 45 and 248), Starting/refusals, ports and `--no-open`, R3 stopping and lost edits, the format line and pointer | 28 |
| 4 | Using the app (optional) | A | Product URLs and Copy link (109), Edges and handles (111), Open/Closed Resources and Reference Resources (233), authored size (250). Two lines each, with one pointer row to the requirements | 10 |
| 5 | Agent skills | A/B | Two skills (63-64); install for Claude Code and Codex; uploaded-zip note. Lines 66 and 70's maintainer detail removed | 24 |
| 6 | Developing InfinityCube | C | Pointer to `AGENTS.md` (94) as the lead | 3 |
| 6.1 | Development servers | C | R4 | 10 |
| 6.2 | Verify | C | Three commands and the Chromium install | 8 |
| 6.3 | Local PostgreSQL | C | `.env`, up/test/down with criteria, schema-only commands, the volume note | 22 |
| 6.4 | Local SQLite | C | R5 | 10 |
| 6.5 | Importing and Exporting | C | Three commands, a four-sentence semantics paragraph, the cross-database example, one pointer | 16 |
| 6.6 | Architecture | C | Package table (or a pointer to AGENTS.md's layout), "The browser never touches files" line, one pointer row to the requirements for Graphs, Maps, layout and Resources | 20 |
| 7 | Current limitations | all | Overlay legibility, bundle size | 5 |
| | **Total** | | | **~190** (from 253); **~150** if Architecture becomes a pointer and section 4 is cut |

Disclosed (removed from the README, reached by pointer): the Tests inventory (237-244, pointing to `AGENTS.md` Commands); the Architecture rationale (223-233, pointing to Rendering, Maps and Graphs, and Space and Resources); the SQLite contention and journal detail (170, 174, 176, pointing to Storage); the semantics of the Import flag (190, pointing to Storage); the plugin version-bump rule (70, pointing to `AGENTS.md` Tracked skills). There is no CONTRIBUTING doc. `AGENTS.md` already plays that role, and line 94 already routes to it, so a new file is not needed. Optionally rename the section's lead to "Contributing" so humans recognise it.
