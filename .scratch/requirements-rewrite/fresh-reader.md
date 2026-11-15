# Fresh-reader questions

Written 15 November 2026, at branch `docs/requirements-rewrite` (HEAD `e503e525` plus the uncommitted realignment edits of that day), against main `d14ff974`.

**What this is and is not.** The questions below are what a contributor new to InfinityCube would ask before changing each of the seven topics. Each has an expected answer and the source it comes from: the ADR that decides it and the requirement that restates it. The method in the `requirements-rewrite` skill (`references/audit.md`, "Fresh-reader exercises") asks for the questions and expected answers to be written during Inventory, before drafting, and for a baseline run against the old reading path. Neither happened: the questions were written after the requirements were drafted, by the agent that also checked them. So this is a self-check of the reading path, not an independent reader, and there is no baseline. An independent reader, given only `AGENTS.md` and a question, is still owed.

**How each was answered.** Starting at the `AGENTS.md` task table, then `CONTEXT.md` for terms, then the owning requirements doc. A question **passes** when that path reaches a rule that gives the expected answer and its status, without opening an ADR or the code. It **fails** on discovery when the path does not reach the rule, and on content when the rule found says something else. "Route" names the `AGENTS.md` row that sends the reader to the doc.

The ADR numbers are from the trace rows (`docs/requirements/trace/`) for each rule. Where a maintainer ruling changed what an ADR decided, the ADR that records the ruling (0146–0153) is named.

## Space and Resources

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| SR-Q1 | I want to add a new kind of Resource. What do I touch? | A kind is its plugin. Write a `plugin-*` package (domain half and view half) and add one line to each half of the build's plugin list in `packages/plugins`; nothing else imports a plugin and there is no other list of kinds. | ADR 0142, 0128; SR-15, SR-20 | "Add a Resource kind" row → space-and-resources.md → SR-15. **Pass.** |
| SR-Q2 | If I delete the last Space Resource that points at a Space, what happens to that Space? | It is deleted in the same Edit, and so on down for any Space left unreferenced. There is no Delete Space command and no reachability sweep. | ADR 0074, 0142; SR-57 | "Space lifetime" in the first row → SR-57, under "Space lifetime, the Meta Space and deletion". **Pass.** |
| SR-Q3 | Can a Reference Resource be repointed at a different Target? | No. The Target is chosen at creation; an Edit naming another is refused `reference-target-immutable`. Delete and create instead. | ADR 0070; SR-31 | "Resource reference" in the first row → SR-31. **Pass.** |
| SR-Q4 | Does creating or replacing an image record the picture's natural size? | It must not: nothing measures it, and `naturalSize` stays optional and unread in the format until the next deliberate format change. The code still measures (bug: code differs). | ADR 0150 (refines 0106, 0126); SR-26 | First row → SR-26, status **bug: code differs**, also listed under Bugs. **Pass.** |
| SR-Q5 | What does a Resource look like in a file, a store and on the wire? | The same envelope `{ id, title, kind, content }` everywhere, and only the listed plugin's schema reads `content`. | ADR 0128, 0142; SR-8, SR-9 | First row → SR-8. **Pass.** |

## Maps and Graphs

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| MG-Q1 | Is switching the Active Graph on the canvas saved? | Yes: it is an Edit that writes the Map's `activeGraph` and records the canvas Map as `defaultMap`. The code does not do this yet (bug: code differs). | ADR 0146 (refines 0028, 0041, 0068, 0116); MG-45, MG-46 | "activate or reorder Graphs" row → maps-and-graphs.md → MG-45, MG-46. **Pass.** The pointer from NV-8 in navigation.md also reaches MG-45. |
| MG-Q2 | What does Remove from Map do to the Resource's Edges, and does it ask first? | It removes every Edge touching the Resource in every Graph of that Map, with their Titles, in one Edit, and asks first only when it would delete Edges, naming the Graphs that lose them (bug: code differs on asking). | ADR 0040, 0068 (MG-19); ruling UI C2 and ADR 0074 (UI-85) | "change membership" row → MG-19; the question is UI-85, reached from MG-19's "Remove from Map" via the UI row. **Pass**, with one hop across docs. |
| MG-Q3 | I delete the Active Graph. Which Graph becomes active? | The first survivor in list order, and it is saved, in every context, embedded included; a surviving saved Active Graph stays. The code differs in the embedded case (bug). | ADR 0040, 0091; DEC 2; MG-54 | Row → "Delete Graph" → MG-54. **Pass.** |
| MG-Q4 | Is there an Auto-arrange? | Decided, not built: an explicit, destructive Edit on an existing Map that rewrites its positions with an automatic strategy. Only the positioned strategy runs while a Map is drawn. | ADR 0086; MG-71, MG-68 | "layout" in the row → "Layout strategies" → MG-71 **not built**. **Pass.** |
| MG-Q5 | When I resize a Resource, do its neighbours move, and is that undone by shrinking back? | They are displaced by the Edit that resizes, by the rule in MG-24; the Resize records nothing about what it pushed, so a grow then shrink restores positions but a shrink then grow need not. | ADR 0093, 0122; MG-24, MG-25 | "Resize, displacement" in the row → MG-24, MG-25. **Pass.** |

