# Fresh-reader questions: Navigation (with Presenting)

Written during Inventory, before drafting, from the sources at `d461223`. A reader is given `AGENTS.md` and the task, not the document or the answer.

## Q1 (ordinary task). I am adding a product URL shape. Where is the table, and what else must change with it?

**Expected answer.**
- The shapes are one table, NV-21 (`docs/requirements/navigation.md`), from ADR 0069, ADR 0079, ADR 0111 (and `/notes` from ADR 0129). Any path under `/spaces` not in the table is malformed.
- The table is declared once in `@project/http` (`packages/http/src/product-destination.ts`), and the browser and the host resolve the same table; there is no router library (NV-80, ADR 0069). Resolution reads the path only (NV-26).
- The host's statuses for a malformed or unresolved URL are Storage ST-81.
- Cross-topic: the Rust host serves the product addresses "unchanged on the wire" (ADR 0155, "One Rust host serves the HTTP contract the TypeScript host serves"), and its product resolution is part of `crates/host` (Storage ST-119), held to the TypeScript host by the HTTP conformance suite (`conformance/http/wire-cases.ts`, ported in `crates/host/tests/wire.rs`). So a new shape is resolved in both runtimes, and the conformance case is written once.
- Evidence: `http/test/product-destination.test.ts` › "classifies the claimed product address %s as malformed"; `app/test/browser-location.test.ts` › "survives a browser traversal, which resolves the path alone".

## Q2 (crosses into Storage). On the desktop application, two folders are open, each holding a copy of the same Space (same Space id). The presenter presents in folder A's window and presses S. Which presentation does the Notes window follow, and what decides it?

**Expected answer.**
- It follows only folder A's presentation. The Notes window opens as a window of A's Aggregate, under A's origin (Storage ST-121: "the windows the Aggregate's page opens (a Resource opened independently, the Notes window), which open under the same origin").
- Each Aggregate has an origin of its own, so two Aggregates share no `BroadcastChannel` (ST-121; ADR 0164: "Two Aggregates open at once share no origin; two Spaces of one Aggregate do"). The presentation link opens one channel per Space id (`packages/app/src/browser-presentation-channel.ts` `presentationChannelName`), within its origin, so the same Space id in another Aggregate is never heard.
- The navigation rules are NV-72 (a Notes window over a Space), NV-74 and NV-75 (it follows and drives whichever window presents the Space). NV-77 is the mounted analogue, where two revisions can share an origin, so the channel is also scoped by repository, directory and commit (ADR 0130).
- Gap: no automated test; ST-121 records it observed by hand on Linux (WebKitGTK) only, macOS unobserved.

## Q3. An author exits the last open Space that is not Meta. What must happen, and is it built?

**Expected answer.**
- NV-82: Meta is the only permanent Space; exiting the last open Space opens Meta with no Opener and writes Meta's product URL to the location (with `source` on a mounted page, NV-36). Sources: ADR 0068, ruling Navigation C1 (`docs/requirements/DECISIONS.md`, 12 November 2026; `conflicts/navigation.md` C1).
- Status: **bug: code differs**. `packages/app/src/open-spaces.ts` `exit` refuses only Meta (`meta-space-permanent`, NV-49), and `followActiveSpace` leaves nothing on the canvas and writes no location, so reload reopens the exited Space. Untested. `open-spaces.ts` is unchanged between `9e9b094` and `d461223`.
- Related: Exit's waits, refusals and warnings are NV-85, NV-86, NV-84; the hold a drawing keeps is NV-81.

## Baseline against the existing reading path (before drafting)

Self-check by the topic agent, not independent. `AGENTS.md` routes "selection, Graph navigation, product URLs, browser history, Open Spaces or presenting" to Navigation.
- Q1: found NV-21, NV-80 and ST-81 at `9e9b094`'s doc. The Rust host's share of product resolution was not reachable from navigation.md (no pointer to ST-119 or ADR 0155); a reader would have to know Storage owns it.
- Q2: not answerable from navigation.md: NV-75 says nothing of origins and the "Not here" table names no desktop rule. ST-121 answers it, reachable only via Storage.
- Q3: found NV-82 and its Bugs line.

## After drafting (self-check, not independent)

- Q1: NV-80 now names the Rust host's product resolution (ST-119) and the shared `product addresses` conformance cases (ADR 0155); the "Not here" row names ST-119. Discovery fixed by pointer, not by restating ST-119.
- Q2: NV-75 now says a Notes window hears only its own origin, that the desktop application opens it under its Aggregate's origin (ST-121, ADR 0164), and records the gap (untested; Linux by hand only). The "Not here" row names ST-121 for Space windows and their origins.
- Q3: unchanged; NV-82 and its Bugs line still match the code at `d461223`.
