# Trace: Editing

For audit only. Every source rule appears exactly once in §1–§4, with one of four dispositions:
- **→ ED-n**: kept.
- **folded → ED-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§5 groups the sends by receiving doc. §6 lists the code-only rules, §7 holds code notes.

Abbreviations:
- "EP n" is a bullet of the old guide `docs/agents/editing-and-persistence.md`, by line number.
- "CAS" is the old guide `docs/agents/authoring-refusal-cascade.md`.
- "rN" is the Nth rule of an ADR as numbered in the mapping tables; "s" after an ADR number marks a superseded ADR.
- "DEC n" is ruling n in `../DECISIONS.md`.
- Docs: SR is space-and-resources.md, MG maps-and-graphs.md, ST storage.md, RD rendering.md, UI ui.md, NV navigation.md, GL `CONTEXT.md`, PROC is process docs (AGENTS.md, workflow.md, anti-slop.md, build-tooling.md).

The rule ids in `../editing.md` are append-only from this version on.

## 1. Old guide `editing-and-persistence.md`

| Source | Disposition |
|---|---|
| EP 1 scope line | dropped: a guide's scope line |
| EP 5 Reference Target immutable (0070), `reference-target-immutable` | sent → SR |
| EP 9 renamed key rolls forward; no retired-key refusal | sent → ST (product rule), PROC (process) |
| EP 10 Prisma Next packaging workaround | sent → PROC (build-tooling.md) |
| EP 11 revision stored as decimal text; one codec | sent → ST |
| EP 15–19 the SQL repository, `decideCommit`, raw parse, failure classification, `verifyMarker` | sent → ST |
| EP 23 pointer to MG | dropped: a pointer |
| EP 25 Resource file format, sidecar, strictness | sent → ST |
| EP 26 Graphs are the only connection structure | sent → MG (MG-37 already holds it) |
| EP 27 `loadSpace` is the one intake; no `manifest`; space directory | sent → ST (intake, the M2 correction), GL (`manifest`). "No shared Draft; an editor installs valid state and emits a payload-free notification; completion derives the whole next Space" folded → ED-3, ED-4, ED-24 |
| EP 28 cycles and self-Edges; duplicate is a no-op | sent → MG (MG-36, MG-61; DECISIONS C3 makes it a refusal) |
| EP 32 the browser never imports files or names storage; Mount exception; 0131 in-page writes; 0132 IndexedDB | sent → ST. The mounted session's Dock mark sent → UI |
| EP 33 CLI export in place, import, `--dangerous-replace`, lifecycle doors, images | sent → ST |
| EP 34 one directory reader fed by sources | sent → ST |
| EP 35 "Aggregate" has one meaning | sent → GL, ST |
| EP 36 one aggregate-aware contract; change sets; locks; fast path; `loadSpaceAggregate` | sent → ST |
| EP 37 Space Resource lifecycle is the only multi-Space interface; five operations | → ED-54 |
| EP 37 barrier, waits only for in-flight commits, queued work stays | → ED-56, ED-57 |
| EP 37 one stored aggregate read; participants as working | → ED-58 |
| EP 37 pre-commit verdict is `decideCommit` | → ED-59 |
| EP 37 `failed`/`conflicted` participant or link target refuses; deletion recovery rule; `rejected` refuses nothing | → ED-60, ED-61 |
| EP 37 barrier held until the answer; later ordinary Edits stay queued | folded → ED-56, ED-65 |
| EP 37 framing reset on Map deletion, kept on Graph deletion | sent → MG (MG-15, MG-55 hold it) |
| EP 37 zero-reference cascade; convergence keeps a target alive | sent → SR |
| EP 37 application surface `createSpaceResourceLifecycle`, `referenceableSpaces`, `target` | sent → SR (what is offered), §7 (composition) |
| EP 37 selection resolved by the lifecycle; `link` initializes the target; `space-resource-target-unavailable` | sent → SR (SR-41, SR-43, SR-61) |
| EP 37 initialization runs only after the containing Space's own checks, so a link the containing Space refuses initializes nothing and mints no id | sent → SR: the effect of a link is SR's (SR-43). ED-60 points there (SR-61). Both traces sent it to each other; SR owns it by the domain-vs-ED boundary |
| EP 37 `space-resource-deletion-unsupported`; deletion chooses the lifecycle first; confirmation says V1 has no undo | sent → SR (code), UI (confirmation). "No undo" replaced by DEC 5 → ED-74 |
| EP 38 a Space Resource's selection is durable; intake codes; Enter; round trip; fixture advice | sent → SR, NV (Enter), ST (round trip, fixtures) |
| EP 39 one persistence outcome and one recovery per coordinated Edit | → ED-55, ED-62, ED-63 |
| EP 39 created sessions are acknowledged, and deleted ones leave, only after the complete answer | → ED-55 |
| EP 39 acknowledging a coordinated commit clears the session's recovery; a superseded recovery never settles a moved-on session; in flight means `pending` | → ED-76 |
| EP 39 a recovery never replays over a participant another recovery holds; refused replay recorded as blocked | → ED-66 |
| EP 39 `canRetry`: `failed`, size rejection, blocked | → ED-45, ED-47, ED-66 |
| EP 39 oversized save keeps Edits and offers Retry; the whole request counts | → ED-47. The 1 MiB limit sent → ST (ST-77) |
| EP 39 Exit refused while `canRetry` admits it | sent → NV |
| EP 39 the Dock draws `PersistenceNotice` with Retry and Open | sent → UI |
| EP 39 `compose` opens a Space with a live session on that session | sent → NV (§7 note) |
| EP 39 thrown calls cannot strand the barrier | → ED-67 |
| EP 39 `rejected` and `refused` are distinct statuses with one recovery | → ED-48 |
| EP 40 one commit in flight; coalescing; revision chaining; the statuses | → ED-42, statuses table |
| EP 40 completion never waits for acknowledgement | → ED-8 |
| EP 40 persistence codes described by the application; `problem.detail` never shown; `ProtocolFault` for diagnostics | → ED-44. `ProtocolFault` and the wire sent → ST |
| EP 40 Accept stored replaces through Space Authoring, validates first, advances the epoch | → ED-27, ED-28 |
| EP 40 `StoredSpaceRefusal` is an identity | folded → ED-27 |
| EP 40 "Graph activation is not an edit and does not submit" | struck by DEC 1 (MG-45) |
| EP 41 non-throwing notification; reporter never rethrows | → ED-11 |
| EP 41 `submit` decides from `state.working`; no call-scoped guard | → ED-43. "Don't replace it with a guard" is in §7 |
| EP 45 three outcomes, not interchangeable; completion union names facts | → ED-12, ED-3 |
| EP 45 unchanged is the authored value; a surface's ordinary close | → ED-14 |
| EP 45 refused carries identity and context; app owns wording | → ED-15 |
| EP 45 broken invariant throws | → ED-16 |
| EP 45 `edgeEligibility` returns the completion's refusal | → ED-22 |
| EP 45 domain tests assert codes, presentation tests prose; property test of non-Edits | sent → PROC |
| EP 45 `StoredSpaceRefusal` a separate family | folded → ED-27 |
| EP 46 derive and validate before effects; submit first, then navigation together | → ED-4, ED-5 |
| EP 46 `continueInMap` keeps presenting only while the adopted Graph holds the presented Resource | sent → NV |
| EP 47 install gate counts depth, publishes in `finally` | → ED-6 |
| EP 47 a drained completion's failure is contained; rest discarded and reported | → ED-10 |
| EP 47 the drain gates on the epoch; skip, not stop | → ED-31 |
| EP 47 Edge Authoring cancels its draft on the epoch | folded → ED-30 |
| EP 47 focus after a replacement is open | sent → UI |
| EP 48 Map resolution from one module | dropped: module structure (§7) |
| EP 49 a completed Edit persists automatically; drag frames never reach persistence | → ED-7, ED-25 |
| EP 49 the session status is the persistence indicator | → ED-53. Its words sent → UI (UI-93) |
| EP 49 no Save button, keyboard Save or file write-back | folded → ED-7 |
| EP 49 `beforeunload` only while unsettled; `preventDefault` only | → ED-51. "`returnValue` is deprecated" sent → PROC |
| EP 50 Resize writes `size` only; floor; unchanged | sent → MG (MG-22–MG-26, MG-82) |

