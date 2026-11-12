# Trace: Maps and Graphs

For audit only. Every source rule appears exactly once in §1 or §2, with one of four dispositions:
- **→ MG-n**: kept.
- **folded → MG-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§3 groups the sends by receiving doc, so each doc can check them off. §4 holds code notes.

Abbreviations:
- "R" and "A" are ids in the old contract `docs/adr/archive/agent-guides/maps-and-graphs.md`.
- "rN" is the Nth rule of an ADR as numbered in the mapping tables.
- "DEC n" is ruling n in `../DECISIONS.md`.
- Docs: SR is space-and-resources.md, ED editing.md, ST storage.md, RD rendering.md, UI ui.md, NV navigation.md, GL `CONTEXT.md`, PROC is process docs (AGENTS.md, workflow.md, anti-slop.md).

The rule ids in `../maps-and-graphs.md` are append-only from this version on.

## 1. Old contract

| Source | Disposition |
|---|---|
| R1 naming (Map is data; "Layout" only in `LayoutStrategy*`) | data/behaviour split → MG-68. Naming sent → GL, PROC (AGENTS.md conventions) |
| R2 only positioned at render | → MG-68 |
| R3 automatic strategies non-addressable; grid kept for the seam | → MG-69. "Non-addressable" dropped: it fenced off a view design that no longer exists. "A change that works for one strategy has leaked" folded → MG-69's Why |
| R4 contract carries positions only, no ports or sections | → MG-70. The negatives are dropped: they fenced off an engine no package has |
| R5 no arranged-result type | folded → MG-70 ("returns one") |
| R6 Auto-arrange | → MG-71. Its implementation note is in §4 |
| R7 never honour a drop point | folded → MG-71 |
| R8 Map is the only canvas context; URL | canvas half → MG-6. URL and obsolete identities sent → NV, ST |
| R9 durable `defaultMap` | → MG-7 |
| R10 canvas Edits write `defaultMap`/`activeGraph`; drawn Edits do not | → MG-79, MG-80. "Choosing a Map writes nothing" sent → NV. Tail ("remembering the last Map viewed would be a new decision") dropped: guidance |
| R11 Add Map | → MG-9 |
| R12 last Map | → MG-13. "Not offered" sent → UI |
| R13 relocation on deletion | → MG-15, MG-55 |
| R14 new Space complete | sent → SR (MG-72 removed: creating a Space is SR's) |
| R15 mapless stored Space valid | → MG-73 |
| R16 first working read initializes | → MG-74. Mounted host sent → ST |
| R17 Maps but no default | → MG-76 |
| R18 which reads initialize; one boundary per context | trigger list → MG-75. "One boundary per context" sent → ST (conflict S1) |
| R19 conflict handling | → MG-77 |
| R20 newness never inferred | → MG-78 |
| R21 Import does not rewrite sources | sent → ST |
| R22 Map owns ordered Graphs; not shared | → MG-34 |
| R23 Edges closed over the Map | → MG-58 |
| R24 Graph id unique in Space | → MG-35 |
| R25 order authored; reorder not built | → MG-38, MG-39 |
| R26 Add Graph | → MG-41 |
| R27 last Graph; deleting the Active Graph | → MG-53 ("not offered" sent → UI). Survivor clause replaced by DEC 2 → MG-54 |
| R28 Map may name its opening Graph; fallback a read; intake rejects dangling | → MG-44 |
| R29 activation is navigation; one concept; emphasis | "One Active Graph, selected = active, never a side effect" → MG-43. "Not an Edit; durable at the next Edit" struck by DEC 1 → MG-45. "Every Graph still drawn" and receding sent → RD |
| R30 empty Graph cannot present | "An empty Graph is valid and may be active" → MG-40. The presentation gate and the control sent → NV (NV-52, built, source 0015 r2) |
| R31 membership = position keys | → MG-3 |
| R32 placement per Map | → MG-5 |
| R33 Add to Map: initial position, Closed, no Edges | → MG-16 |
| R34 Remove from Map | → MG-19 |
| R35 removal moves nobody | folded → MG-26 |
| R36 Delete from Space cascades | → MG-20 |
| R37 size and Open optional, independent | → MG-22, MG-27. "Every reader resolves through `resourceOpen`/`resourceSize`" is in §4 |
| R38 only Resize changes size; Open changes only `open` | → MG-23, MG-27. "Edit on a Closed Resource Opens it first" sent → UI |
| R39 only content kinds Open | → MG-28 |
| R40 Closed Size floor; only Resize displaces; drop exact | → MG-22, MG-26, MG-21. "No `move` draft" sent → ED. Resize preview sent → RD. `Placement.drawn`/`authoredPoint` in §4 |
| R41 one-axis rule | → MG-24 |
| R42 memoryless | → MG-25 |
| R43 one Resize, many Resources | folded → MG-26 |
| R44 resize control | "any kind, Open or Closed" → MG-23. The control, its border and "no keyboard resize" sent → UI |
| Undo note | sent → ED (DEC 5) |
| R45 Shape on the entry | → MG-29 |
| R46 Ur only | → MG-30 |
| R47 optional, default rectangle; writes | → MG-29, MG-31. Resolver note in §4 |
| R48 Shape changes no rect; Title layout; ring | rect half → MG-32. Drawing sent → RD |
| R49 drawn at every size; toolbar at every size; presented rectangle | sent → RD (drawing), UI (toolbar), NV (presented) |
| R50 embedded Map draws Shapes | sent → RD |
| "Treatment without an ADR" line | presentation gate sent → NV. Closed arrival → MG-16. `defaultMap` on Map deletion → MG-14 (ruling C4.2) |
| A1 no Arrangement type | folded → MG-70 |
| A2 prefixed names | sent → GL |
| A3 automatic strategy at render | folded → MG-68 |
| A4 Computed Views dormant | dropped: a fence against a design that no longer exists |
| A5 every import must author a Map | folded → MG-73 |
| A6 read-only first open | folded → MG-74 |
| A7, A8 newness inferred or marked | folded → MG-78 |
| A9 placing a mapless Space's Resources | folded → MG-74 |
| A10 shared Graphs | folded → MG-34 |
| A11 Map-scoped Graph ids | folded → MG-35 |
| A12 seeded optimiser | folded → MG-71 |
| A13 render-time displacement | folded → MG-21, MG-26 |
| A14 recording pushes | folded → MG-25 |
| A15, A16 other axis rules | folded → MG-24 |
| A17 Open changing size | folded → MG-23 |
| A18 activation as an Edit | struck by DEC 1 (MG-45) |
| A19 Shape on the Resource | folded → MG-5 |
| A20 Shape fixed by kind | folded → MG-30 |
| A21 Shape changing the Closed Size | folded → MG-32 |
| A22 open Shape set | folded → MG-29 |
| A23 required Shape | folded → MG-31 |
| A24 kind floors, first-Open sizes | folded → MG-22 (positive "one floor"). The first-Open-size negative is dropped as a fence against a design that no longer exists |
| A25 Ur that Opens | folded → MG-28 |
| A26 magnetic Close | folded → MG-23 |

## 2. ADR rules from the mapping tables (MG-targeted)

| Source | Disposition |
|---|---|
| 0002 r1 Map distinct from its drawing | folded → MG-68 |
| 0002 r2 arranging/rendering seam | folded → MG-69 |
| 0003 r1–2 Graphs independent; no global order | → MG-36 |
| 0003 r3 drawing conflicting Graphs | sent → RD |
| 0004 r1 Edges reference Resources by id; no placement layer | folded → MG-5 |
| 0004 r2 one position per Map; reuse via Reference | → MG-5 |
| 0004 r3 revisit, never unrolled | folded → MG-36 |
| 0004 r4 never add a placement array | folded → MG-5 |
| 0005 r1 no arranged-result type | folded → MG-70 |
| 0005 r2 "arrangement" not a domain term | sent → GL |
| 0007 r1 Graphs only structure; no Edge kinds | → MG-37. Kept as a fence: the association feature is still plausible (0007 r2) |
| 0007 r2 association gets its own name | sent → GL |
| 0014 r1 Map data, strategy behaviour | → MG-68 |
| 0014 r2–3 naming | sent → GL, PROC |
| 0015 r1 mapless stored Space valid | folded → MG-73 |
| 0015 r2 cannot present; Present disabled | sent → NV (see R30) |
| 0018 r1 new Space is one Resource on a starting Map | sent → SR |
| 0018 r2 reads as centred | sent → RD (stored at the origin: sent → SR with R14) |
| 0018 r3 empty repository starts from a new Space named Meta | sent → ST |
| 0028 r1 activation not an Edit | struck by DEC 1 |
| 0028 r2 fallback is a read | → MG-44 |
| 0028 r3 Edit writes resolved `activeGraph` | folded → MG-79 |
| 0028 r4 Add Graph activates | folded → MG-41 |
| 0028 r5 not durable until a later Edit | struck by DEC 1 |
| 0032 r1 set of directed Edges; cycles, self-Edges | → MG-36 |
| 0032 r2 never reject for presentation | folded → MG-36 |
| 0032 r3 presenting owns cycle traversal | sent → NV |
| 0032 r4 duplicate refused at intake; live draw a no-op | intake → MG-60. Live draw no-op struck by ruling C3; MG-61 states the refusal |
| 0032 r5 same pair in two Graphs is two Edges | folded → MG-57 |
| 0032 r6 a Reference is not needed to return | folded → MG-36 |
| 0013s r1 positions authored; no seeded optimiser | folded → MG-71 |
| 0013s r2 opening pointer records intent | folded → MG-7 |
| 0013s r3 no edit mode | sent → ED |
| 0023s r1–3 Edges not steps; need not be connected; presentation does not constrain | folded → MG-36 |
| 0026s r1 one Active Graph; selected = active | → MG-43 |
| 0026s r2 never a side effect | folded → MG-43 |
| 0026s r3 fallback first; must name own Graph | folded → MG-44 |
| 0031s r1 choosing a Map is navigation | sent → NV |
| 0031s r2 `Map N` | → MG-10 |
| 0030 Map ("Layout") ids unique within the Space document | → MG-2 |
| 0101, 0109 the app mints `Map N` and `Graph N` (`titles.ts`) | → MG-10, MG-42. Numbering details: code only (drafting rule 5, ruling C6) |
| 0033 Edge joins the Active Graph; modifier drop makes a Resource and the Edge in one Edit | → MG-62, MG-63 |
| 0033 side not stored; Edge stores `{from,to}` | folded → MG-57 |
| 0033 handles, preview, self-drag, target selected, cancel; the Connect list | sent → RD, UI |
| 0038 r1 one point type | dropped from MG: a type rule. The code inlines `x`/`y` in `LayoutStrategyResource` (§4). Sent → PROC |
| 0038 r2 constrain at intake or split types deliberately | sent → PROC |
| 0040 r1 Space owns Resources and Maps | Maps → MG-1. Resources sent → SR |
| 0040 r2 Map owns members, positions, Graphs | folded → MG-1 |
| 0040 r3 Graph in one Map; endpoints are members | → MG-34, MG-58 |
| 0040 r4 membership = position | → MG-3 |
| 0040 r5 Add to Map | → MG-16 |
| 0040 r6 Remove from Map | → MG-19 |
| 0040 r7 not shared or filtered | folded → MG-34 |
| 0040 r8 `activeGraph` optional, first fallback | → MG-44 |
| 0040 r9 last Graph; first survivor | → MG-53. Survivor replaced by DEC 2 → MG-54 |
| 0040 r10 dangling `activeGraph` rejected | folded → MG-44 |
| 0040 r11 Delete cascades | → MG-20 |
| 0040 r12 Map created with empty Active Graph | folded → MG-9 |
| 0040 r13 Add Graph | → MG-41 |
| 0040 r14 order authored; reorder separate | → MG-38, MG-39 |
| 0040 r15 intake closure | folded → MG-4, MG-58 |
| 0040 r16 duplicated narratives are two Graphs | folded → MG-34 |
| 0041 r2 Graph may be empty, cyclic… | folded → MG-36 |
| 0041 r10 connection authors an Edge in the Active Graph | folded → MG-62. Activation half struck by DEC 1 |
| 0041 r1, r3–9 | sent → GL (r1, r8–9), NV (r3–4), ST (r5–7) |
| 0064 r2 Open/Closed per entry, an Edit | → MG-27 |
| 0068 r7 Space with no Graph | dropped: lapsed (every Map has a Graph) |
| 0068 r8 UI-created Space contents | sent → SR |
| 0068 r20 removing a Space Resource removes its Edges | folded → MG-19 |
| 0068 refuse deleting a selected Map/Graph | dropped: dead under drafting rule 1 (0091 and the code relocate) |
| 0079 Map is the only canvas context | → MG-6 |
| 0079 "a later Edit in that Map may record it as default" | folded → MG-79 (narrowed to "an Edit that writes the canvas Map"; Rename Space writes no Map) |
| 0079 Space Resource selects Map and Graph | sent → SR |
| 0079 `defaultMap` | folded → MG-7 |
| 0079 obsolete identities invalid | sent → ST, NV |
| 0079 strategies distinct; automatic non-addressable | folded → MG-68, MG-69 |
| 0079 only the selected Map's Graphs | folded → MG-6 |
| 0079 first working read initializes | folded → MG-74 |
| 0079 Maps but no default | folded → MG-76 |
| 0079 listing, import, export, reference checks never initialize | → MG-75 |
| 0079 Import never rewrites sources | sent → ST |
| 0079 commits before working; conflict handling | folded → MG-77 |
| 0079 Space Resource Edits need an initialized target | sent → SR |
| 0079 Add Map | folded → MG-9 |
| 0079 last Map | folded → MG-13 |
| 0079 choosing a Map is navigation | sent → NV |
| 0080 constructors create complete | sent → SR |
| 0080 mapless repaired; Resources stay out | folded → MG-74 |
| 0080 Maps but no default | folded → MG-76 |
| 0080 one server-side boundary; which reads repair | reads → MG-75. Boundary sent → ST (S1) |
| 0080 ordinary optimistic commit | folded → MG-77 |
| 0080 never infer newness; no marker | → MG-78 |
| 0083 Space, Map, Graph titles single-line | Map and Graph → MG-8 (bug). Space sent → SR |
| 0084 displacement by the causing Edit | → MG-26 |
| 0084 drawn = stored between Edits | folded → MG-21 |
| 0084 drag authors drop exactly; no `move` draft; dragged Resource displaces nobody | → MG-21, folded → MG-26. "No `move` draft" sent → ED |
| 0084 resize preview only its own rect | sent → RD |
| 0084 `Placement.drawn`/`authoredPoint` must not return | §4 code note |
| 0084 memoryless | folded → MG-25 |
| 0084 application-written positions are authored | folded → MG-17, MG-71 |
| 0084 one Edit many Resources; reversing reverses all | folded → MG-26. Reversal sent → ED |
| 0086 only positioned at render | folded → MG-68 |
| 0086 Auto-arrange is an Edit | folded → MG-71 |
| 0086 positions only | folded → MG-70 |
| 0086 grid kept | folded → MG-69 |
| 0086 elkjs only attached to an Edit; lint ban | folded → MG-71. Lint in §4 |
| 0086 never seed for a drop point | folded → MG-71 |
| 0086 handle rules | sent → RD |
| 0090 duplicate Edge ineligible | → MG-61 (ruling C3) |
| 0091 relocate on Map/Graph deletion | → MG-15, MG-55. Map successor → MG-14 (ruling C4.2). "Resulting surviving Graph" → MG-56 (bug, with DEC 2). Atomic commit sent → ED |
| 0093 one axis, x first, touching clear, memoryless | folded → MG-24, MG-25 |
| 0104 optional one-line Title, never minted, refusals, trim, clear, unchanged | → MG-64 |
| 0104 identity `(from,to)`; duplicate with another Title; find by endpoints | folded → MG-57, MG-60 |
| 0104 `titleHidden` rules; visibility per Edge | → MG-65 |
| 0104 no per-Edge appearance | → MG-66. Kept as a live fence against per-Edge styling |
| 0104 no reconnect; redrawn Edge untitled and appended | → MG-67 |
| 0104 Edge schema strict | sent → ST (strictness). The pointer is in the doc under "Data model" |
| 0104 render id; Edit names; Title not Label; toolbar | sent → RD, code, GL, UI |
| 0104 line 15 drawing an existing Edge changes nothing | struck by ruling C3 (MG-61) |
| 0105 one head shape; set; no none/tail/override | → MG-50. Negatives kept as live fences (0105 leaves them open as future proposals) |
| 0105 optional, absent `arrow`; creation writes `arrow` | folded → MG-50 |
| 0105 choosing current unchanged | → MG-51 |
| 0105 markers, legend, connection preview, menu, vocabulary | sent → RD, UI, GL |
| 0108 Graph id unique in Space; ids repeat across Spaces | → MG-35 |
| 0112 a drawn Map offers every command the canvas Map does | sent → SR |
| 0112 an Edge joins Resources in one Space; refused across drawings | → MG-59. "Refused with wording" sent → UI (UI-77, built; `conflicts/ui.md` C1 closed with no ruling, 12 November 2026) |
| 0112 occurrences, policy, composition lifetime, notices, Undo per occurrence | sent → SR, NV, ED |
| 0116 canvas Edit writes `defaultMap`/`activeGraph` | → MG-79 |
| 0116 drawn Edit leaves them | → MG-80 |
| 0116 Add Graph exception | folded → MG-41, MG-80 |
| 0116 choosing or viewing records nothing | sent → NV |
| 0116 cost note | dropped: describes a cost, not a behaviour |
| 0121 Shape set on the entry; optional; Ur only; writes; changes no rect | → MG-29, MG-30, MG-31, MG-32 |
| 0121 Title layout, glyph, ring, embedded Shapes, presented rectangle, rail | sent → RD, NV, UI |
| 0122 entry fields; size default; no size written on a Resource's behalf | → MG-22 |
| 0122 only Resize changes size; any kind | → MG-23 |
| 0122 one floor | folded → MG-22, MG-82 (a request below the floor is a defect; the control clamp is sent → UI) |
| 0122 `open` default; Open/Close change only drawing | folded → MG-27 |
| 0122 Ur refused | folded → MG-28 |
| 0122 Resize displaces on one axis; nothing else displaces | folded → MG-24, MG-26 |
| 0122 resize control | sent → UI |
| 0122 strict entry; `openSize` refused | sent → ST (strictness) |
| 0129 Presentation Notes Graph | sent → NV |
| 0135 in a Graph = endpoint | → MG-33 |
| 0135 colour and receding | sent → RD |
| DEC 1 switching is an Edit | → MG-45 (bug) |
| Checkpoint 2 ruling C1 | → MG-46 (bug) |
| Checkpoint 2 ruling C2 | → MG-47 (built) |
| Checkpoint 2 ruling C3 | → MG-61 (built) |
| Checkpoint 2 ruling C4.1 | → MG-81 (bug) |
| Checkpoint 2 ruling C4.2 | → MG-14 (bug in the embedded case) |
| Checkpoint 2 ruling C4.3 | → MG-11 (bug) |
| Checkpoint 2 ruling C6 | → MG-10, MG-18, MG-42, MG-48 (built, code only); MG-49 (bug) |
| Checkpoint 2 ruling C7 | → MG-83 (bug), MG-84 (switching to the saved Active Graph is unchanged; bug while MG-45 is unbuilt) |
| Checkpoint 2 ruling C4.3 with the cross-doc audit B1 | MG-11 restated as a drawn Edit of the target that asks guard 1 against nothing, then repoints the Space Resource. MG-9 points to it. ED-20 is to be reworded to match (ED's doc) |
| Checkpoint 2 ruling S1 | sent → ST |
| Checkpoint 2 principle (a canvas Edit records where the author works; nothing else does) | → the opening-writes table under MG-79–MG-83 |
| DEC 2 Delete Graph survivor | → MG-54 (bug), MG-56 (bug, with 0091) |
| DEC 6 Auto-arrange, reorder kept; cross-Space Edges open | → MG-71, MG-39; Open questions |
| **Code only** (drafting rule 5: code plus a test, no contrary source) | MG-10 and MG-42 numbering details, MG-18, MG-48, MG-85 (Add Graph from an Open Space Resource repoints the Space Resource). MG-82's control clamp (tested: `canvas-resource-decoration.test.ts`) |
| `CONTEXT.md` "Completion outcome": a drag returned to its start is unchanged | → MG-83 (ruling C7) |

## 3. Sent to other docs

**space-and-resources.md (SR):**
- R14, 0018 r1, 0068 r8, 0080: a new Space is created complete, holding `Resource 1` Closed at the origin of a starting Map titled `Map 1`, by every creating path (MG-72 removed). Evidence: `graph/test/new-space.test.ts`.
- MG-15, MG-55, MG-56 cross-refer for Space Resource selection.
- 0040 r1 (the Space owns Resources).
- 0079 (a Space Resource selects a Map and Graph; its Edits need an initialized target).
- 0112 (a drawn Map offers every canvas command; occurrences; policy; a drawn Map never contains its own Map; drops on inert Maps refused).
- 0083 (a Space title is single-line).
- Content shown twice is a Reference Resource (cross-ref from MG-5).

**editing.md (ED):**
- 0013s "no edit mode".
- R40 and 0084 "no `move` draft".
- 0084 "reversing an Edit reverses all of it".
- Old contract Undo note (DEC 5).
- 0091 atomic multi-Space commit.
- 0112 Undo/Redo per occurrence.

**storage.md (ST):**
- R16 mounted in-page host.
- R18 and 0080 "one boundary" (conflict S1).
- R21 and 0079 "Import never rewrites sources".
- 0018 r3 (an empty repository starts from Meta).
- 0041 r5–7 (document spelling, minting, no compatibility parser).
- 0079 obsolete identities are invalid input.
- **Strictness:** the Map, the Map entry (0122, "`openSize` refused") and the Edge (0104) reject unknown keys at intake. The MG doc keeps a one-line pointer under "Data model".

**rendering.md (RD):**
- R29 and 0028 "activation is emphasis; every Graph still drawn"; 0135 colour and receding.
- R48–R50, 0121 drawing (Title layout, no glyph, ring, Shapes at every size, embedded Shapes).
- 0003 r3.
- 0018 r2 opening fit.
- 0084 resize preview.
- 0086 handle rules.
- 0033 gesture and preview.
- 0105 markers and legend.
- 0104 render id.

**ui.md (UI):**
- R12, R27: Delete Map and Delete Graph are not offered for the last Map or Graph.
- MG-82: the resize control stops at the Closed Size (`canvas-resource-decoration.ts` `minWidth`).
- 0033 Connect list (new Resource beside the source).
- R38 "Edit on a Closed Resource Opens it first".
- R44 resize control, its border on non-rectangle Shapes, no keyboard resize.
- R49 Shape choice on the toolbar at every size.
- The connection modifier key (MG-63).
- 0105 and 0121 menus.
- 0104 Edge toolbar.
- 0112 wording for a refused cross-drawing connection: received as UI-77 (built). MG-59 points there.
- 0033 target selected after a connection.

**navigation.md (NV):**
- R30, 0015 r2: an empty Graph cannot be presented, and Present is offered disabled. Received as NV-52 (built; source 0015 r2; tested).
- MG-43: the Active Graph also changes by choosing a Map, following a product URL, and presenting.
- R8 URL.
- R10, 0031s, 0079 and 0116 "choosing or viewing a Map writes nothing".
- R30 and 0015 r2 Present control.
- R49 and 0121 "a presented Resource is the rectangle".
- 0032 r3 cycle traversal.
- 0041 r3–4 Traversal history.
- 0129 Presentation Notes.

**CONTEXT.md (GL):**
- **Needed change (ruling C3):** "Edge" says an exact Edge drawn again "changes nothing", and "Edit" lists "drawing an Edge the Graph already holds" among attempts that produce no Edit as if it were silent. Both must say that drawing an Edge the Graph already holds is refused (`edge-already-exists`) and produces no Edit.
- **Needed change (ruling C7):** "Completion outcome" already says a drag returned to where it began is unchanged. Keep it; it now matches MG-83.
- R1, A2, 0014 r2–3, 0005 r2, 0007 r2, 0041 r1, r8–9, 0104 "Title not Label", 0105 vocabulary.

**PROC:**
- R1 and 0014 naming conventions in AGENTS.md.
- 0038 r1–2 point-type guidance.

## 4. Code notes (not requirements)

- **Auto-arrange (MG-71)** is to live in `graph`. Building it moves the render-time engine ban in `eslint.config.js` (the `elkjs` paths and patterns) rather than obeying it.
- **Resolvers.** Every reader resolves an entry's defaults through `resourceOpen`, `resourceSize` and `resourceShape`, and a Graph's head shape through `graphHeadShape` (`@project/core`).
- **`Placement.drawn` and `Placement.authoredPoint`** must not return (0084). MG-21 states the behaviour.
- **One point type (0038).** The code has `MapPosition`, while `LayoutStrategyResource` declares its own `x?`/`y?`. Whether that breaks 0038 is a PROC question.
- **Map `kind`.** Every Map stores `kind: 'positioned'`, the only kind (`core/src/schema.ts` `mapSchema`). This is a format matter for ST.

## 5. Items received from other docs

| From | Item | Landed |
|---|---|---|
| ED trace (CAS per-action rows) | check order for Map-entry, connection, Graph and Map Edits | MG operations index, column "Checks, in order" |
| ED trace | `renamed-map`'s `map-not-found` is an action check, not the guard | operations index, Rename Map row |
| ED trace | an Edge Title Edit checks for a line break before it trims | MG-64 and the Title Edge row |
| ED trace (EP 26, 28, 37, 50; CAS deletion rows) | Graphs as the only structure, cycles, framing on deletion, Resize, unchanged when no successor | already held: MG-37, MG-36, MG-61, MG-15, MG-55, MG-22–MG-26, MG-82, MG-13, MG-53 |
| Cross-doc audit N1 | Switch Graph's unchanged case | MG-84 |
| Cross-doc audit N2 | Add Graph from an Open Space Resource repoints the selection | MG-85 |
| Cross-doc audit N3 | the first working read is a commit, not an Edit | MG-74 wording; operations index |
| Cross-doc audit N8 | MG-22's *Why* asserted "content adapts" | now points to RD-5 (clipped, by ruling Rendering C1) |
| Cross-doc audit, duplicates | MG-47 against SR-46; MG-82 against UI-68 | MG-47 now points to SR-46; MG-82 keeps only the domain half and points to UI-68 |
| Cross-doc audit B4 | MG-61's *Why* named a ui.md sentence that the drag path never shows | narrowed: the reason shows on the Connect list (UI-72); a drag marks the target ineligible |
| Cross-doc audit N7 | RD rules on "no Active Graph" against MG-34/43/44 | not changed here: every Map has a Graph and resolves one Active Graph; RD owns the fix |

