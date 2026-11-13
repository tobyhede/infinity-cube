# 01 — Prove the interface on the hard paths

Status: done

**Blocked by:** None (can start immediately).

**What to build:** a throwaway branch, never merged, that runs the interface in [`spec.md`](../spec.md) through five paths in the real application: Reference → Image; Replace on an Image inside a Space embedding, where nested Claims meet application-wide exclusivity; creating an Image through the picker; creating a Space with its new Space; a Markdown Resource reading its text as an asset, Opening with a size hint on a Map and drawing on the Stage. A fake or partial host is fine wherever it does not hide the question. Ur alone does not test the interface.

**Questions to answer:** does `Kept<T>` carry withdrawal on each path; do the commits handed to `exclusively`'s work land while a retained commit, the embedding Space's Map selection and Close included, answers refused; does an outer Claim hold while an inner one runs; can `queued` settle a commit honestly; does a plugin need anything `selected` does not give it, in place of the dropped `graphColor`; can a Markdown Resource read its text as an asset and still draw and size acceptably on a Map and the Stage; does any path need a plugin to act on why a commit was refused, which a display-only `{ refused: string }` cannot tell it?

**Acceptance:**

- Each path runs, or the gap that stopped it is named.
- `spec.md` is corrected, and the ADR too if ownership moved.
- The harness is deleted (`docs/agents/build-tooling.md`), and the findings are recorded here under `## Answer`.

## Answer

Each path ran against a partial host over the real `complete` door, memory sessions and Space Resource lifecycle. That shows the spec is consistent with itself and that a host can implement it over `complete`. It does not show the application does: nothing of the real canvas or Stage was mounted, and the partial host itself implements several of the properties the questions ask about (withdrawal enforcement, the Claim chain, `busy`, losing the press, the size cap), so those answers hold by the harness's construction. The proof found six corrections that change the API's shape, and one ownership question, which the ADR 0142 amendment has since answered (question 5). Four parts did not run against real code, and each is named below: the Space plugin's content function on a new Space, the canvas's cap on a size hint, reading text from a real asset store, and measuring rendered text in a browser.

**What ran.** The harness is in the first commit on branch `claude/project-thread-l0stkh-01-proof`, and the next commit deletes it. It lived in `packages/app/test/resource-plugin-proof/`:

- `api.ts` is close to the spec's types, not a copy of them: it also defined `NewSpace`, which the spec then lacked, took `SpaceView` from `@project/core`, and gave `Embed` a map variant, `{ map: SpaceView; claim? }`, which the spec no longer has (question 5).
- `plugins.tsx` has an Image, a Reference, a Space and a Markdown plugin. They import only `./api`.
- `host.tsx` is a partial host. It mounts each plugin on a surface over the real application: `composeApp`, Space Authoring's one `complete` door, memory sessions from `createSpaceSessionRegistry`, and `createSpaceResourceLifecycle`. Each Resource has its own failure boundary, keyed by Replacement epoch. The host records each surface it builds, so a test can look at it.

These parts are fake, and some of them answer the question themselves:

- Assets live in an in-memory map, named by their SHA-256 in base64url. The host fills it from a Markdown Resource's stored source on every surface build, so a read always resolves (path 5).
- The host's own code refuses a retained callback, chains Claims, answers `busy`, drops a `pick` made after an `await`, and caps a size hint. Questions 1 to 3, the press rule and the cap are answered by that code, not by application code.
- The canvas is a `<div>` over the Map's positions: no React Flow, `ResourceNode`, rail, `Own`, Stage or selection.
- The host translates plugin content to the shapes the core schemas still parse. `/assets/<id>` becomes `/images/<id>` for an Image, and a Markdown Resource's `{ text }` becomes `{ source }`. Issues 03 to 05 remove this translation.