## 2. Old guide `authoring-refusal-cascade.md`

| Source | Disposition |
|---|---|
| CAS intro: every completion answers one outcome by an ordered cascade; first failure wins | → ED-12, and the preamble of "Guard order" |
| CAS `edgeEligibility`/`connectRefusal` ask the identical checks | → ED-22 |
| CAS "the table is a cache of the code" | dropped: maintenance advice for a deleted table |
| CAS universal guard: the selected Map still exists → `map-not-found` | → ED-19 |
| CAS `created-map` and `renamed-space` skip it; `renamed-space` asks after the title | → ED-20 |
| CAS Map and Graph deletion are not completions; unchanged when no successor | → ED-23. "Unchanged when no successor" sent → MG (MG-13, MG-53) |
| CAS per-action rows: Resource edits | sent → SR (each code and its order with its Edit). The Map-entry rows (`opened-resource`, `closed-resource`, `resized-resource`, `changed-resource-shape`, `added-resource-to-map`, `removed-resource-from-map`) sent → MG |
| CAS per-action rows: connections, Graph edits, Map edits, Map creation, movement | sent → MG |
| CAS per-action row: `renamed-space` | sent → SR |
| CAS `map-not-found` in `renamed-map` is an action check, not the guard | sent → MG |
| CAS Edge Title Edits read only the stored Edge; one-line check before the trim | sent → MG |
| CAS "26 codes", counts, `map-required` raised nowhere, `image-url-unsupported` has no row | dropped as a count. `map-required` is in §7; `image-url-unsupported` sent → SR |
| CAS a code is a stable identity; renaming one is an interface change | folded → ED-15 |
| CAS `describeAuthoringRefusal` is exhaustive | folded → ED-15 |
| CAS Edge toolbar draws a refusal in one alert region | sent → UI |
| `StoredSpaceRefusal` excluded | folded → ED-27 |