## Editing

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| ED-Q1 | Where is the Save command? | There is none. Every completed Edit persists automatically, and nothing writes files back from the browser. | ADR 0030, 0042; ED-7 | "save" in the Editing row → ED-7. **Pass.** |
| ED-Q2 | What can an authoring attempt answer? | Exactly one of completed, unchanged or refused, none of them an error; a queued attempt answers later. A broken invariant is never a refusal. | ADR 0042; ED-12, ED-16 | "completion outcome" → ED-12. **Pass.** |
| ED-Q3 | A coordinated save failed and the author chooses Accept stored. What happens to the other Space's pending image replacement? | Every Space the save covered is replaced and advances its replacement epoch, so the other Space's running exclusive work is dropped, not written into the restored copy (bug: code differs). | ruling Editing C1; ADR 0042, 0076; ED-32 | "replacement, recovery" → "Accept stored and the replacement epoch" → ED-32. **Pass.** A cross-boundary case: the reader must also know exclusive work is ED-68, which ED-32 cites. |
| ED-Q4 | Is Undo built? | No. Undo reverses one whole Edit, coordinated ones in every participant, on the selected occurrence's Space; until it is built an Edit is reversed only by another Edit. | ADR 0112, 0074; DEC 5; ED-74, ED-75 | "Undo" in the row → ED-74 **not built**. **Pass.** |
| ED-Q5 | An Edit queued behind another is refused when the queue drains. Where does the author see it? | At the surface that made it, or announced if that surface has closed; no draft is kept (bug: code differs). | ruling Editing C2; ED-78 | "refusal order" → "Outcomes" → ED-78. **Pass.** |

## Storage and hosts

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| ST-Q1 | Under `pnpm cube run`, does merely opening a mapless Space rewrite my directory? | It must not: the first working read's initialization does not trigger an Export. The code does schedule one (bug: code differs, untested). | DEC 3; ADR 0117; ST-65 | "Running" in the Storage row → "Running" → ST-65. **Pass.** |
| ST-Q2 | Where is a Markdown Resource's text stored? | As an asset, `assets/<hash>.md` in an Aggregate directory, named by its content's `{ url }` (`/assets/<hash>`); no file sits beside the Resource file. | ADR 0142; ST-31, SR-21 | "file format" → ST-31. **Pass.** |
| ST-Q3 | I am changing the file format. Do I need a migration or a versioned reader? | No. The change rolls schema, fixtures, examples and tests forward in one change; there is no versioned reader, alias or migration, because there is no compatibility promise for any copy outside the repository. | ADR 0054, 0056, 0152; ST-36 | `AGENTS.md` "State" links storage.md#rolling-forward → ST-36. **Pass.** |
| ST-Q4 | Do a mounted talk's edits survive a reload? | Not today: they are lost on reload (ADR 0131). Decided, not built: an IndexedDB repository per resolved repository, directory and commit keeps them (ADR 0132). | ADR 0131, 0132; ST-95, ST-91 | "Mounting" → ST-95 **not built**. **Pass.** |
| ST-Q5 | Does Import give a mapless Space its first Map? | No. Import never runs a working read, so a mapless Space stays mapless. | ADR 0079; ST-47, MG-75 | "Import" → ST-47. **Pass.** MG-75, which ST-47 points to, lists which reads initialize. |

## Rendering

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| RD-Q1 | Does a long Open Markdown Resource scroll on the canvas? | No. Open content that does not fit is clipped at the rect; the author resizes it. An unframed drawn Map is placed at authored scale, not fitted. Presenting still scrolls. | ADR 0149 (refines 0122); RD-5, NV-63 | "Open content" in the Rendering row → RD-5. **Pass.** |
| RD-Q2 | Can `ui` import `@xyflow/react`? | No. Only `react-flow-adapter` and `app` import React Flow. | ADR 0002 and the lint zone; RD-71, UI-5 | "canvas projection" → "React Flow rules" → RD-71; also `AGENTS.md` "Hard rules". **Pass.** |
| RD-Q3 | Which side of a Resource does an Edge attach to, and is it stored? | The sides that face each other, chosen from where the two Resources are now, so it is right during a drag; it is never stored. | ADR 0087, 0110; RD-34, RD-35 | "handles" → RD-33 to RD-35. **Pass.** |
| RD-Q4 | Does activating a Graph hide the other Graphs? | No. Every Graph is drawn at all times; activation is emphasis, the others recede. | ADR 0028, 0100; RD-29 | Rendering row ("drawn Map") → "Edges" → RD-29. **Pass.** Discovery leans on knowing that emphasis is drawing; the Maps and Graphs row ("activate") goes to MG-43, which points to rendering.md. |