`pnpm exec vitest run packages/app/test/resource-plugin-proof` passed 15 of 15 under jsdom. One change outside the harness was needed: `space-authoring.ts` had to let a queued completion settle (question 4). With that change, `space-authoring-operations`, `image-replacement` and `compose-app` still passed, 143 of 143. The harness and that change are deleted, so neither count can be rerun.

### The paths

1. **Reference → Image: runs.**
   - The Reference plugin renders `<Embed resource={target} title={surface.title} />`. The Image plugin draws the Target as a picture, and its `alt` is the Reference's Title, not the Target's.
   - Through the embedding, the Image gets no content commit, no map commit and no `claim`. So it offers no Replace, and nothing tells it which surface it is on.
   - Committing the passed Title renames the Reference. The Target keeps its Title.
   - Tests: `draws the Target as a picture…`, `renames the Reference, not the Target…`, `withdraws the passed Title commit while exclusive work runs…`.
2. **Replace on an Image inside a Space embedding: runs.**
   - Setup: two composed Spaces. The Space plugin's Enter takes Claim A and passes it to `<Embed map claim={A}>`.
   - The harness's `Embed` took `{ map: SpaceView; claim? }`. It never drew the spec's current `{ space; select?; claim? }`, the `defaultMap` drawn when no view is given, or the `select` chooser, so those are not proved here.
   - The inner Image's `claim()` nests under A. The Image picks a file, then calls `exclusively`. Its `own.store` and `own.content` write to the *inner* Space's Authoring.
   - While the work runs, every other surface re-renders without its commits:
     - the Space plugin's Close, selection (`content.commit` with another Map) and Title;
     - a sibling Image's content commit, `store` and `pick`.
   - Each retained callback answers refused and changes nothing.
   - A sibling's `claim()` answers `undefined`. Releasing A answers `false` while the inner Claim is held. A second `exclusively` answers `busy`. Calling `own.content` after the work settles answers refused.
   - The replacement lands. Afterwards A is still held, and the Space plugin's Close completes.
   - Tests: `lands only the work's own commits…`, `refuses releasing an outer Claim…`.
3. **Creating an Image through the picker: runs.**
   - `run` is called in the press. It picks two files, stores each, and calls `host.create` with two items and no position. The host places them through the existing `created-images` Edit.
   - A `run` that awaits before `pick` loses the press.
   - A creation made while exclusive work runs is refused, and the host reports the refusal, because `run` has no surface.
   - Tests: `picks in the press…`, `loses the press…`, `refuses creation while exclusive work runs…`.
4. **Creating a Space with its new Space: the coordinated creation runs; the plugin's content does not.**
   - `host.create([{ newSpace: true, content: s => … }])` reaches `spaceResources.create`. That creates the Space and the Resource in one coordinated Edit across both Spaces.
   - The gap: the plugin's `content` function is never called. `planCreate` in `packages/persistence/src/space-resource-planning.ts` writes the Space Resource's content itself.
   - The test does not show the plugin's function either. It asserted a lambda the test defined itself, discarding `spacePlugin.creates.run`, which no test called. So this path gives no evidence for the API half, nor for the `NewSpace` shape `spec.md` pins.
   - Issue 08 later built it: the creation host calls the plugin's `contentFor` with the new Space (`packages/app/src/plugin-host/creation.ts`, `packages/app/test/creation-host.test.ts`).
   - Test: `creates both in one coordinated Edit…`.
5. **A Markdown Resource reads its text as an asset: runs against fakes for the read and the cap.**
   - On the Map and on the Stage, the plugin draws its Title at once, and its text once `assets.read` resolves. The read resolves from the in-memory map the host filled from the stored `{ source }`, so this shows the plugin's ordering, not a read from a real asset store.
   - Open reads the text first, then commits `{ open: true }` with a size hint, in one `opened-resource-to-fit` Edit. The harness capped the hint itself, under a cap the test passed in (640×1976 under 500×700 gives 500×700); the canvas's `visibleCanvasCap` was never called. The floor is the real Edit's: 640×128 gives 640×146.
   - On the Stage, the plugin gets its `withoutMap` value (`{ open: true }`) and no commit, `store` or `claim`.
   - Saving new text is a `store`, then a content commit that names the new reference.
   - Tests: the four under `path 5`.