## 3. ADRs

| Source | Disposition |
|---|---|
| 0035 r1 one framework-neutral module owns the lifecycle; no React types cross | → ED-1, ED-2. "Id minting" folded → ED-4. "Eligibility" folded → ED-22 |
| 0035 r2 render adapter installs placement, then reports a completed fact | → ED-3 |
| 0035 r3 cancelled, duplicate, zero-movement, stale attempts make no Edit and do not throw | folded → ED-14 (unchanged), ED-15 (stale is refused, 0042). "Duplicate" for an Edge is a refusal by DECISIONS C3 (MG) |
| 0035 r4 `SpaceSession.working` the only authored snapshot; only Space Authoring mutates the session; UI calls recovery through it | → ED-1. "Navigation holds no second copy" sent → NV |
| 0035 r5 install order; one publication per Edit | → ED-5, ED-6 |
| 0035 r6 reentrant completions queued, derived from installed state | → ED-9 |
| 0035 r7 observer failures never block; only failure to derive throws synchronously; persistence failure is async and never disables authoring | → ED-11, ED-16, ED-8 |
| 0035 r8 adapter owns pointer attempts and visual selection | sent → RD. "First Graph id minted only when its Edit succeeds" dropped: lapsed, every Map has a Graph |
| 0035 r9 Accept stored is a replacement, not an Edit; no remount | → ED-28, narrowed: the composition and session are kept, and surfaces keyed by the epoch remount (`App.tsx` keys `ReactFlowProvider` by `replacementEpoch`). Navigation side sent → NV (NV-4) |
| 0042 r1 drafts local; not a partial Space; cancel needs no compensating Edit | → ED-24 |
| 0042 r2 a semantic operation crosses Authoring once; re-read, derive, validate, install, submit | folded → ED-4, ED-5, ED-7 |
| 0042 r3 a completed Edit is authoritative: Escape cannot cancel, failure does not roll back | → ED-13 |
| 0042 r4 creation completes before its follow-up Title editor | → ED-18 |
| 0042 r5 outcome vocabulary; refused returns to the initiating surface, which keeps focus and draft; programming errors throw | → ED-12, ED-14, ED-15, ED-17, ED-16. Focus sent → UI (UI-90) |
| 0042 r6 pending never locks; coalescing; Retry commits newest; conflict keeps local work; Keep local; rejection keeps work; nothing steals focus | → ED-8, ED-42, ED-45, ED-49, ED-46. "Nothing steals focus" sent → UI (UI-93; ED-50 removed). UI-93 makes a rejection and a conflict dialogs, which the writer of ui.md must reconcile with it |
| 0042 r7 Accept stored validates first, installs as one publication | → ED-27, ED-28 |
| 0042 r8 epoch advances on replacement; owners cancel; surfaces close | → ED-30. Selection and Traversal history clear sent → NV; canvas focus sent → UI |
| 0042 r9 queued completions record the epoch and are discarded | → ED-31 |
| 0042 r10 epoch is invalidation, not a registry; what does not advance it | → ED-29, ED-30 |
| 0042 r11 every new target-bound interaction handles replacement in its acceptance cases | rule folded → ED-30. Checklist item sent → PROC (workflow.md) |
| 0042 "Alias creation stays a picker draft" | dropped: dead under drafting rule 1 (0089: creation completes on activation) |
| 0057 r1 an expected failure carries a stable code at every seam | → ED-15, ED-44 |
| 0057 r2 `refused` carries a closed `AuthoringRefusal`; no field, status or sentence | → ED-15 |
| 0057 r3 application maps codes to wording, field and recovery; accepted Edit closes its surface without waiting | wording and placement sent → UI. "Closes without waiting" → ED-13 |
| 0057 r4 persistence keeps its own states, not duplicated in the editor | folded → ED-41, statuses table |
| 0057 r5 `CommitResult` failure arms carry codes; `protocol` carries `ProtocolFault`; `problem.detail` never reaches a screen | screen half → ED-44. Shape sent → ST |
| 0057 r6 HTTP Problem Details | sent → ST |
| 0057 r7 409 may carry the current Space | sent → ST |
| 0057 r8 adding or changing a code is a deliberate interface change | folded → ED-15 |
| 0076 r1 each Space its own concurrency unit | → ED-41 |
| 0076 r2 a lifecycle operation over several Spaces is one atomic Edit | → ED-55 |
| 0076 r3 domain-shaped interface; callers pass no snapshots or participants | → ED-54 |
| 0076 r4 one barrier; install every participant before one publication; keep the barrier until the answer | → ED-56, ED-62. "Waits for existing commits" refined by 0099 |
| 0076 r5 authoring stays available; later work queues | → ED-65 |
| 0076 r6 not a generic transaction API | folded → ED-54 |
| 0076 r7 `failed`/`conflicted` participant recovers first; `rejected` may participate | → ED-60, ED-64. Narrowed by 0097/0099 (drafting rule 1) |
| 0076 r8 conflict, failure or rejection belongs to the whole Edit; recovery together | → ED-62, ED-63 |
| 0076 r9 answers completed/unchanged/refused; repository result is persistence state | → ED-62 |
| 0076 r10 Space Authoring owns every single-Space Edit; this is the one exception | folded → ED-1. "Three known operations" dropped: five today (0091, 0097, code) |
| 0097 r1 coordinated Edits: create, link, delete, Map or Graph deletion | → ED-54 |
| 0097 r2 judged against the aggregate the repository will judge | → ED-58 |
| 0097 r3 one stored read per turn; cascades count in that view | → ED-58 |
| 0097 r4 pre-commit verdict is `decideCommit` | → ED-59 |
| 0097 r5 link to a `failed`/`conflicted` target refused | → ED-60 |
| 0097 r6 per-Space sessions, rejected participation, shared outcome, completed on install | folded → ED-41, ED-64, ED-62 |
| 0097 r7 do not make unrelated Spaces participants or refuse for any open Space in recovery | → ED-61 (last clause) |
| 0097 "barrier waits for every open Space's queued work" | dropped: replaced by 0099 (drafting rule 1) |
| 0099 r1 pause every session, then await only in-flight commits; queued work stays queued | → ED-56 |
| 0099 r2 the link takes the stored Graph (accepted stale read) | → ED-57 |
| 0099 r3 one recovery rule for both deletions, stored or working | → ED-61 |
| 0099 r4 a `rejected` Space does not refuse | folded → ED-61 |
| 0126 r1 while any composed Space replaces an image, every Space withdraws authoring and navigation until the Edit applies | → ED-68 |
| 0126 r2 target stays mounted; pan and zoom stay | target → ED-69. Pan and zoom sent → NV (NV-50 states them; ED-68 points there) |
| 0126 r3 upload times out at 2 min, measurement at 10 s | → ED-72 |
| 0013s r3 no edit mode | → ED-36 |
| 0030 r2 every completed Edit persists automatically and atomically; no Save | → ED-7 |
| 0030 other rules (store, ids, import, export, HTTP only, Prisma, memory adapter) | sent → ST; Prisma pin and CI job → PROC |
| 0048 r1–r4 commit and Escape per surface | sent → UI |
| 0048 "no undo anywhere" | replaced by DEC 5 → ED-74 |
| 0074 "V1 has no undo" | replaced by DEC 5 → ED-74. The rest of 0074 sent → SR, UI |
| 0084 "no `move` draft" | → ED-25 |
| 0084 "one Edit may move many Resources; reversing it reverses all" | reversal → ED-74. The rest is MG (MG-26) |
| 0091 deleting a Map or Graph atomically updates every Space Resource that selects it | atomicity → ED-55, ED-54. The relocation sent → MG (MG-15, MG-55) |
| 0112 per Space: authoring, outcomes, delete confirmation, image replacement, Edge completion never borrowed | authoring and outcomes → ED-41. Image replacement → ED-68. Confirmation sent → UI. Edge completion sent → MG (MG-59) |
| 0112 one notice area for every drawn Space | sent → UI. Notice per Space folded → ED-41 |
| 0112 Undo and Redo act on the selected occurrence's Space | → ED-74, ED-75 (not built) |
| 0112 the rest (occurrences, policy, composition lifetime, recorded differences) | sent → SR, NV, RD (already sent by the MG trace) |
| 0068 r10 editing inside an embedded or entered Space authors that Space; moving the Space Resource authors the containing Map | → ED-41 (first half). Second half sent → MG (MG-80) |
| 0068 r16 switching awaits any in-flight commit | sent → NV |
| 0068 r18 Exit waits, refuses on `failed`/`conflicted`, warns on `rejected` (and `refused`, audit) | sent → NV. The statuses it reads are ED's table |
| 0131 r1 a mounted session authors as any session; no mounted availability answer | → ED-40 |
| 0131 r4 a mounted session reports persistence as any session; a Dock mark says where edits live | → ED-52. The mark sent → UI |
| 0131 r2, r3, r5 in-page writes, object URLs, nothing writes to GitHub | sent → ST |
| 0132 IndexedDB store, "Edited in this browser", Discard | sent → ST (DEC 4, not built), UI (the mark and Discard) |
| 0089 Space Resource placement does not await its commit; refusal removes it | sent → SR (audit-split §3) |
| 0064 r3, r4, r6, r7 (EP tags) Open/Edit/Save/Cancel controls, four exits, one content edit owns the keyboard | sent → UI. "One content edit at a time" also folded → ED-37 |
| 0065 r5 (EP tag) Enter or blur completes, Escape restores, refusal beside the field | sent → UI. "Refusal keeps the draft" folded → ED-17 |
| 0083 (EP tag) Title editing keys | sent → UI |
| 0104, 0105, 0121, 0122 (EP tags) the refusal codes and unchanged rules of their Edits | sent → MG (held in MG-50–MG-67, MG-22–MG-32) |
| 0120, 0128 (EP tags) kind model and Resource file | sent → SR, ST |
| 0109 (EP mention) every authored id has one source | sent → PROC. Minting during derivation folded → ED-4 |
| 0010 r4 a Space is never the mutable edit buffer | → ED-1 ("no Space value is ever mutated in place; an Edit derives a new one"); storage.md points to it. ST and ED each sent it to the other; ED owns it |
| 0098 r2 the browser `CommitResult` adds transport failures; r6 transport failure classification stays in the transport | sent → ST (ST-101, ST-102); ED-44 points there |
| 0107 (proposed, EP tag) SVG stored and served sandboxed | dropped: proposed (DEC 7, drafting rule 3) |
| 0113 r2 availability may depend on interaction state; structural invariants refuse; both for every kind alike | folded → ED-33. A kind withholding its own Create while its creation is in flight is interaction state, so ED-33 states it as the one kind-specific term |
| 0009, 0018, 0032, 0033, 0041 r5–7, 0046 r2, 0063 r1, 0069, 0079, 0080 (EP tags) | none is an Edit-lifecycle rule. Intake, first load, document spelling and host codes sent → ST; the Target field of 0046 r2 is dead under drafting rule 1 (0070); 0063 r1 sent → SR; first-load repair sent → MG |
| 0010 (except r4), 0020, 0034, 0054, 0056, 0077, 0078, 0094, 0095, 0096, 0098, 0106 (store), 0117, 0118, 0119, 0124, 0127, 0130, 0133, 0134 (EP-only rows) | sent → ST whole, except 0010 r4 and 0098 r2, r6 above (audit-split: storage half of EP). 0098's `CommitOutcome` is defined in ST; ED states only how a session reacts (statuses table) |
| DEC 4 mounted edits kept across reload (not built) | sent → ST, UI |
| DEC 5 Undo kept, not built; whole Edit; selected occurrence's Space; until then reversed only by another Edit | → ED-74 |

