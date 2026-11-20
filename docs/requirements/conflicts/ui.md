# Conflicts: UI

These are conflicts for [../ui.md](../ui.md) that drafting rules 1–5 and [../DECISIONS.md](../DECISIONS.md) do not settle. Conflict ids are never reused. Paths are relative to `packages/`.

Two conflicts are open: C5 and C6.

## Open

### C5. What a mounted page's startup failure calls the directory

**Decision requested (raised 20 November 2026).** When a mounted page cannot read the GitHub directory it was given, should its failure say "Space", as ADR 0164 has everything a person reads say, or keep the CLI's words, which say "Aggregate directory", as ADR 0130 has a mount refuse "in the same words"?

**Rules affected:** UI-111; storage.md ST-90 (a mount refuses in the CLI's words).

**The competing claims.**
- ADR 0130, "The directory reader has a pure core": "Anything the CLI refuses, the browser refuses in the same words."
- ADR 0164, "The decision": "What a person is shown is a Space. Every control, dialog, message, guide and skill says Space. Aggregate is an internal name: it appears in source, tests, requirements and `aggregate.json`, never in what a person reads on screen."

ADR 0164 is later but does not name 0130, and says nothing of the CLI, whose output a person also reads.

**What the code does.** `describeAggregateReadRefusal` (`aggregate/src/aggregate-refusal.ts`) words a refused directory as "`<name>` is not an Aggregate directory:" or "Aggregate validation failed:", followed by the intake's lines, some of which say "aggregate directory" too. `pnpm cube run`, `pnpm cube import` and a mount (`app/src/mount/mounted-startup.ts`, shown by the application's startup failure) all use it. `app/test/mount.test.tsx` › "shows the reader’s diagnostics for a directory that is not an aggregate", "shows Import’s diagnostics for an aggregate that is refused" assert those words on the page; `test/unit/run-process.test.ts` and `test/unit/infinity-cube-cli.test.ts` › "check refuses a directory that is not an Aggregate directory, naming the file" assert them on the CLI. The desktop shell, which ADR 0164 does cover, words its own refusal "`<folder>` is not a Space InfinityCube can open:" (`desktop/src-tauri/src/server.rs` `refusal`), so the desktop and a mount already disagree.

**Options.**
- **(a) Space everywhere a person reads it, the CLI included.** Reword `describeAggregateReadRefusal` and the intake lines a person sees, keeping ADR 0130's one wording. The CLI tests and mount tests change together. Needs a new ADR only if the maintainer reads the CLI as outside ADR 0164's "on screen".
- **(b) Space on the page, the CLI keeps Aggregate.** The mount words its own startup failure, and ADR 0130's "same words" is narrowed by a new ADR to the diagnostics' substance.
- **(c) Keep Aggregate in both.** Read ADR 0164's "on screen" as excluding a startup diagnostic. Needs a new ADR, since 0164 lists "message" without exception.

**Recommendation: (a).** It keeps ADR 0130's one wording and meets ADR 0164 as written, and matches what the desktop shell already says; a developer at the CLI loses nothing by reading "Space directory" or "folder". Consequence: UI-111's mounted case becomes **bug: code differs** until the wording changes.


### C6. What a refused save's `forbidden` sentence says, and whether a sentence writes Space capitalised

**Decision requested (raised 20 November 2026, from the Editing topic's review).** Should the sentence an author reads for a save refused `forbidden` say why such a refusal happens now (the change did not come from the application's own page), and should every sentence an author reads write Space and Space Resource capitalised?

**Rules affected:** UI-89 (one sentence per code), UI-93 (the rejection dialog shows "the reason"), UI-111 (what a person reads says Space).