### The questions

1. **Does `Kept<T>` carry withdrawal on each path? Yes in the harness, in two layers, and only the second is a guarantee. Both layers are the harness's own code.**
   - *Offer:* the host builds each surface without what is withdrawn, and the plugin re-renders. A Reference passes its `title` Kept on whole, so withdrawal reaches the Target only because the Reference re-renders and passes the new one.
   - *Enforcement:* when a retained callback is called, it checks that its surface is still mounted, that the Replacement epoch has not moved, and that no exclusive work is running. Otherwise it answers refused. So a plugin holding a stale Kept is still stopped.
   - **Change for 02:** at the time, exclusivity only withdrew controls. `replacingImage` (`authoring-availability.ts`, `open-spaces.ts`) hid them, but nothing refused a `complete` made while a replacement ran. The proof proposed an application-wide gate in the surface host, around `complete`. Issue 02 built it at `complete`'s door instead: `complete` refuses with `exclusive-work-running` while the one gate withdraws (`exclusiveWork` in `packages/app/src/space-authoring.ts`), and `open-spaces.ts` passes every composed Space the same gate.
2. **Do the commits handed to `exclusively`'s work land while retained ones answer refused? Yes in the harness,** whose own gate refuses them. Path 2 shows it, with the selection and Close named in the test.
   - The plugin must **pick before `exclusively`**: `Exclusive` carries no `pick`, `exclusively` withdraws `pick`, and the picker needs the press.
   - So Replace runs: pick in the press, then claim, `exclusively`, `own.store`, `own.content`. `spec.md` now says this.
3. **Does an outer Claim hold while an inner one runs? Yes in the harness's own Claim chain.** `release()` answers `false` while a child Claim is held, and the outer Claim was still held when the work settled.
   - **Changed in issue 02:** `release()` answers nothing. The outer release is kept pending and completes when the inner Claim ends, so no plugin retries it.
   - **A trap the harness hit:** unmounting releases a Claim. If `Embed` is a new component type on every render, React remounts everything inside it, and every inner Claim is released on the next re-render. The first run lost the outer Claim this way.
   - So `Embed` must keep the same identity for its surface's lifetime. `spec.md` now says so.