## 4. Items received from other traces

### From `trace/maps-and-graphs.md`

| Item | Disposition |
|---|---|
| 0013s "no edit mode" | → ED-36 |
| R40 and 0084 "no `move` draft" | → ED-25 |
| 0084 "reversing an Edit reverses all of it" | → ED-74 |
| Old contract Undo note (DEC 5) | → ED-74 |
| 0091 atomic multi-Space commit | → ED-55 |
| 0112 Undo/Redo per occurrence | → ED-74, ED-75 |

### From `trace/navigation.md`

| Item | Disposition |
|---|---|
| 0035 r4 session and authoring side | → ED-1 |
| 0035 r9 replacement | → ED-28 |
| 0042 r8 drafts cancel, surfaces close | → ED-30 |
| 0068 r18 persistence statuses; the `refused` status Exit warns on | → statuses table, ED-48. Exit itself stays in NV |
| 0126 authoring withdrawal, exclusivity, upload and measurement timeouts | → ED-68, ED-71, ED-72. Navigation held and pan and zoom stay in NV-50 |
| 0042 r8 canvas focus after replacement (listed in NV's sends; addressed to UI) | not ED's: sent → UI |

### From `trace/rendering.md`

| Item | Disposition |
|---|---|
| 0035 r2 the adapter installs, then reports a completed fact | → ED-3 |
| 0042 r1 drafts local | → ED-24 |
| 0042 r8 epoch | → ED-30 |
| 0042 r11 replacement in every target-bound interaction | folded → ED-30; checklist item sent → PROC |
| 0057 r3 outcome side (an accepted Edit closes its surface without waiting) | → ED-13 |
| G§b2 lifecycle: render adapter authority; `queued` at the React Flow seam is an invariant | → ED-3, ED-9 |
| G§b4 structured refusal across Edge Authoring | folded → ED-17, ED-22 |
| G§b5 the epoch side of draft invalidation | folded → ED-30 |
| G§RF b4 an invariant from a canvas gesture is reported, not thrown | → ED-79 (undecided, C3: the code throws for a failed derivation) |

### From `trace/space-and-resources.md`

| Item | Disposition |
|---|---|
| 0074 and DEC 5 Undo | → ED-74 |
| 0112 Undo per occurrence | → ED-74 |
| 0112 and 0126 navigation and authoring held during image replacement; 2-minute upload and 10-second measurement bounds | → ED-68, ED-72; navigation → NV-50 |
| 0113 availability | folded → ED-33 |
| E&P line 37 coordination, barrier, recovery refusals | → ED-54–ED-61 |
| E&P line 37 initialization order | sent back → SR (SR-61); ED-60 points there. Bounced; SR owns it |
| ARC universal guard | → ED-19, ED-20 |
| 0068 r16–r18 statuses | → statuses table; switching and Exit stay in NV |

### From `trace/storage.md`

| Item | Disposition |
|---|---|
| 0010 r4 a Space is never the mutable edit buffer | → ED-1; storage.md points to it. Bounced; ED owns it |
| 0030 r2 automatic persistence, no Save | → ED-7 |
| 0057 r1–r2, r4–r5, r8 | → ED-15, ED-41, ED-44 |
| 0098 r2, r6 transport failures and their classification | sent back → ST (ST-101, ST-102); ED-44 points there. Bounced; ST owns them |
| 0131 r1 no mounted availability answer | → ED-40 |
| 0131 r4 persistence reported as any session | → ED-52 |
| The guide's session, coordination, recovery and lifecycle bullets | → ED-41–ED-67, ED-76, ED-77 (§1 rows EP 37–EP 41) |
| The session side of the 1 MiB save | → ED-47 |

### From `trace/ui.md`

| Item | Disposition |
|---|---|
| 0042 r1–r3, r5, r6, r7, r9, r10; replacement epoch | → ED-24, ED-13, ED-12, ED-14, ED-15, ED-17, ED-16, ED-8, ED-42, ED-45, ED-46, ED-49, ED-27, ED-28, ED-31, ED-29, ED-30. The focus clauses of r5 and r6 return to UI (UI-90, UI-93) |
| 0057 r1, r2, r4, r5, r8; an accepted Edit closes its surface without waiting | → ED-15, ED-41, ED-44, ED-13 |
| 0057 r7 a 409 may carry the current Space | sent → ST: wire shape |
| Availability as a definition (UI-31 points to it) | → ED-33–ED-40 |
| "No undo" lines in 0048, 0074 and `DeleteConfirmation.tsx` (DEC 5) | → ED-74. The confirmation's wording stays UI's |
| G15 refusal-cascade pointer | → ED-19–ED-23 |

## 5. Sent to other docs

**space-and-resources.md (SR):**
- EP 37 initialization order: a link initializes its target only after the containing Space's own checks pass, so a refused link initializes nothing and mints no id (sent back; now SR-61).
- EP 5, 0070: Reference Target immutable (`reference-target-immutable`).
- CAS per-action checks and codes for Resource and Space Edits (`edited-resource`, `created-resource`, `created-reference`, `deleted-resource`, `renamed-space`), including `image-url-unsupported`, which has no row.
- EP 37: zero-reference cascade; convergence; `referenceableSpaces` and `target` reads; selection resolved by the lifecycle; `space-resource-target-unavailable`; `space-resource-deletion-unsupported`.
- EP 38: a Space Resource's selection is durable; the dangling-reference intake codes.
- 0089: Space Resource placement does not await its commit; a refused creation removes it.
- 0063 r1, 0120, 0128 (kind model).

**maps-and-graphs.md (MG):**
- CAS per-action checks and codes for Map-entry, connection, Graph and Map Edits, with their order (the `map-not-found` in `renamed-map` is an action check). The Edge Title Edits read the stored Edge.
- EP 37 framing on relocation (held by MG-15, MG-55); 0091 relocation; 0068 r10 second half (MG-80).
- EP 26, EP 28, EP 50.

**storage.md (ST):**
- 0098 r2, r6: transport failures and their classification (now ST-101, ST-102).
- EP 9–19, 25, 27, 32–36, 38 (round trip, fixtures): file format, intake (with the M2 correction that `loadSpaceSnapshot` also mints a Space), repository, locks, export, reader, mount.
- 0057 r5 shape and `ProtocolFault` (ST-102), r6, r7; the 1 MiB request limit (ST-77).
- 0030 except r2; every EP-only ADR listed in §3; 0131 r2, r3, r5; 0132 and DEC 4.
- Export status (ST-103): the session's `changedSinceExport` derives from acknowledged revisions (`persistence/test/session.test.ts` › "derives export status only from acknowledged durable revisions").

**ui.md (UI):**
- 0048 r1–r4; 0064 r3, r4, r6, r7; 0065 r5; 0083 Title keys.
- 0057 r3: wording, field attribution and recovery controls for refusals and persistence failures.
- The persistence indicator's words; `PersistenceNotice` with Retry and Open; the conflict dialog; the mounted Dock mark (0131 r4, 0132).
- Focus after a replacement (0042 r8; open: `.scratch/interaction-draft-invalidation/issues/03-focus-after-space-replacement.md`).
- The delete confirmation and its "no undo" wording, which must change with DEC 5.
- 0112 one notice area; CAS Edge toolbar alert region.
- 0042 r5, r6 focus: a refusal keeps focus (UI-90); no persistence status moves focus (UI-93, which replaces ED-50).

**navigation.md (NV):**
- 0035 r4, r9 navigation side: Navigation holds no second Space; a replacement reopens at `defaultMap` with no traversal.
- 0042 r8: selection and Traversal history clear on replacement.
- EP 46: presenting continues only while the adopted Graph holds the presented Resource.
- 0068 r16, r18 and EP 39: switching waits for an in-flight commit; Exit refuses on `failed`/`conflicted` and on a size rejection or blocked recovery (`canRetry`), warns on `rejected` and `refused`.
- EP 39: opening a Space with a live session uses that session.
- 0126 r2: pan and zoom stay during an image replacement (NV-50).

**rendering.md (RD):**
- 0035 r8: the adapter owns pointer attempts, transient node state, measurements and visual selection.

**CONTEXT.md (GL):**
- EP 27 `manifest`; EP 35 "Aggregate". CONTEXT.md's "Activating is not itself an edit" and "replacement epoch" entries should be checked against DEC 1 and C1.

**PROC:**
- EP 9 rename process; EP 10 Prisma workaround; EP 45 test-level split (domain tests assert codes, presentation tests prose); EP 49 `returnValue` lint; 0042 r11 acceptance-case checklist item; 0109.

## 6. Code only (no source; drafting rule 5)

- ED-21: applying guard 2 to every drawn completion. `graph-not-owned` itself is a source rule for Edge and Graph actions (CAS).
- ED-51: the leave guard also stands while an image replacement runs.

## 7. Code notes (not requirements)

- **The install window** (`installTogether` in `app/src/space-authoring.ts`) counts depth and publishes in `finally`. A boolean gate would be cleared by an inner window and publish part-way states. Restoring totality means making the sequence total, not adding a `catch`.
- **`submit` decides from `state.working`.** Do not replace this with a guard scoped to one call's publication: `retry` and `resolveConflict` publish `pending` from inside an optimistic publication (`persistence/src/session.ts`).
- **`map-required`** is declared in `AuthoringRefusal` and has copy, but nothing raises it.
- **Map resolution** lives in one module, `app/src/map-resolution.ts`, with five exports and no wrapper type.
- **The lifecycle's application surface** is `createSpaceResourceLifecycle` (`app/src/space-resource-lifecycle.ts`), composed once by `createOpenSpaces` and required on every `OpenSpace`.
- **The space-authoring comment on Rename Space** cites "Activating a Graph is not an Edit (ADR 0028)". DEC 1 reverses that; the code changes with MG-45.
- **Exclusivity keeps one control drawn.** During a replacement `authoringAvailability` keeps `embeddedMapEdit` (the Edit control of an Open Space Resource) drawn while the embedding it would edit is withdrawn.