**The competing claims.**
- `app/src/authoring-refusal.ts` (`PERSISTENCE_FAILURE_REASONS.forbidden`): "You do not have permission to save this space." InfinityCube has no permissions. Since ADR 0161 the only `forbidden` a host InfinityCube ships answers is the cross-site refusal (Storage ST-123, detail "Send a change from the application's own page."), plus any 403 an intermediary answers, which `httpExceptionProblem` (`http/src/index.ts`) also reads as `forbidden`. ADR 0161, Consequences: "A change the product's page sends from another origin, through a proxy that rewrites `Host` for example, is refused". So the product's own page can meet it behind such a proxy, and the sentence then sends the author to look for a permission that does not exist.
- ADR 0164: "What a person is shown is a Space. Every control, dialog, message ... says Space." `CONTEXT.md` writes domain terms capitalised ("Capitalised Map names the entity", for Map). The application's refusal and persistence sentences write "space" and "space resource" in lower case: "Two spaces in this edit share one identity.", "A space resource points at a Map that no longer exists.", "A newer version of this space is available. ...", "counting every space it includes", and the `forbidden` sentence. In the same sentences Resource, Map and Graph are capitalised. ADR 0164 decides the word, not its case.

**What the code and tests do.** `app/test/authoring-refusal.test.ts` › "writes its own sentence for a forbidden rejection", `app/test/persistence-control.test.tsx` › "explains a permanent rejection from its code" and `app/e2e/http-persistence.spec.ts` › "a permanent rejection explains the reason and leaves the Space available" assert the `forbidden` sentence word for word. No test asserts a case for "space".

**Options.**
- **(a) Reword and capitalise.** `forbidden` reads, for example, "This change was refused because it did not come from InfinityCube's own page. Open the Space from its own address and try again." Every sentence writes Space and Space Resource as `CONTEXT.md` does. UI-111 then says so explicitly, and the three tests change with the sentence. No ADR needed: a sentence's words are the application's (ADR 0057), and the case follows the glossary.
- **(b) Reword `forbidden` only.** Leave the case alone as outside ADR 0164.
- **(c) Leave both.**

**Recommendation: (a).** The current sentence names a cause that cannot occur, and the lower case "space" beside capitalised Resource, Map and Graph reads as a different word from the Space ADR 0164 says a person is shown. Consequence: UI-111 gains a capitalisation clause marked **bug: code differs**, and UI-89 a note that the `forbidden` sentence names the cross-site cause.

## Closed

Closed by the rulings of 12 November 2026 (DECISIONS, Checkpoint 3 rulings). The code changes they call for are listed under "Bugs" in [../ui.md](../ui.md). The text below each heading is the conflict as it was raised.

### C1. What a connection released across drawings tells the author

**Closed with no ruling (12 November 2026).** The code already refuses the release with the sentence "An Edge can connect Resources only within the same drawn Map.", and two end-to-end tests assert it; the ADR and the code agree. See UI-77 and MG-59 (built). The conflict below misread the code.

**Rules affected:** UI-77; MG-59 (maps-and-graphs.md), which should carry the same status or point here.

