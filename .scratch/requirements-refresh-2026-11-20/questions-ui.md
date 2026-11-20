# Fresh-reader questions: UI

Written during Inventory, before drafting, at source `d461223`. Each has an expected answer from the sources; a reader is given `AGENTS.md` and the task, not the doc.

## Q1 (ordinary task). I am adding a sentence an author reads when something is refused. Where does it live, and what does it call the thing a person opened?

**Expected.** The sentence is written in the one application module keyed by stable code (`packages/app/src/authoring-refusal.ts`), never wire prose (UI-89, ADR 0057). It says Space for what a person opened, never "talk" and never "Aggregate": Aggregate is an internal name for source, tests and requirements (ADR 0164, "What a person is shown is a Space"). Evidence: `app/test/authoring-refusal.test.ts` › "gives every code a sentence of its own"; `test/unit/current-domain-vocabulary.test.ts` holds "talk" out of source; nothing tests that Aggregate stays off screen, and the mounted startup failure says "is not an Aggregate directory" (`packages/aggregate/src/aggregate-refusal.ts` `describeAggregateReadRefusal`, asserted on screen by `app/test/mount.test.tsx` › "shows the reader’s diagnostics for a directory that is not an aggregate"), against ADR 0164 but as ADR 0130 ("the browser refuses in the same words" as the CLI) requires.

**Baseline (existing reading path, before drafting).** The task table sends the reader to `ui.md`; UI-89 answers where the sentence lives. Nothing in `ui.md` restates ADR 0164 although its marker claims it, so a reader who trusts the marker does not open ADR 0164 and does not learn the vocabulary rule. Discovery failure, fixed by a rule in the doc.

## Q2 (crosses into Storage). In the desktop application, closing a Space window whose last write hangs shows a question. Which answer has focus, what does Escape do, and is that binding?

**Expected.** Storage ST-122 restates it as built: after ten seconds a question window names the folder, offers "Keep waiting" and "Close without saving", the caret on Keep waiting; Escape, or closing the question window, keeps waiting. It is code and tests only: ADR 0163, which would decide it, is proposed, so no accepted ADR binds it yet. Evidence: `packages/desktop/ui/closing.js` (focus and Escape), `packages/desktop/src-tauri/src/waiting/tests.rs`; the focus and Escape are not tested (observed by hand under Xvfb, ST-122's evidence). The save-failure dialog (first failure of a streak and its recovery) is ST-121.

**Baseline.** The task table's "control, ... focus, ... confirmation" row sends the reader to `ui.md`, whose "Not here" table names no desktop window; `storage.md` is reached only through the "HTTP host" row. Discovery failure, fixed by a pointer in `ui.md`.

## Q3. Does a UI change have to pass in WebKit as well as Chromium?

**Expected.** Decided yes, not built: UI-110 (ADR 0157, refining 0071) says the end-to-end suite runs in a WebKit project in CI and a failure there fails the change, and the desktop application declares minimum macOS and WebKitGTK versions. No Playwright config has a WebKit project and `tauri.conf.json` declares no minimum (`.scratch/rust-host/issues/05-webkit-in-ci-and-minimum-systems.md`). `AGENTS.md` still says `pnpm e2e` runs Chromium only, which ADR 0157 says changes with the WebKit project.

**Baseline.** Found at UI-110. Pass.
