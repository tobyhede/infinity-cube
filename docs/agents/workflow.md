# Workflow

How work moves from a question to committed code in this repo.

## The loop

- **Survey.** Follow the [root reading order](../../AGENTS.md#read-before-changing-an-area). Identify the requirement and the code or evidence the task affects.
- **Design decision.** If the task leaves a design decision open, propose a candidate and walk its decision tree one question at a time, with a recommendation for each. Confirm the decision before implementing it. Record settled terms in `CONTEXT.md` and apply [the ADR criteria](#when-to-write-an-adr).
- **Implement and verify.** Apply the agreed change. For behaviour changes, update the owning requirement and its evidence in the same commit. Follow the [verification bar](#verification-bar).
- **Tracked work.** Resolve its ticket with an `## Answer` and update any requirement status the evidence changes.

Park work outside the current task in the [issue tracker](issue-tracker.md), under `.scratch/<feature>/`.

## ADRs and the requirements snapshot

ADRs 0145 and 0175 decide this section.

**ADRs are binding and append-only.** Accepted ADRs live in `docs/adr/` and retired ones in `docs/adr/superseded/`; [`docs/adr/README.md`](../adr/README.md) lists the accepted set. The seven requirements docs in `docs/requirements/` restate the accepted ADRs in current words as a **snapshot**. They decide nothing themselves: a requirement that disagrees with an accepted ADR is a defect in the requirement.

[`docs/requirements/snapshot.lock.json`](../requirements/snapshot.lock.json) records, by the hash of each ADR's text, which ADRs the requirements restate. `scripts/adr_snapshot.py` writes it and checks it; nobody edits it by hand. The script is a copy of `plugins/skillz/skills/adr-snapshot/scripts/adr_snapshot.py` in [tobyhede/skillz](https://github.com/tobyhede/skillz), whose tests cover it; its `SCRIPT_VERSION` names the release copied, and it is replaced only by a newer release, never edited here. An ADR the lock does not record, or whose text changed since, is **pending**: an accepted one binds where it differs from the docs until the next refresh, and a proposed one binds nothing. `python3 scripts/adr_snapshot.py check` lists the pending ADRs, and CI runs it on every pull request, failing only on a mechanical fault (a malformed lock, a locked ADR gone without a recorded supersession, a doc citing an ADR without linking the lock, a broken ADR link, an uncited locked ADR with no recorded reason). Each requirements doc opens with a line linking the lock.

Use the [root task table](../../AGENTS.md#read-before-changing-an-area) or the [requirements index](../requirements/README.md) to find the owner.

| Document | Owns |
| --- | --- |
| `AGENTS.md` | Task-to-doc pointers, project summary and universal constraints |
| `CONTEXT.md` | Names, definitions and distinctions between terms |
| `docs/adr/` and `docs/adr/superseded/` | Binding decisions with their reasoning, rejected alternatives and history, unchanged once accepted |
| `docs/requirements/*.md` | The accepted decisions restated in current words: each rule with its reason, source ADRs, build status and evidence; one owner per rule |
| Requirements `trace/`, `conflicts/` and `DECISIONS.md` | Where each source rule went, and the rulings that produced the snapshot |
| `docs/agents/` | Engineering process and tooling guidance |
| `docs/adr/archive/agent-guides/` | The product guides the requirements replaced, kept as history |
| `.scratch/` delivery issues | Implementation work, investigations and completed-work narratives |

**ADR acceptance.** A new or revised decision goes into an ADR. Acceptance leaves the requirements snapshot as it was, and `check` lists the decision as pending.

**Implementation.** A code change that changes behaviour updates the owning requirement in the same commit. A ruling that settles which source holds, or records detail no ADR decides, belongs in the owning requirement and its dated trace.

### Refresh the snapshot

1. Run `python3 scripts/adr_snapshot.py check` and decide which pending ADRs the refresh covers.
2. Reconcile each selected ADR with the owning requirements. Record reasons and evidence, link each rule to the ADR by relative Markdown link, and record its disposition in the topic's trace, including ADRs that own no rule there. Add newly defined terms to `CONTEXT.md` and reference them on the requirements doc's Terms line.
3. Run `python3 scripts/adr_snapshot.py stamp`. Pass `--na PATH REASON` for ADRs that no requirement needs to cite and `--leave-pending PATH` for each unreconciled ADR. Compare the `recorded:` lines with the decisions reviewed.
4. Run `check` again and run the disposition, evidence, link and glossary checks in `.scratch/requirements-rewrite/`. Confirm that remaining pending ADRs match the intended exclusions.

A wording fix or faithful restatement that leaves ADR coverage unchanged leaves the lock alone.

### Record a supersession

When moving an ADR to `docs/adr/superseded/`, run `python3 scripts/adr_snapshot.py supersede OLD NEW` in the same change. Confirm that `check` recognises the move. A requirement still citing the old file stays pending until the refresh updates it.

**Code is evidence of what is built.** It does not retire an accepted rule. Surface a disagreement between code, a requirement and an ADR, and resolve it explicitly before changing the rule. Preserve the distinction between `not built` and `bug: code differs`; update status only with evidence.

**Maintain the owner.** Update a behaviour's requirement in the same commit as its change, including the rule's reason and evidence. Link from other topics rather than duplicating the rule. Rule ids are append-only: leave a removed rule as a tombstone and never renumber its neighbours. Check references whenever a rule is added, removed or redirected.

**Keep treatment in code and tests.** Durations, easing, colours, sizes, spacing, typography, shadows and animation choreography alone are not requirements. Requirements retain what is drawn and what it means, what is reachable, what is focused or announced, and what is stored.

## When to write an ADR

Only when the decision is all three:

- **Hard to reverse**: undoing it means reworking code or authored content.
- **Surprising**: someone who knows the domain would not guess it.
- **A real trade-off**: a credible alternative was rejected, for a reason.

Record the rejected alternative and the cost accepted, not just the decision. The most valuable ADRs capture a **negative**, the proposal a future review will otherwise re-suggest: ADR 0005 exists mainly to say *don't introduce an Arrangement type*, and ADR 0004 to say *don't reintroduce a placement layer*.

Skip ADRs for ephemeral reasons ("not worth it right now"), self-evident choices, and anything the glossary already implies.

UI treatment is normally ephemeral. ADRs may record durable state ownership, module boundaries, persistence semantics or accessibility obligations, but not visual treatment, layout, control placement, gestures, shortcuts, responsive geometry, component choice, animation or canvas-composition technique, unless an accepted ADR already decides that treatment, in which case the refining ADR described below states the change. Those belong in issues, prototypes, stories and behaviour tests where UX iteration can replace them directly. When an accepted ADR describes UI that has since changed, determine whether the durable boundary changed. If it did, write a refining or superseding ADR. If only the treatment changed, and no accepted ADR decides that treatment, update the live issue, story and tests and leave the ADR as historical context. Where an accepted ADR does decide it, as ADR 0063 decides that Tab moves focus out of the source editor, the change is a refining ADR, because accepted ADRs bind.

Format: a title that states the decision as a sentence, a status block, then a few paragraphs. Numbered `docs/adr/NNNN-<slug>.md`, taking the next free number. Add its line to `docs/adr/README.md`; the requirements docs wait for the next refresh.

## ADRs are append-only

An ADR becomes a historical record when it merges to `main`. Until then it is a draft on its branch, whatever its status line says: when it is wrong, fix it in place. Update settled terms in `CONTEXT.md` and follow the [snapshot rules](#adrs-and-the-requirements-snapshot) for requirements.

A merged, accepted ADR is **immutable**. It records why a decision looked right at the time, with what was known then. So never merge, rewrite or consolidate ADRs. When a decision changes, write a new one and amend the old one's status block; that block is the only edit an accepted ADR ever receives. A superseded ADR moves to `docs/adr/superseded/`. The current statement of a topic lives in its requirements doc, never in a rewritten ADR.

```
Status: accepted | superseded | proposed
Supersedes: 0004          # this decision replaces that one
Superseded by: 0009       # added to the old ADR when it is replaced
Refines: 0002             # narrows or fixes a boundary without replacing
Refined by: 0005, 0006    # the reverse link, so a reader sees it from either end
```

Relationships are recorded from both ends, and `test/unit/adr-status-blocks.test.ts` holds them reciprocal. There is no periodic re-review. The review point is `proposed → accepted`; after that an ADR changes only by being superseded or refined.

## Domain vocabulary

Update `CONTEXT.md` when a term is coined, sharpened or retired, in the same conversation. It is a glossary: names and definitions, without implementation details, file formats or build status. Use its terms in issue titles, hypotheses, tests and proposals. `_Avoid_` distinguishes terms that would otherwise be confused. Resolve a missing concept during domain review rather than introducing a casual synonym.

Code follows these naming conventions:

- A domain Map is never a local named `map`: use `(m)` for a short callback or a descriptive longer-lived name. A `…Map` suffix means the entity; lookup tables use `…ById` or `…ByKind`. Foreign names such as `.map(`, `.flatMap(`, `ReadonlyMap`, `WeakMap`, `MiniMap`, Prisma's `@@map` and Zod's `optionsMap` keep their spelling.
- `Graph` and `GraphEdge` name the domain. A strategy's intermediate is `LayoutStrategyGraph`, a renderer's is `GraphRenderEdge`, and the canvas is `SpaceCanvas`. Use `LayoutStrategy*` for layout behaviour; authored data is a Map. Do not add aliases in retired domain vocabulary.
- `path` is not a domain Graph: use `graphs` and `activeGraph`. Filesystem paths, HTTP and product URL paths, and React Flow's SVG `edge-path` retain their technical names.
- “Arrangement” is prose, not a domain entity. `CanvasContent`'s `'resources'` means Resources are mounted on the canvas, not that Placement is settled.
- Use core's `titleLines` and `titleName` helpers rather than splitting Titles ad hoc.

`test/unit/current-domain-vocabulary.test.ts` guards authored source under `packages/`, `src/`, `test/`, `scripts/`, `crates/`, `conformance/` and root TypeScript configuration. It does not scan Markdown or root tool configuration. Review prose vocabulary explicitly.

Before changing a guard, read its shapes and exemption assertions. A retired word with an English suffix can evade compound and word-boundary patterns; kebab-case needs its own arms. Cited foreign paths use `CITED_PATH` masking. The dependency protocol, and Cargo's inheritance keys in a Cargo package's manifest, are exempted by line, not by file. Keep an exemption only while its asserted occurrence still needs it; a foreign tool's word is not a reason to exempt unrelated domain uses. The bare word “workspace” is guarded for the loaded Space and the app chrome; say Space, Dock or canvas. pnpm's technical sense remains allowed at the guarded sites.

## Renames and format changes

Keep a rename separate from structural changes, in separate commits. Run a repo-wide rename alone and early, before parallel work adds more surface in the old vocabulary.

Write a tracked codemod that can be replayed by branches in flight. Read the headers of `.scratch/thing-and-diagram/rename-layout-to-diagram.mjs` and `rename-card-to-thing.mjs` for the mask–rewrite–unmask pattern. Specify both spellings not to change and files not to open, including foreign package names and lockfiles. List edits a replay must take from the merge rather than the codemod.

Diff a replay against the merged result; a clean dry run proves only that the mask table and tree agree. Use `-M20%` when merging large renames so heavily rewritten moved files remain recognisable. Finish by extending `test/unit/current-domain-vocabulary.test.ts` to reject retired identifier shapes, including kebab-case and any English suffixes actually used.

For a format change, roll schema, fixtures, examples and tests forward together under [Storage and hosts](../requirements/storage.md#rolling-forward). Fix generated state at its source; keep bootstrap and reset practical. Do not assume an author's Aggregate directory or browser copy is reproducible from this repository.

## Cross-module coordination

Use a functional core and imperative shell. Compute and validate the complete next state in a private pure core before producing side effects; a thin imperative shell then updates collaborators in an order that preserves valid intermediate states. Expose the coordination as one operation rather than returning a plan for callers to execute. Keep framework and store events outside the seam, depend on existing module interfaces, and do not manufacture single-adapter ports for deterministic private helpers. An edit event is a notification, not state transfer: each editor first installs its authoritative completed state and only then emits the notification; the coordinator derives the next Space from the current state owned by its collaborators rather than from state carried by the event.

## Verification bar

Follow [Before claiming done](../../AGENTS.md#before-claiming-done) and use the [verification commands](verification.md#verification-commands) for the surface you changed. In addition:

- A behaviour-preserving refactor leaves e2e green and unchanged.
- Reproduce a defect before fixing it, then show the regression case pass.
- Domain tests assert refusal codes and typed context; presentation tests assert wording and accessibility. Non-Edits retain the working snapshot's identity.
- Every new interaction tied to a Resource, Map, Graph or Edge has an acceptance case for replacement of its Space while the interaction is live. Verify that its draft and pending continuation are discarded.
- For an unavailable command covered by [UI-29](../requirements/ui.md), assert `aria-disabled` and verify activation does nothing.
- Base UI dispatches a `PointerEvent` for keyboard-activated menu items; jsdom needs that subclass supplied. Let a dismissed menu's focus-restoring microtask settle before the next gesture under test.

### Fixture data

`packages/app/fixture/` is the purpose-shaped tracked aggregate used by the fixture host and Playwright. Its positions are authored test data; do not regenerate them from a layout strategy. Preserve the disconnected Maps, overlapping Graph spines, unconnected member, multiline Title and Reference returns that exercise the application. Read `packages/app/README.md` before changing its shape. The narrative content under `packages/app/example/` is separate from test fixtures. Keep fixture documentation outside the fixture directory, so the fixture holds only the files Import reads.

### Stories are production evidence

Start a story from `packages/app/stories/story-template.tsx`; its header owns section placement and the `StoryCanvas`/`StoryCanvasFrame` pattern. Stable stories render unchanged exported production components through the smallest production boundary owning the claimed behaviour. Harnesses supply fixtures, public inputs, providers, context and layout constraints; production owns state translation, lifecycle, focus, interaction and geometry. Keep unreachable proposals in `stories/review`.

Every meaningful stable-story claim links two behavioural proofs: the rendered Ladle story and the real application composition. Compilation, screenshots, class or element counts, and application-only tests do not prove parity. Maintain `packages/app/stories/parity-claims.ts` and the design-system inventory when the surface changes.

Full-application stories mount `components/Application.tsx`. `stories/support/application.ts` supplies fixture snapshots and isolated memory/history adapters; setup opens and enters through Open Spaces and creates failures through backend outcomes. Reach transient states through production operations or controls. Do not build a second Dock, session map or snapshot-edit implementation in the fixture. Account for inactive Spaces remaining mounted in browser assertions.

Exercise refusals through production gestures. If a refusal cannot be reached through a browser gesture, hand the story its structured refusal and declare the claim's `applicationEvidence` exemption; do not inject display prose through a callback. `stories/support` is catalogue furniture: use `inv-*` styling and mount the production surface rather than imitating its classes.

## Reviewing agent documentation

Ask “What will an agent do differently after reading this, and where does that instruction belong?” For example, a Space chrome change sends the agent from the root instructions to the verification guide. The guide explains why to inspect the database restart proofs as well as the ordinary browser specs. The package scripts own the commands those proofs run.

## What a comment may assert

Assert only what the writer has checked. A subagent summary is a report to verify against the file before turning it into source prose.

- Put a negative result in a dated, attributed ticket with its method, not in source as a permanent conclusion.
- Put measurements in a ticket with their method, or commit the instrumentation.
- A claim about another module names the test that holds it.
- A decision described as load-bearing needs a check that fails when it is reversed.

Review these claims against the code; lint cannot establish them.

## What a comment may carry

Comments state what the code does, why, and the invariant it keeps, in the present tense. Apply this to every tracked source file, tests and stories included:

1. Ask whether the sentence would still be true and useful if the code had been written this way from the start. If not, it is history. Runtime replacement of a Space is behaviour; a story about the module it replaced is history.
2. Remove history while preserving any current constraint and what breaks if it is violated. If no invariant remains, remove the sentence.
3. Keep a requirements or ticket citation only when it explains a constraint the code alone cannot show. A ticket citation earns its place while the ticket is open and the comment states its limitation. An ADR citation is valid authority for the decision it names; cite the owning requirement, with its rule id, where the comment relies on the current wording of a rule. Never cite a page under `docs/adr/archive/agent-guides/`, which is history.
4. Apply the evidence rules above to the remaining prose.

Put change history and rejected alternatives in the commit or delivery issue. Keep comments about current constraints with their code.

Tool directives (`eslint-disable`, `@ts-expect-error`, `prettier-ignore`) retain their syntax; their free-text reasons follow these rules. Preserve required `SAFETY:` assertion comments and comments satisfying `no-empty`. When a repository-scanning test requires specific text, change that test in the same commit if the text must change; `.scratch/code-quality/issues/01-write-the-source-comment-rule.md` lists such cases.

## Skills

The authoring skill links only by absolute URL because it is installed outside the repository. `test/unit/agent-skill-commands.test.ts` checks its links.

Skills are tracked, so every clone and worktree has them. `.agents/skills/` is the repo-wide location Codex reads, and `.claude/skills/` holds a symlink per skill into it, which is where Claude Code reads. The files of `infinity-cube-authoring` and `infinity-cube-getting-started` live in the `infinity-cube` plugin, under `plugins/infinity-cube/skills/`, and `.agents/skills/` holds a symlink to each, so an install of the plugin and this repository read the same files (`test/unit/agent-skill-symlinks.test.ts` holds both sets of links).

The plugin is published from this repository's marketplace, `infinity-cube`: `.claude-plugin/marketplace.json` for Claude Code and `.agents/plugins/marketplace.json` for Codex, each pointing at `./plugins/infinity-cube`. Both products cache an installed plugin by version, so a change to either skill reaches installed copies only when `version` is bumped in all three manifests, `plugins/infinity-cube/plugin.json`, `plugins/infinity-cube/.claude-plugin/plugin.json` and `plugins/infinity-cube/.codex-plugin/plugin.json`, together; `test/unit/skills-marketplace.test.ts` fails when they differ. With Claude Code installed, `claude plugin validate . --strict` and `claude plugin validate plugins/infinity-cube --strict` check the catalog and the plugin. The install commands are in the README, "Installing the skills elsewhere".

Tracking both paths is deliberate. An ordinary `git worktree add` populates only tracked files, so an ignored skill is missing from every worktree — and tracking just one of the two locations fixes just one of the two harnesses.

The repository owns its contributor and authoring skills, with one vendored exception:

- **`shadcn`** is vendored from `shadcn/ui` and pinned by `skills-lock.json`, which records its upstream path and the content hash of the files as they stand here. It is **patched locally**, so the hash is not upstream's.
- **`infinity-cube-desktop`**, **`shadcn-first-ui`**, **`infinity-cube-authoring`** and **`infinity-cube-getting-started`** are owned here. They are reviewed like any other repository document, and the lock does not pin them.

### The `shadcn` patch

The vendored files differ from upstream in three ways:

- Every `shadcn@` invocation, in every `.md` and `.yml` file of the skill, names the version in `SKILL.md`'s own `allowed-tools` frontmatter rather than `@latest`. `test/unit/agent-skill-commands.test.ts` holds this.
- `SKILL.md`'s opening note tells the agent to run the CLI through the project's package runner at that version, and `mcp.md`'s setup runs `pnpm dlx shadcn@<version>` rather than a bare `shadcn`. No test holds these.
- `registry.md` warns that a workflow, template or MCP registry item changes what an agent does, and that it is previewed with `--dry-run`, `--diff` or `--view` before it is applied. `agent-skill-commands` holds the preview flags.

An upstream update overwrites all three. After one, re-apply them (`git log -p -- .agents/skills/shadcn` shows the edits as made), run `agent-skill-commands`, then re-record the hash. The hash is SHA-256 over the skill directory's git-tracked files, sorted by relative path with `localeCompare`, feeding each file's relative path and then its bytes. Upstream `skills` walks the working tree instead, so the two agree on a clean checkout; hashing the tracked set keeps an untracked file in the directory out of the result, so `git add` any file the update brings before hashing:

```sh
node -e "const{createHash}=require('node:crypto'),fs=require('node:fs'),{execFileSync}=require('node:child_process');const d='.agents/skills/shadcn/',h=createHash('sha256');for(const f of execFileSync('git',['ls-files','-z','--',d],{encoding:'utf8'}).split('\0').filter(Boolean).map(f=>f.slice(d.length)).sort((a,b)=>a.localeCompare(b))){h.update(f);h.update(fs.readFileSync(d+f))}console.log(h.digest('hex'))"
```

Write the result into `skills-lock.json`'s `computedHash`.

### Skills that are not vendored here

The [`mattpocock/skills`](https://github.com/mattpocock/skills) pack is not vendored. Most of its names (`codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `prototype`, `research`, `resolving-merge-conflicts`, `tdd`, `wizard`, `writing-for-agents`, and more) collide with Claude Code's built-in skills of the same name, and a vendored skill of that name shadows the built-in rather than sitting beside it, as `code-review` would. If a specific skill from that pack is wanted, vendor it individually under a name that does not collide with a built-in.