4. **Can `queued` settle a commit honestly? Not with `complete` as it is. Yes with a small change.**
   - Today, `complete` answers `{ kind: 'queued' }`, and the drain discards what `performCompletion(next)` returns. The outcome is lost.
   - The harness gave `complete` an optional `settle` callback, kept on the queue entry. The drain calls it with:
     - the entry's own result;
     - `discarded-replaced` for an entry whose epoch has moved, which the host answers as refused;
     - `discarded-failure` for entries a throw abandoned.
   - With the change, a Title commit made during another Edit's publication settled `completed` once its own Edit was applied (`settles a commit made during another Edit's publication…`). The test checked the commit log's kinds and the final Title, not that the first answer was `queued`. The epoch-moved branch and both `discarded-failure` branches (a throw inside the drain, and the queue it leaves) are written but were not exercised.
   - Issue 02 already plans this ("`complete` gains a way to settle a `queued` Edit"). The proof confirms a callback on the queue entry is enough.
5. **Does a plugin need anything `selected` does not give it, in place of `graphColor`? For its own Resource, no.** `graphColor` only paints the shared frame's border (`CanvasResource.tsx`), and the canvas now strokes the outline.
   - **But the Space plugin cannot be built on the spec's `Surface` as it stands.** Its rail today (`space-resource-context-commands.ts`) does three things a plugin cannot:
     - lists the *target* Space's Maps and Graphs, with their colours and head shapes, to choose a selection;
     - renames, creates, deletes and recolours that Space's Maps and Graphs;
     - copies product links.
   - The proof read these as commits a plugin could not make. They are not the plugin's commits: they author the shown Space, not the plugin's Resource, so they are the host's.
   - **Settled by the ADR 0142 amendment** ("An embedding is host-owned"): there is one `Embed`, given `{ resource; title }` or `{ space: SpaceId; select?: Kept<EmbedView>; claim? }`, and no map variant. The host draws the shown Space and owns its commands. Passed `select`, it draws the chooser, which writes only through that commit, so withdrawal covers it; passed no commit, the chooser is drawn disabled; given no view, the Space is drawn on its `defaultMap`. The shown Space's Map and Graph authoring is offered only under a `claim` the plugin passes beside `select`, and its links are offered on the chooser without a Claim. Issue 07 builds it, and the Space plugin's `<Rail>` keeps only its own commands.
6. **Can a Markdown Resource read its text as an asset and still draw and size acceptably? Yes, with two costs.**
   - It draws its Title at once and its text after one asynchronous read, on the Map and on the Stage. The ADR already accepts this delay.
   - Sizing: the Edit's floor is real. The cap was the harness's own, so the canvas half is not proved. The spec puts the cap in the Map surface's commit, because the visible canvas divided by the zoom (`visibleCanvasCap`) is a canvas fact, and the Edit applies the floor and displacement.
   - The cost: the plugin measures its height at its own width, but the canvas caps width and height separately. If the width is capped, the text is taller than its hint and draws with overflow.
   - Not proved: measuring rendered text, because jsdom has no layout. The harness hinted from a line count. A real plugin measures by rendering offscreen in its own view, as `open-and-expand.tsx` does today, and needs no API for it.
7. **Does any path need a plugin to act on why a commit was refused? No.** On every path the plugin shows the copy and keeps its draft.
   - The causes a plugin must act on were already typed: `'busy'`, `claim()` answering `undefined`, and a withdrawn capability being absent.
   - The host reports a refused creation.
   - A replaced Space remounts the plugin, so no plugin sees that refusal while holding a draft.
   - `{ refused: string }` is enough.

### Other findings

- **`NewSpace` was never defined.** A Space plugin needs `{ spaceId, map, graph }`, which `initializeTarget` already answers. **For 08:** `planCreate` must take the plugin's content. A creation holds at most one `newSpace` item, because the coordination creates one target, and no plugin needs more.
- **A held Claim blocks every top-level claim.** There is one Claim chain at a time. An entered Space, or an open Markdown draft that a click elsewhere leaves up (ADR 0064), stops any other Resource from claiming until it is released. This follows from the invariant and matches today, where a body edit withdraws Replace and Enter. It is noted so 02 does not treat it as a bug.
- **"An `await` before `pick` loses the press" is stricter than browsers.** Transient user activation survives a short await. The rule is safe and the harness enforces it, so it stays.
- **Assets:** `/assets/<id>` uses the same 43-character id as `/images/<id>`, so moving stored images over is a prefix change. Today the core Image schema refuses `/assets/` (`isAcceptedImageUrl`). Issue 04 rolls that forward.

### What moved

- **`spec.md` is corrected:** the Space embedding's `select`; the exclusivity gate and queued settlement, listed behind the seam; the pick-then-`exclusively` order; `Embed`'s stable identity; `NewSpace` and the single new Space per creation; who caps a size hint.
- **ADR 0142 is amended:** an embedding is host-owned, so the shown Space's Map and Graph authoring, the chooser and its links are the host's, offered from the embedding (question 5). Issue 07's "Space's rail comes from `<Rail>`" then covers only the Space plugin's own commands. Nothing else in the ADR moved.

## Decisions

- The harness ran in jsdom under Vitest, without a browser. Only text measurement needed one, and it is named above as not proved.
- `queued` settles through a callback on the queue entry rather than by making `complete` return a promise, so every existing caller of `complete` keeps its synchronous answer.
- The Space plugin's selection stays in Resource content (ADR 0079 durability). The embedding writes it through the plugin's commit.