**The disagreement.** 0112 records, among the differences a drawn Map may have: "A connection between Resources of two different drawn Maps is refused with wording, like any other connection refusal." The code shows no wording. In a drawing, a Resource of another drawing never shows a seeking end (`mayOfferConnectionEnd` asks this drawing's Edge Authoring, whose draft is not a connection), `isValidConnection` answers false because this drawing cannot resolve the node, and React Flow never calls `onConnect`. Nothing reaches the canvas announcement channel (`edge-authoring-react.tsx`, `role="alert"` `canvas-refusal`), which carries only refusals Edge Authoring produced.

"Like any other connection refusal" does not settle it either way. A release on an ineligible Resource of the same drawing (an Edge that already exists, say) is not worded at release either: the target is marked ineligible during the drag and never snapped to (`app/e2e/editing.spec.ts` › "a duplicate Edge is marked invalid while the drag is still live"). The canvas announcement is used for a refusal that Authoring returns after a completed gesture, such as a refused Option/Alt drop.

**Options.**
- **(a) Word it.** On a release over a Resource of another drawing, announce a sentence on the canvas channel ("An Edge joins Resources of one Space", or similar). It needs a new refusal identity or a UI-only sentence, and a hit test at release.
- **(b) Treat it as any ineligible end.** Another drawing's Resources are not offered as connection ends during the drag and a release on one completes nothing, silently, as for every other ineligible end. The Connect list already offers only the drawing's own Resources. UI-77 becomes a **built (untested)** rule saying so.

**Consistency with ruling C3.** DECISIONS ruling C3 says drawing an existing Edge is refused "with its message". Today that message shows only on the Connect list row (UI-101); a drag onto an already-connected Resource marks it ineligible and shows no sentence. Option (b) must not be read as overruling C3: it keeps C3's message where a surface carries it (the Connect list) and accepts that a drag shows the ineligible mark only. If the maintainer reads C3 as requiring a sentence on the drag path too, that is option (a) for both cases.

**Recommendation: (b).** It is what every other ineligible end does, it needs no new identity, and 0112's own comparison ("like any other connection refusal") is met by it. Add a test that a release on another drawing's Resource completes nothing.

**Evidence.** `docs/adr/0112-a-map-behaves-the-same-wherever-it-is-drawn.md:33`; `app/src/edge-authoring-react.tsx` (`mayOfferConnectionEnd`, `isValidConnection`, the gesture-refusal span); `app/test/edge-authoring-react.test.tsx` › "shows the reason a finished pointer gesture ran into". No test covers a cross-drawing release.

### C2. Whether Remove from Map asks first

**Closed by ruling UI C2 (12 November 2026), recorded as ADR 0153, which refines 0074.** Remove from Map asks first only when it would delete Edges, naming the Graphs that lose them, from the menu and the Delete key, drawn Maps included; otherwise it removes at once (option (a)). This overrules the ticket that said Remove from Map is not a deletion. See UI-85 (bug: code differs) and MG-19.

**Rules affected:** UI-85; UI-83.

**The disagreement.** 0074: "a destructive Card action states whether it affects one Layout or the whole Space, and asks first wherever authored work would be lost." Remove from Map removes every Edge touching the Resource in that Map's Graphs and forgets its size, Shape and Open state; re-adding restores none of them (MG-16, MG-19). The code never asks: neither the actions menu row nor Delete/Backspace on the canvas raises a question, while Delete from Space, Delete Map, Delete Graph and Delete Edge all do. The old guide itself says "removing a Resource from a Map or deleting an Edge cannot be undone" (`docs/adr/archive/agent-guides/ui.md`, key-bindings bullet), and Undo is not built (DECISIONS 5).

**Options.**
- **(a) Ask when Edges would go.** Remove from Map asks first, naming the Map and the Edges it removes, whenever the Resource is an endpoint of an Edge in that Map; otherwise it runs at once. The common case stays one press.
- **(b) Ask always.** Every Remove from Map asks, as Delete from Space does.
- **(c) Never ask.** Record that Remove from Map is not destructive in 0074's sense, because the Resource stays in the Space, and accept the Edge loss until Undo is built.

**Recommendation: (a).** Edges are the authored narrative and the one thing a re-add cannot bring back, which is exactly 0074's test; asking only then keeps the frequent tidy-up removal at one press. If the maintainer prefers (c), UI-85 becomes built as "Remove from Map asks nothing" with the Undo dependency noted.

**Evidence.** `docs/adr/0074-space-card-references-own-the-target-space.md:59-62`; `app/test/resource-rail-actions.test.tsx` › "removes the Resource from this Map and leaves it in the Space, without asking"; `app/e2e/editing.spec.ts` › "${key} with a Resource selected removes it and its Edges from this Map"; `app/src/components/DeleteConfirmation.tsx` (asks for the other deletions).

### C3. How a question or notice names a Resource, Map or Graph

**Closed by ruling UI C3 (12 November 2026), recorded as ADR 0151, which refines 0083.** Wherever a sentence quotes a Title it uses the short Title; controls, list rows and chrome use the first line alone (option (a)). Notices that quote the bare name are bugs. See UI-99 (bug: code differs) and Effects "Names".

**Rules affected:** UI-99; UI-83; Effects "Names".

**The disagreement.** 0083 ("The first line is the name"): every surface that lists or refers to a Resource "shows `titleName` and nothing else", and it names "the Delete question" among them. `CONTEXT.md` (Title Lines) defines a **short Title**, the name with an ellipsis when more Title Lines follow, and says any surface that cannot draw every line (a question or notice, an Edge endpoint) shows it "so a part of the Title is never presented as the whole of it". The code follows `CONTEXT.md`: `core/src/title.ts` `shortTitle`, used by the delete question (`app/src/resource-deletion.ts`) and the Map and Graph commands (`app/src/graph-authoring-commands.ts`). Drafting rule 1 does not settle it: the later source agreeing with the code is the glossary, not an ADR. Controls, rows and accessible names use the name alone, which both sources agree on.

**Options.**
- **(a) The short Title.** Questions, notices and Edge endpoints use the name plus an ellipsis when lines follow; controls, rows and accessible names use the name alone. UI-99 becomes built.
- **(b) The name only, as 0083 says.** Drop the ellipsis from questions and notices; `shortTitle` goes.

**Recommendation: (a).** The ellipsis keeps the name 0083 asks for and only adds the signal that more follows, which is 0083's own concern (part of a Title must not read as the whole). It is built and tested.

**Evidence.** `docs/adr/0083-a-card-title-is-title-lines.md:27`; `CONTEXT.md:47`; `app/test/DeleteResourceConfirmation.test.tsx` › "names a Resource whose Title spans several lines by its first line and an ellipsis"; `app/test/resource-rail-actions.test.tsx` › "names the Resource in the question by its short Title and not by its whole Title".

### C4. Whether a permanent rejection takes focus

**Closed by ruling UI C4 (15 November 2026), recorded as ADR 0154, which refines 0042.** A permanent rejection, and a refused save, is a dialog that takes focus until acknowledged; a retryable failure still takes none (option (a)). UI-93 is built as it stands.

Raised on review, 15 November 2026.

**Rules affected:** UI-93 (the "rejected, refused" row).

**The disagreement.** ADR 0042 decides what a failed save, a conflict and a permanent rejection keep, and ends: "None steals focus." ADR 0068 later makes the conflict a choice the author must take, so the conflict dialog taking focus has an ADR behind it. Nothing later says the same for a permanent rejection. The code shows a rejection, and a refused save, as an `alertdialog` that takes focus until "Continue editing" is pressed. The rewrite kept that by narrowing 0042 with drafting rule 1, on the strength of the old guide (G15) and the code, and raised no conflict. A drafting rule cannot narrow an accepted ADR.

**Options.**
- **(a) A rejection is a dialog that takes focus.** Record it as an ADR refining 0042: a save the server will never accept is a decision the author must see before working on, as a conflict is. UI-93 stays as the code is.
- **(b) A rejection steals no focus.** Keep 0042: the rejection explains itself where the standing alert does, announced, and the author acknowledges it without being moved. UI-93's row becomes "no", and the dialog is a bug.

**Recommendation: (a).** Unlike a retryable failure, a rejection has no Retry for a standing alert to offer, only an explanation to read; and the code and its tests already do this.

**Evidence.** `docs/adr/0042-interaction-drafts-stay-local-and-space-replacement-invalidates-them.md:46`; `app/ladle-e2e/command-dock.spec.ts` › "a permanent rejection explains itself and can be acknowledged", "a refused aggregate explains itself as one sentence and can be acknowledged"; `trace/ui.md` (the 0042 r6 row).