## UI

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| UI-Q1 | I need a new popover. Can I write my own? | Build on the shadcn component and its Base UI primitive; a hand-rolled component is a deviation recorded with its reason before it ships. Start with the `shadcn-first-ui` skill. | ADR 0047, 0050, 0052; UI-1, UI-2 | `AGENTS.md` "Rules that bite" and the UI row → UI-1. **Pass.** |
| UI-Q2 | Is there a keyboard shortcut to resize a Resource? | No. Resize has no keyboard form. | ADR 0066, 0122; UI-69 | "key" in the UI row → "Resize control" → UI-69. **Pass.** |
| UI-Q3 | A rename is refused. Where does the reason show, and what happens to the draft? | On the surface that made the attempt, which keeps its focus and draft; the sentence comes from the one copy module keyed by code. | ADR 0042, 0057, 0089, 0112; UI-90, UI-89, UI-50 | "announcement" → "Where answers show" → UI-90. **Pass.** |
| UI-Q4 | A notice quotes a three-line Title. What does it show? | The short Title: the first Title Line plus "…" (bug where a notice quotes the bare name). Controls and list rows show the first line alone. | ADR 0151 (refines 0083); UI-99 | "notice" → "Effects across controls" → UI-99. **Pass.** `CONTEXT.md` "Short Title" gives the same term. |

## Navigation

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| NV-Q1 | Can I retreat through the Resources I visited with Graph navigation on the canvas? | No. Canvas Graph navigation keeps no Traversal history and writes nothing; only presenting keeps one. | ADR 0148 (refines 0041); NV-13, NV-16 | "Graph navigation" in the Navigation row → NV-13. **Pass.** |
| NV-Q2 | Does choosing a Map on the canvas change where the Space opens next time? | No. Choosing a Map writes nothing, `defaultMap` included; only an Edit on the canvas records where the author works. | ADR 0079, 0116; NV-6, MG-79 | "selection" → "Choosing a Map" → NV-6. **Pass.** |
| NV-Q3 | What happens when the author exits the last open Space? | Meta opens with no Opener and Meta's URL goes in the location (not built: today nothing is left on the canvas). | ruling Navigation C1; ADR 0068; NV-82 | "Open Spaces" → NV-82 **not built**. **Pass.** |
| NV-Q4 | Where are a talk's presenter notes stored? | Nowhere of their own: they are found by title in the Map's Presentation Notes Graph, and finding them stores nothing. | ADR 0129; NV-67 to NV-70 | "presenting" → "Presenting" → NV-67. **Pass.** |
| NV-Q5 | Does every move add a browser history entry? | Only when the address changes, and one operation makes at most one entry; a narrower or stale location replaces; an unchanged one writes nothing. | ADR 0069, 0081; NV-29 to NV-31 | "browser history" → NV-29 to NV-31. **Pass.** |

## Process (outside the seven topics)

| # | Question | Expected answer | Source | Route and result |
|---|---|---|---|---|
| PR-Q1 | The maintainer has decided to change a rule an accepted ADR states. Do I just edit the requirements doc? | No. Write a new ADR that refines or supersedes the old one (adding only a status line to it), then update the owning requirements doc and its snapshot marker in the same change. | ADR 0145; `docs/agents/workflow.md` | `AGENTS.md` "Record a decision, or change what an accepted ADR decides" row → workflow.md. **Pass** once that row is committed (it was added on 15 November 2026 during this realignment). |

## Results

33 questions, 33 passes by this self-check. Notes a fresh reader would trip on:

- ST-Q5: the reader reaches the answer through ST-47 and ST-83; MG-75 carries its status and evidence after its sub-list.
- MG-Q2 and RD-Q4 need one hop across docs, which the docs' "Not here" tables and the rule's own pointer supply.
- Every answer above was checked against the rule text at the time of writing, before the agents realigning the docs on 15 November 2026 had finished. Rerun after the snapshot markers land; a question whose rule changed is reopened.

**Still owed:** an independent reader given only `AGENTS.md` and these questions (the expected answers withheld), with the result recorded here beside this self-check.
